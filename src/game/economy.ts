/**
 * 經濟引擎 — 全純函數，無 I/O、無隨機。DESIGN.md §3.3/§3.4 定案邏輯。
 * 不變式：金錢守恆（除成本強加系統注資）、國庫永不負數。
 */
import type { CardId, RegionId, SettlementEntry } from '../../shared/protocol.js';
import { REGION_ORDER } from '../../shared/protocol.js';
import { CONFIG, REGIONS, CARD_PHASE } from './config.js';

export type Seat = 'blue' | 'red';
export const other = (s: Seat): Seat => (s === 'blue' ? 'red' : 'blue');

export interface PlayerEco {
  treasury: number;
  score: number;
  debt: number;
  frozen: number;
  hand: Set<CardId>;
}

export interface CardPlay {
  card: CardId | null;
  target?: RegionId; // attritionRaid 用
}

export interface DeployAllocations {
  blue: Record<RegionId, number>;
  red: Record<RegionId, number>;
}

// ── §3.4 鎮壓折減 ────────────────────────────────────
/** 現任控制者防守投入折減；攻方全額 */
export function suppressionFactor(regionIncome: number, k: number = CONFIG.suppressionK): number {
  return k / (k + regionIncome);
}

/** 消耗突襲 ×1.5 → 鎮壓折減（§3.4：先突襲後折減） */
export function effectiveValue(
  rawSpend: number,
  region: RegionId,
  opts: { raided?: boolean; isDefendingIncumbent?: boolean },
): { value: number; notes: string[] } {
  const notes: string[] = [];
  let v = rawSpend;
  if (opts.raided) {
    v *= CONFIG.attritionRaid.multiplier;
    notes.push(`突襲 ×${CONFIG.attritionRaid.multiplier}`);
  }
  if (opts.isDefendingIncumbent) {
    const f = suppressionFactor(REGIONS[region].income);
    v *= f;
    notes.push(`鎮壓折減 ×${f.toFixed(2)}`);
  }
  return { value: Math.floor(v), notes };
}

// ── 階段1：收入 ──────────────────────────────────────
export interface IncomeResult {
  total: number;
  parts: string[];
  /** 油價戰目標區（被歸零嗰區）— 記錄用 */
  zeroedRegion?: RegionId;
}

export function computeIncome(
  me: PlayerEco,
  oppPlay: CardPlay,
  myControlled: RegionId[],
): IncomeResult {
  const parts: string[] = [`外援 $${CONFIG.aidPerRound}`];
  let total = CONFIG.aidPerRound;

  let controlled = [...myControlled].sort(
    (a, b) => REGION_ORDER.indexOf(a) - REGION_ORDER.indexOf(b),
  );
  let halved = false;
  let zeroed: RegionId | undefined;

  if (oppPlay.card === 'sanctions') {
    halved = true;
    parts.push('制裁：戰區收入減半');
  }

  if (oppPlay.card === 'oilPriceWar' && controlled.length > 0) {
    // 收入最高；同分取揭示序先者
    let best = controlled[0]!;
    for (const r of controlled.slice(1)) {
      if (REGIONS[r].income > REGIONS[best].income) best = r;
    }
    zeroed = best;
  }

  for (const r of controlled) {
    let inc = REGIONS[r].income;
    if (halved) inc = Math.floor(inc * CONFIG.sanctions.incomeMultiplier);
    if (zeroed === r) inc = 0;
    total += inc;
    parts.push(`${REGIONS[r].nameZh} $${inc}`);
  }

  return { total, parts, zeroedRegion: zeroed };
}

// ── 階段2/3 提交驗證 ─────────────────────────────────
export function validateCardSubmission(
  play: CardPlay,
  player: PlayerEco,
): { ok: true } | { ok: false; reason: string } {
  if (play.card === null) return { ok: true };
  if (!player.hand.has(play.card)) return { ok: false, reason: '卡不在手牌' };
  if (play.card === 'attritionRaid' && !play.target) {
    return { ok: false, reason: '消耗突襲需要指定戰區' };
  }
  if (play.target && !(play.target in REGIONS)) {
    return { ok: false, reason: '非法目標區' };
  }
  return { ok: true };
}

