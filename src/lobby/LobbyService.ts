/**
 * LobbyService — 大廳中樞：在線名單、隨機匹配隊列、邀請對局、進行中對局快照。
 * 純記憶體狀態（連線即在線，斷線即除名），不落 DB。
 * 由 ConnectionHub 驅動；玩家身份以 username 為唯一鍵（強制帳號制）。
 */
import type { LobbyMatch, LobbyPlayer, LobbySnapshot } from '../../shared/protocol.js';
import type { RoomManager } from '../game/Room.js';

interface LobbyEntry {
  username: string;
  elo: number;
  /** 所在位置：大廳 / 排隊中 / 對局中（含旁觀不算 playing） */
  status: 'lobby' | 'queued' | 'playing';
  sessionIds: Set<number>;
}

export interface Invite {
  id: string;
  from: string;
  to: string;
  createdAt: number;
}

const INVITE_TTL_MS = 30_000;

export class LobbyService {
  /** username → 條目 */
  private players = new Map<string, LobbyEntry>();
  private queue: string[] = [];
  private invites = new Map<string, Invite>();

  constructor(private manager: RoomManager) {}

  // ── 在線管理 ────────────────────────────────────────
  connect(username: string, elo: number, sessionId: number): void {
    let e = this.players.get(username);
    if (!e) {
      e = { username, elo, status: 'lobby', sessionIds: new Set() };
      this.players.set(username, e);
    }
    e.sessionIds.add(sessionId);
  }

  disconnect(username: string | null, sessionId: number): void {
    if (!username) return;
    const e = this.players.get(username);
    if (!e) return;
    e.sessionIds.delete(sessionId);
    if (e.sessionIds.size > 0) return; // 多開：仍有其他分頁在線
    this.removeFromQueue(username);
    // 清掉此人發出的邀請
    for (const inv of this.invites.values()) {
      if (inv.from === username) this.invites.delete(inv.id);
    }
    this.players.delete(username);
  }

  setStatus(username: string, status: LobbyEntry['status']): void {
    const e = this.players.get(username);
    if (!e) return;
    e.status = status;
    if (status !== 'queued') this.removeFromQueue(username);
  }

  get(username: string): LobbyEntry | null {
    return this.players.get(username) ?? null;
  }

  // ── 匹配隊列 ────────────────────────────────────────
  joinQueue(username: string): void {
    const e = this.players.get(username);
    if (!e || e.status !== 'lobby') return;
    e.status = 'queued';
    this.queue.push(username);
  }

  leaveQueue(username: string): void {
    this.removeFromQueue(username);
    const e = this.players.get(username);
    if (e && e.status === 'queued') e.status = 'lobby';
  }

  private removeFromQueue(username: string): void {
    this.queue = this.queue.filter((u) => u !== username);
  }

  /** 彈出下一個配對成功組合（頭兩個）；無則回 null */
  tryMatch(): [string, string] | null {
    while (this.queue.length >= 2) {
      const blue = this.queue.shift()!;
      const red = this.queue.shift()!;
      const eb = this.players.get(blue);
      const er = this.players.get(red);
      // 防禦：任一方已離線——丟棄無效方，有效方退回隊首繼續配
      if (!eb && !er) continue;
      if (!eb) {
        this.queue.unshift(red);
        continue;
      }
      if (!er) {
        this.queue.unshift(blue);
        continue;
      }
      eb.status = 'playing';
      er.status = 'playing';
      return [blue, red];
    }
    return null;
  }

  // ── 邀請 ────────────────────────────────────────────
  createInvite(from: string, to: string): Invite | null {
    const ef = this.players.get(from);
    const et = this.players.get(to);
    if (!ef || !et || ef.status !== 'lobby' || et.status !== 'lobby') return null;
    this.pruneInvites();
    const id = `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const inv: Invite = { id, from, to, createdAt: Date.now() };
    this.invites.set(id, inv);
    return inv;
  }

  acceptInvite(id: string, byUsername: string): Invite | null {
    const inv = this.invites.get(id);
    if (!inv || inv.to !== byUsername) return null;
    this.invites.delete(id);
    const ef = this.players.get(inv.from);
    const et = this.players.get(byUsername);
    if (!ef || !et || ef.status !== 'lobby' || et.status !== 'lobby') return null;
    ef.status = 'playing';
    et.status = 'playing';
    return inv;
  }

  declineInvite(id: string, byUsername: string): boolean {
    const inv = this.invites.get(id);
    if (!inv || inv.to !== byUsername) return false;
    this.invites.delete(id);
    return true;
  }

  /** 找出發給某人的有效邀請（重連後恢復用）——暫不需要，保留接口 */
  private pruneInvites(): void {
    const now = Date.now();
    for (const inv of this.invites.values()) {
      if (now - inv.createdAt > INVITE_TTL_MS) this.invites.delete(inv.id);
    }
  }

  // ── 快照 ────────────────────────────────────────────
  snapshot(): LobbySnapshot {
    const players: LobbyPlayer[] = Array.from(this.players.values())
      .map((e) => ({ username: e.username, elo: e.elo, status: e.status }))
      .sort((a, b) => a.username.localeCompare(b.username));

    const matches: LobbyMatch[] = this.manager
      .listSummary()
      .filter((r) => r.phase !== 'end')
      .map((r) => ({
        code: r.code,
        blue: r.blue,
        red: r.red,
        round: r.round,
        phase: r.phase,
        spectators: r.spectators,
      }));

    return { players, matches, queueSize: this.queue.length };
  }
}
