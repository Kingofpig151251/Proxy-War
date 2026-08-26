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
  /** 斷線寬限期：保留的帳號身份（重連時按此認座） */
  reservedUsername: string | null;
  /** 座位被保留的期限（毫秒時間戳）；null=非寬限期 */
  reservedUntil: number | null;
}

function emptyViewBase(code: string) {
  return { roomCode: code };
}

export class Room {
  readonly code: string;
  game: Game;
  blue: Slot = { member: null, reservedUsername: null, reservedUntil: null };
  red: Slot = { member: null, reservedUsername: null, reservedUntil: null };
  spectators: Member[] = [];
  createdAt = Date.now();
  /** 對局結束時由 manager 注入（含 repo）；統計失敗不影響遊戲 */
  onGameOver?: (room: Room) => void;
  private incomeAppliedForRound = -1;
  private chatLog: { from: string; text: string; ts: number }[] = [];
  /** 防止 gameOver 廣播＋統計重複（settle 與棄賽路徑互斥） */
  private overAnnounced = false;

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

  /** 該帳號是否有被保留的座位（寬限期內），有則回傳座位 */
  reservedSeatFor(username: string): Seat | null {
    for (const seat of ['blue', 'red'] as const) {
      const slot = this[seat];
      if (
        !slot.member &&
        slot.reservedUsername === username &&
        slot.reservedUntil !== null &&
        Date.now() < slot.reservedUntil
      ) {
        return seat;
      }
    }
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

  /** 重連：把成員放回其被保留的座位（不檢查空位，調用方先以 reservedSeatFor 確認） */
  reattachPlayer(seat: Seat, member: Member): void {
    const slot = this[seat];
    slot.member = member;
    slot.reservedUsername = null;
    slot.reservedUntil = null;
    this.broadcast({
      type: 'reconnected',
      payload: { seat, name: member.name },
    });
    this.pushState();
  }

  addSpectator(member: Member): boolean {
    if (this.spectators.length >= CONFIG.rooms.maxSpectators) return false;
    this.spectators.push(member);
    return true;
  }

  removeConn(connId: number): void {
    const detach = (slot: Slot): boolean => {
      if (slot.member?.conn.id === connId) {
        slot.member = null;
        return true;
      }
      return false;
    };
    const wasPlayer = detach(this.blue) || detach(this.red);
    this.spectators = this.spectators.filter((s) => s.conn.id !== connId);
    if (wasPlayer && !this.game.finished) {
      // 對局中斷線：進入重連寬限期（§3.1），期滿未歸才判負
      const gone =
        this.blue.member === null && this.blue.reservedUsername === null
          ? 'blue'
          : this.red.member === null && this.red.reservedUsername === null
            ? 'red'
            : null;
      if (gone) this.startGrace(gone);
    }
  }

  /** 開始斷線寬限期：保留座位與帳號，對手收到倒數通知 */
  private startGrace(seat: Seat): void {
    const slot = this[seat];
    slot.reservedUsername = this.game.players[seat].name;
    slot.reservedUntil = Date.now() + CONFIG.rooms.reconnectGraceMs;
    this.pushState();
  }

  /** 主動棄賽（leaveGame）：不進寬限期，即時判負 */
  resignBySeat(seat: Seat): void {
    const g = this.game;
    if (g.finished) return;
    g.finished = true;
    g.winner = seat === 'blue' ? 'red' : 'blue';
    g.winReason = `${g.players[seat].name} 棄賽判負`;
    this.pushState();
    this.announceOver();
  }

  /** 終局廣播＋統計入帳（棄賽／寬限逾時路徑；與 settle() 的正常終局互斥） */
  private announceOver(): void {
    if (this.overAnnounced) return;
    this.overAnnounced = true;
    this.broadcast({
      type: 'gameOver',
      payload: { winner: this.game.winner, reason: this.game.winReason },
    });
    this.onGameOver?.(this);
  }

  /** 心跳驅動：所有房間寬限期檢查，期滿未歸判負 */
  expireGraceIfNeeded(): void {
    const expired = (['blue', 'red'] as const).filter((seat) => {
      const s = this[seat];
      return (
        !s.member &&
        s.reservedUntil !== null &&
        s.reservedUsername !== null &&
        Date.now() >= s.reservedUntil
      );
    });
    for (const seat of expired) {
      const seatName = this.game.players[seat].name;
      this[seat].reservedUsername = null;
      this[seat].reservedUntil = null;
      if (!this.game.finished) {
        this.game.finished = true;
        this.game.winner = seat === 'blue' ? 'red' : 'blue';
        this.game.winReason = `${seatName} 中斷線逾時，棄賽判負`;
      }
    }
    if (expired.length > 0) {
      this.pushState();
      this.announceOver();
    }
  }

  /** 測試輔助：把座位寬限撥為已到期（模擬時間流逝） */
  forceExpireForTest(seat: Seat): void {
    const s = this[seat];
    if (s.reservedUntil !== null) s.reservedUntil = Date.now() - 1;
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
      this.announceOver();
    }
  }

  /** 再來一場（重置 Game；保留座位） */
  rematch(): void {
    const bn = this.blue.member?.name ?? '藍方';
    const rn = this.red.member?.name ?? '紅方';
    this.game = new Game(bn, rn);
    this.game.beginRoundIfNeeded();
    this.incomeAppliedForRound = -1;
    this.overAnnounced = false;
    this.broadcast({ type: 'state', payload: { view: this.viewFor(null) } });
  }

  // ── 視圖 ────────────────────────────────────────
  phaseLabel(): Phase {
    const g = this.game;
    if (g.finished) return 'end';
    if (!g.bothCardsIn()) return 'cardSelect';
    if (!g.bothDeploysIn()) return 'deploy';
    return 'settlement';
  }

  /** 寬限期資訊（無則 undefined） */
  private graceInfo(): { seat: 'blue' | 'red'; deadline: number } | undefined {
    for (const seat of ['blue', 'red'] as const) {
      if (this[seat].reservedUntil !== null && this[seat].reservedUsername !== null) {
        return { seat, deadline: this[seat].reservedUntil! };
      }
    }
    return undefined;
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
      disconnectGrace: this.graceInfo(),
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

  /** 找出帳號在寬限期內被保留的座位（用於斷線重連） */
  findReservedSeat(username: string): { room: Room; seat: 'blue' | 'red' } | null {
    for (const room of this.rooms.values()) {
      if (room.game.finished) continue;
      const seat = room.reservedSeatFor(username);
      if (seat) return { room, seat };
    }
    return null;
  }

  /** 心跳驅動：所有房間寬限期檢查，期滿未歸判負 */
  expireAllGraceTimers(): void {
    for (const room of this.rooms.values()) {
      room.expireGraceIfNeeded();
    }
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
      blue: r.blue.member?.name ?? '',
      red: r.red.member?.name ?? '',
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
