/**
 * Game — 單場對局狀態機（DESIGN.md §3.3 定案時序）。
 * 回合開始同時密秘選卡 → 收入（插效果）→ 揭示（即時效果）→ 部署 → 結算（鎮壓折減）→ 回合末。
 * 純規則：不觸及 WebSocket、不計時；由 Room 驅動。
 */
import type {
  CardId,
  RegionId,
  RoundSummary,
} from '../../shared/protocol.js';
import { ALL_CARDS, REGION_ORDER } from '../../shared/protocol.js';
import { CONFIG, CARD_PHASE } from './config.js';
import {
  type CardPlay,
  type DeployAllocations,
  type PlayerEco,
  type Seat,
  computeIncome,
  determineWinner,
  other,
  resolveRoundSettlement,
  validateCardSubmission,
  validateDeploy,
} from './economy.js';

export interface PlayerState extends PlayerEco {
  seat: Seat;
  name: string;
  connected: boolean;
  /** 本回合選卡（秘密）；null=未提交，{card:null}=已提交但不出 */
  cardPlay: CardPlay | null;
  deploy: Record<RegionId, number> | null; // 本回合部署（秘密）
}

export class Game {
  readonly players: Record<Seat, PlayerState>;
  controllers: Record<RegionId, Seat | null> = {
    frontier: null,
    industrial: null,
    oilfield: null,
    capital: null,
  };
  round = 0; // 0=未開始；1..CONFIG.rounds
  finished = false;
  winner: Seat | null = null;
  winReason = '';

  private lastSummary: RoundSummary | null = null;
  private incomeLog: RoundSummary['incomes'] = [];

  constructor(blueName: string, redName: string) {
    const mk = (seat: Seat, name: string): PlayerState => ({
      seat,
      name,
      treasury: CONFIG.startTreasury,
      score: 0,
      debt: 0,
      frozen: 0,
      hand: new Set(ALL_CARDS),
      connected: true,
      cardPlay: null,
      deploy: null,
    });
    this.players = { blue: mk('blue', blueName), red: mk('red', redName) };
  }

  // ── 提交：選卡 ──────────────────────────────────────
  submitCard(seat: Seat, play: CardPlay): { ok: true } | { ok: false; reason: string } {
    if (this.finished || this.round === 0) return { ok: false, reason: '對局未進行中' };
    const p = this.players[seat];
    if (p.cardPlay) return { ok: false, reason: '本回合已提交' };
    const v = validateCardSubmission(play, p);
    if (!v.ok) return v;
    p.cardPlay = { ...play };
    return { ok: true };
  }

  // ── 提交：部署 ──────────────────────────────────────
  submitDeploy(
    seat: Seat,
    alloc: Record<string, number>,
  ): { ok: true } | { ok: false; reason: string } {
    if (this.finished || this.round === 0) return { ok: false, reason: '對局未進行中' };
    const p = this.players[seat];
    if (this.phase() !== 'deploy') return { ok: false, reason: '目前不是部署階段' };
    if (p.deploy) return { ok: false, reason: '本回合已提交部署' };
    const v = validateDeploy(alloc, p);
    if (!v.ok) return v;

    // 凍結限制：凍結額不可動用
    if (v.spend > p.treasury - p.frozen) return { ok: false, reason: '資金被凍結' };
    p.deploy = v.clean;
    return { ok: true };
  }

  /** 兩邊都交齊卡（含「不出」）先過收入揭示 */
  bothCardsIn(): boolean {
    return this.players.blue.cardPlay !== null && this.players.red.cardPlay !== null;
  }

  phase(): 'cardSelect' | 'reveal' | 'deploy' | 'settlement' {
    if (this.finished) return 'settlement';
    if (this.round === 0) return 'cardSelect';
    if (!this.bothCardsIn()) return 'cardSelect';
    // 卡交齊：即時過收入/揭示（同步運算），之後等部署
    return 'deploy';
  }

  /**
   * 推進回合：兩邊卡交齊後由 Room 調用一次——結算收入+揭示，
   * 然後等兩邊 submitDeploy，最後 settleRound()。
   */
  beginRoundIfNeeded(): void {
    if (this.round === 0) this.round = 1;
  }

  hasCardPhasePending(): boolean {
    return !this.bothCardsIn();
  }