export function validateDeploy(
  alloc: Record<string, number>,
  player: PlayerEco,
): { ok: true; spend: number; clean: Record<RegionId, number> } | { ok: false; reason: string } {
  let spend = 0;
  const clean = {} as Record<RegionId, number>;
  for (const key of Object.keys(alloc)) {
    if (!(key in REGIONS)) return { ok: false, reason: `未知戰區 ${key}` };
    const v = alloc[key]!;
    if (!Number.isInteger(v) || v < 0) return { ok: false, reason: '部署額必須為非負整數' };
    spend += v;
    clean[key as RegionId] = v;
  }
  const available = player.treasury - player.frozen;
  if (spend > available) {
    return { ok: false, reason: `部署總額 ${spend} 超過可用資金 ${available}` };
  }
  return { ok: true, spend, clean };
}

// ── 階段4：結算 ──────────────────────────────────────
export interface SettlementContext {
  plays: Record<Seat, CardPlay>;
  allocations: DeployAllocations;
  controllers: Record<RegionId, Seat | null>;
  round: number; // 1-based
}

export interface RegionResolution {
  entry: SettlementEntry;
  newController: Seat | null;
  vpGain: Record<Seat, number>;
}

export function resolveRegion(
  region: RegionId,
  ctx: SettlementContext,
): RegionResolution {
  const incumbent = ctx.controllers[region];
  const mult = ctx.round === CONFIG.rounds ? 2 : 1;

  const effB = effectiveValue(ctx.allocations.blue[region], region, {
    raided: ctx.plays.blue.card === 'attritionRaid' && ctx.plays.blue.target === region,
    isDefendingIncumbent: incumbent === 'blue',
  });
  const effR = effectiveValue(ctx.allocations.red[region], region, {
    raided: ctx.plays.red.card === 'attritionRaid' && ctx.plays.red.target === region,
    isDefendingIncumbent: incumbent === 'red',
  });

  let winner: string | null = null;
  if (effB.value > effR.value) winner = 'blue';
  else if (effR.value > effB.value) winner = 'red';

  const gainedVp = winner ? REGIONS[region].vp * mult : 0;
  const outcome: SettlementEntry['outcome'] =
    winner === null
      ? 'defend'
      : incumbent === null
        ? 'capture'
        : incumbent === winner
          ? 'defend'
          : 'flip';

  return {
    entry: {
      region,
      blueSpend: ctx.allocations.blue[region],
      redSpend: ctx.allocations.red[region],
      blueEffective: effB.value,
      redEffective: effR.value,
      formula:
        winner === 'blue'
          ? effB.notes.length > 0
            ? effB.notes
            : []
          : winner === 'red'
            ? effR.notes
            : [],
      winner,
      gainedVp,
      outcome,
    },
    newController: winner ? (winner as Seat) : incumbent,
    vpGain: {
      blue: winner === 'blue' ? gainedVp : 0,
      red: winner === 'red' ? gainedVp : 0,
    },
  };
}

export function resolveRoundSettlement(ctx: SettlementContext): {
  entries: SettlementEntry[];
  vpBySeat: Record<Seat, number>;
  newControllers: Record<RegionId, Seat | null>;
} {
  const entries: SettlementEntry[] = [];
  const vpBySeat: Record<Seat, number> = { blue: 0, red: 0 };
  const newControllers = { ...ctx.controllers };

  for (const region of REGION_ORDER) {
    const res = resolveRegion(region, ctx);
    entries.push(res.entry);
    vpBySeat.blue += res.vpGain.blue;
    vpBySeat.red += res.vpGain.red;
    newControllers[region] = res.newController;
  }
  return { entries, vpBySeat, newControllers };
}

// ── 階段5／終局 ─────────────────────────────────────
export function finalScore(p: PlayerEco): { vp: number; penalty: number } {
  const penalty = Math.min(Math.floor(p.debt / CONFIG.debtPenalty.perDebt), CONFIG.debtPenalty.cap);
  return { vp: p.score - penalty, penalty };
}

export function determineWinner(
  blue: PlayerEco,
  red: PlayerEco,
): { winner: Seat | null; reason: string } {
  const b = finalScore(blue);
  const r = finalScore(red);
  if (b.vp !== r.vp) {
    return {
      winner: b.vp > r.vp ? 'blue' : 'red',
      reason: `戰略分 ${b.vp}:${r.vp}${b.penalty ? `（藍債罰 −${b.penalty}）` : ''}${
        r.penalty ? `（紅債罰 −${r.penalty}）` : ''
      }`,
    };
  }
  if (blue.treasury !== red.treasury) {
    const w = blue.treasury > red.treasury ? 'blue' : 'red';
    return {
      winner: w,
      reason: `平分比國庫：$${blue.treasury} vs $${red.treasury}`,
    };
  }
  return { winner: null, reason: '真和局' };
}
