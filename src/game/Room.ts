/**
 * Room + RoomManager — 多房間生命週期。
 * 不觸及 WebSocket 傳輸細節（由 connection.ts 擔任 adapter），只處理遊戲流程與廣播。
 */
import type {
  CardId,
  GameStateView,
  Phase,
  PlayerPublic,
  RegionId,
  RoundSummary,
} from '../../shared/protocol.js';
import { REGION_ORDER } from '../../shared/protocol.js';
import { CONFIG } from './config.js';
import { Game } from './Game.js';
import { type CardPlay, type Seat } from './economy.js';
import { recordMatch } from './ranking.js';
import type { UserRepo } from '../auth/userRepo.js';

export interface Conn {
  send(msg: unknown): void;
  close(): void;
  readonly id: number;
}

export interface Member {
  conn: Conn;
  name: string;
  /** 登入用戶名；null=訪客 */
  username: string | null;
}

interface Slot {
  member: Member | null;
}

function emptyViewBase(code: string) {
  return { roomCode: code };
}

export class Room {
  readonly code: string;
  game: Game;
  blue: Slot = { member: null };
  red: Slot = { member: null };
  spectators: Member[] = [];
  createdAt = Date.now();
  /** 對局結束時由 manager 注入（含 repo）；統計失敗不影響遊戲 */
  onGameOver?: (room: Room) => void;
  private incomeAppliedForRound = -1;
  private chatLog: { from: string; text: string; ts: number }[] = [];

  constructor(code: string) {
    this.code = code;
    this.game = new Game('藍方', '紅方');
    this.game.beginRoundIfNeeded();
  }

  get playerCount(): number {
    return (this.blue.member ? 1 : 0) + (this.red.member ? 1 : 0);
  }

  isFull(): boolean {
    return this.playerCount >= 2;
  }

  isEmpty(): boolean {
    return this.playerCount === 0 && this.spectators.length === 0;
  }

  seatOf(connId: number): Seat | null {
    if (this.blue.member?.conn.id === connId) return 'blue';
    if (this.red.member?.conn.id === connId) return 'red';
    return null;
  }

  addPlayer(member: Member): Seat | null {
    if (!this.blue.member) {
      this.blue.member = member;
      this.game.players.blue.name = member.name;
      return 'blue';
    }
    if (!this.red.member) {
      this.red.member = member;
      this.game.players.red.name = member.name;
      return 'red';
    }
    return null;
  }

  addSpectator(member: Member): boolean {
    if (this.spectators.length >= CONFIG.rooms.maxSpectators) return false;
    this.spectators.push(member);
    return true;
  }

  removeConn(connId: number): void {
    const bye = (slot: Slot): boolean => {
      if (slot.member?.conn.id === connId) {
        slot.member = null;
        return true;
      }
      return false;
    };
    const wasPlayer = bye(this.blue) || bye(this.red);
    this.spectators = this.spectators.filter((s) => s.conn.id !== connId);
    if (wasPlayer && !this.game.finished) {
      // 斷線＝棄賽判負（§3.1）
      const loserSeat = this.blue.member === null && this.red.member !== null ? null : null;
      void loserSeat;
      this.resignByDisconnect();
    }
  }

  private resignByDisconnect(): void {
    const g = this.game;
    if (g.finished) return;
    // 哪一方離開即哪一方判負：檢查兩個 slot
    const blueGone = this.blue.member === null;
    const redGone = this.red.member === null;
    if (blueGone === redGone) return; // 無人離開或雙方皆離開——不判定
    g.finished = true;
    g.winner = blueGone ? 'red' : 'blue';
    g.winReason = '對手中斷線，棄賽判負';
  }

  chat(from: string, text: string): void {
    const entry = { from, text, ts: Date.now() };
    this.chatLog.push(entry);
    if (this.chatLog.length > 200) this.chatLog.shift();
    this.broadcast({ type: 'chat', payload: entry });
  }

  recentChat(limit = 50) {
    return this.chatLog.slice(-limit);
  }

  broadcast(msg: unknown): void {
    for (const m of [this.blue.member, this.red.member, ...this.spectators]) {
      m?.conn.send(msg);
    }
  }

  // ── 遊戲動作 ────────────────────────────────────────
  submitCard(seat: Seat, card: CardId | null, target?: RegionId): { ok: boolean; reason?: string } {
    const play: CardPlay = { card, target };
    const r = this.game.submitCard(seat, play);
    if (!r.ok) return r;

    // 對方已交卡且此刻齊備——推進收入揭示
    if (this.game.hasCardPhasePending()) {
      return { ok: true };
    }
    this.applyIncomeRevealIfNeeded();
    return { ok: true };
  }

  private applyIncomeRevealIfNeeded(): void {
    if (this.incomeAppliedForRound === this.game.round) return;
    this.incomeAppliedForRound = this.game.round;
    this.game.applyIncomeAndReveal();

    const plays = [
      { playerId: 'blue', card: this.game.players.blue.cardPlay?.card ?? null },
      { playerId: 'red', card: this.game.players.red.cardPlay?.card ?? null },
    ];
    this.broadcast({ type: 'cardsRevealed', payload: { plays } });
    this.pushState();
  }