  /**
   * 收入＋揭示＋即時效果。喺兩邊交齊卡之後、收集部署之前調用一次。
   */
  applyIncomeAndReveal(): void {
    const plays = { blue: this.players.blue.cardPlay!, red: this.players.red.cardPlay! };

    // ── 階段1：收入（制裁／油價戰插效果）──
    for (const seat of ['blue', 'red'] as const) {
      const me = this.players[seat];
      const myRegions = (Object.keys(this.controllers) as RegionId[]).filter(
        (r) => this.controllers[r] === seat,
      );
      const inc = computeIncome(me, plays[other(seat)], myRegions);
      me.treasury += inc.total;
      this.incomeLog.push({ playerId: seat, parts: inc.parts, total: inc.total });
    }

    // ── 階段2：揭示＋即時效果 ──
    for (const seat of ['blue', 'red'] as const) {
      const p = this.players[seat];
      const card = plays[seat].card;
      if (!card) continue;
      p.hand.delete(card);
      if (card === 'warBonds') {
        p.treasury += CONFIG.warBonds.gain;
        p.debt += CONFIG.warBonds.debt;
      }
    }
    for (const seat of ['blue', 'red'] as const) {
      const card = plays[seat].card;
      if (card === 'assetFreeze') {
        const victim = this.players[other(seat)];
        victim.frozen = Math.min(CONFIG.assetFreeze.amount, victim.treasury);
      }
    }
  }

  bothDeploysIn(): boolean {
    return this.players.blue.deploy !== null && this.players.red.deploy !== null;
  }

  /**
   * 部署扣款＋階段4結算＋階段5回合末。兩邊部署交齊後調用。
   * 回傳本回合 summary。
   */
  settleRound(): RoundSummary {
    const plays: Record<Seat, CardPlay> = {
      blue: this.players.blue.cardPlay!,
      red: this.players.red.cardPlay!,
    };

    // 部署一律支付
    const allocations: DeployAllocations = {
      blue: this.players.blue.deploy ?? emptyAlloc(),
      red: this.players.red.deploy ?? emptyAlloc(),
    };
    for (const seat of ['blue', 'red'] as const) {
      const p = this.players[seat];
      let spent = 0;
      for (const r of REGION_ORDER) spent += allocations[seat][r] ?? 0;
      p.treasury -= spent;
      p.frozen = 0; // 回合末解凍
    }

    // 成本強加：部署後→結算前，20% 轉移
    const endOfRound: string[] = [];
    for (const seat of ['blue', 'red'] as const) {
      if (plays[seat].card === 'costImposition') {
        const victim = this.players[other(seat)];
        const victimSpent = sumAlloc(allocations[other(seat)]);
        const steal = Math.floor(CONFIG.costImposition.rate * victimSpent);
        this.players[seat].treasury += steal;
        endOfRound.push(`${seatName(seat)} 成本強加：抽走對手部署額 $${steal}`);
      }
    }

    // ── 階段4：逐區結算（揭示序：邊境→首都）──
    const settlement = resolveRoundSettlement({
      plays,
      allocations,
      controllers: this.controllers,
      round: this.round,
    });
    this.controllers = settlement.newControllers;
    this.players.blue.score += settlement.vpBySeat.blue;
    this.players.red.score += settlement.vpBySeat.red;

    // ── 階段5／終局檢查 ──
    this.lastSummary = {
      round: this.round,
      incomes: this.incomeLog,
      cardsRevealed: [
        { playerId: 'blue', card: plays.blue.card },
        { playerId: 'red', card: plays.red.card },
      ],
      settlements: settlement.entries,
      endOfRound,
    };
    this.incomeLog = [];

    if (this.round >= CONFIG.rounds) {
      this.finished = true;
      const res = determineWinner(this.players.blue, this.players.red);
      this.winner = res.winner;
      this.winReason = res.reason;
    } else {
      this.round += 1;
      this.players.blue.cardPlay = null;
      this.players.red.cardPlay = null;
      this.players.blue.deploy = null;
      this.players.red.deploy = null;
    }

    return this.lastSummary;
  }

  get summary(): RoundSummary | null {
    return this.lastSummary;
  }
}

function emptyAlloc(): Record<RegionId, number> {
  return { frontier: 0, industrial: 0, oilfield: 0, capital: 0 };
}

function sumAlloc(a: Record<RegionId, number>): number {
  let s = 0;
  for (const r of REGION_ORDER) s += a[r] ?? 0;
  return s;
}

function seatName(s: Seat): string {
  return s === 'blue' ? '藍方' : '紅方';
}