  submitDeploy(seat: Seat, alloc: Record<string, number>): { ok: boolean; reason?: string } {
    const r = this.game.submitDeploy(seat, alloc);
    if (!r.ok) return r;
    if (!this.game.bothDeploysIn()) {
      this.pushState();
      return { ok: true };
    }
    this.settle();
    return { ok: true };
  }

  private settle(): void {
    const summary: RoundSummary = this.game.settleRound();
    // 逐區動畫事件（一次性廣播；前端自行排隊播放）
    for (const entry of summary.settlements) {
      this.broadcast({ type: 'regionResolved', payload: { entry } });
    }
    this.broadcast({ type: 'roundEnded', payload: { summary } });
    this.pushState();

    if (this.game.finished) {
      this.broadcast({
        type: 'gameOver',
        payload: { winner: this.game.winner, reason: this.game.winReason },
      });
      this.onGameOver?.(this);
    }
  }

  /** 再來一場（重置 Game；保留座位） */
  rematch(): void {
    const bn = this.blue.member?.name ?? '藍方';
    const rn = this.red.member?.name ?? '紅方';
    this.game = new Game(bn, rn);
    this.game.beginRoundIfNeeded();
    this.incomeAppliedForRound = -1;
    this.broadcast({ type: 'state', payload: { view: this.viewFor(null) } });
  }

  // ── 視圖 ────────────────────────────────────────────
  phaseLabel(): Phase {
    const g = this.game;
    if (g.finished) return 'end';
    if (!g.bothCardsIn()) return 'cardSelect';
    if (!g.bothDeploysIn()) return 'deploy';
    return 'settlement';
  }

  viewFor(connId: number | null): GameStateView {
    const g = this.game;
    const pub = (seat: Seat): PlayerPublic => {
      const p = g.players[seat];
      return {
        id: seat,
        name: p.name,
        treasury: p.treasury,
        score: p.score,
        debt: p.debt,
        frozen: p.frozen,
        cardsLeft: [...p.hand],
        lastDeployed: p.deploy ?? undefined,
        connected: seat === 'blue' ? !!this.blue.member : !!this.red.member,
      };
    };

    const seat = connId === null ? null : this.seatOf(connId);
    const you = seat ? g.players[seat] : null;
    const spectating = seat === null;

    return {
      ...emptyViewBase(this.code),
      phase: this.phaseLabel(),
      round: Math.max(g.round, 1),
      decisiveRound: g.round === CONFIG.rounds,
      players: [pub('blue'), pub('red')],
      regions: REGION_ORDER.map((r) => ({ region: r, controller: this.game.controllers[r] })),
      yourSeat: spectating ? 'spectator' : seat!,
      yourTreasury: you ? you.treasury : null,
      yourFrozen: you ? you.frozen : null,
      youSubmittedCard: you ? you.cardPlay != null : undefined,
      youSubmittedDeploy: you ? you.deploy != null : undefined,
      pendingCardNeedsTarget: false,
      lastRound: g.summary ?? undefined,
      winner: g.finished ? g.winner : undefined,
      winReason: g.winReason || undefined,
    };
  }

  pushState(): void {
    for (const m of [this.blue.member, this.red.member]) {
      m?.conn.send({ type: 'state', payload: { view: this.viewFor(m.conn.id) } });
    }
    for (const s of this.spectators) {
      s.conn.send({ type: 'state', payload: { view: this.viewFor(s.conn.id) } });
    }
  }
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  constructor(private repo: UserRepo | null) {}

  /** 唯一 4 碼房號（去除易混淆字元） */
  private genCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 50; attempt++) {
      let c = '';
      for (let i = 0; i < CONFIG.rooms.codeLen; i++) {
        c += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      if (!this.rooms.has(c)) return c;
    }
    throw new Error('room codes exhausted');
  }

  create(): Room {
    if (this.rooms.size >= CONFIG.rooms.max) throw new Error('房間數已滿');
    const code = this.genCode();
    const room = new Room(code);
    room.onGameOver = (r) => void this.recordStats(r);
    this.rooms.set(code, room);
    return room;
  }

  private async recordStats(room: Room): Promise<void> {
    const repo = this.repo;
    if (!repo) return;
    const bUser = room.blue.member?.username;
    const rUser = room.red.member?.username;
    // 只有登入對登入先入統計
    if (!bUser || !rUser) return;
    try {
      await recordMatch(
        repo,
        { username: bUser },
        { username: rUser },
        room.game.winner,
        room.game.winReason,
      );
    } catch {
      /* 統計失敗不影響遊戲 */
    }
  }

  get(code: string): Room | null {
    return this.rooms.get(code.toUpperCase()) ?? null;
  }

  cleanupEmpty(): void {
    for (const code of Array.from(this.rooms.keys())) {
      const room = this.rooms.get(code)!;
      if (room.isEmpty()) this.rooms.delete(code);
    }
  }

  listSummary() {
    this.cleanupEmpty();
    return Array.from(this.rooms.values()).map((r) => ({
      code: r.code,
      players: r.playerCount,
      spectators: r.spectators.length,
      phase: r.phaseLabel(),
      round: Math.max(r.game.round, 1),
    }));
  }

  get userRepo(): UserRepo | null {
    return this.repo;
  }
}
