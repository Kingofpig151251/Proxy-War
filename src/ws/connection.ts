/**
 * WS 連線硬化層＋大廳路由：JSON parse 保護、限速、強制帳號、
 * 大廳快照／匹配隊列／邀請對局／觀戰分派。
 */
import type { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../../shared/protocol.js';
import { ALL_CARDS, REGION_ORDER } from '../../shared/protocol.js';
import { RoomManager } from '../game/Room.js';
import { LobbyService } from '../lobby/LobbyService.js';

export interface Session {
  id: number;
  ws: WebSocket;
  /** 強制帳號制：username 即身份；未認證不得進場 */
  username: string;
  elo: number;
  roomCode: string | null;
  alive: boolean;
}

const RATE = { windowMs: 10_000, maxMsgs: 40 };

export class ConnectionHub {
  private nextId = 1;
  private sessions = new Map<number, Session>();

  constructor(
    private manager: RoomManager,
    private lobby: LobbyService,
    /** 回傳 username 與當前 ELO（可異步）；token 無效回 null（拒連） */
    private verifyToken: (
      token: string,
    ) => { username: string; elo: number } | Promise<{ username: string; elo: number }> | null,
  ) {}

  attach(ws: WebSocket, token?: string | null): void {
    const authed = token ? this.verifyToken(token) : null;
    if (!authed) {
      // 未帶有效 token：只允許收一則錯誤即斷
      const reject: ServerMsg = { type: 'error', payload: { message: '需要登入' } };
      ws.send(JSON.stringify(reject));
      ws.close();
      return;
    }

    void Promise.resolve(authed).then((a) => {
      this.registerSession(ws, a.username, a.elo);
    });
  }

  private registerSession(ws: WebSocket, username: string, elo: number): void {
    const session: Session = {
      id: this.nextId++,
      ws,
      username,
      elo,
      roomCode: null,
      alive: true,
    };
    this.sessions.set(session.id, session);

    // 事件處理器一律先行掛載（含重連路徑——不可提前 return 跳過）
    let timestamps: number[] = [];
    ws.on('pong', () => {
      session.alive = true;
    });

    ws.on('message', (data: unknown) => {
      // 限速
      const now = Date.now();
      timestamps = timestamps.filter((t) => now - t < RATE.windowMs);
      if (timestamps.length >= RATE.maxMsgs) {
        this.send(session, { type: 'error', payload: { message: '發送過快，稍候再試' } });
        return;
      }
      timestamps.push(now);

      // 大小限制（64KB）
      let raw: string;
      try {
        const buf = Buffer.isBuffer(data) ? data : Buffer.concat(data as Buffer[]);
        if (buf.length > 64 * 1024) throw new Error('too large');
        raw = buf.toString('utf8');
      } catch {
        this.send(session, { type: 'error', payload: { message: '訊息格式錯誤' } });
        return;
      }

      let msg: unknown;
      try {
        msg = JSON.parse(raw);
      } catch {
        this.send(session, { type: 'error', payload: { message: 'JSON 解析失敗' } });
        return;
      }
      this.handle(session, msg);
    });

    ws.on('close', () => {
      const room = session.roomCode ? this.manager.get(session.roomCode) : null;
      room?.removeConn(session.id);
      this.sessions.delete(session.id);
      this.lobby.disconnect(session.username, session.id);
      this.broadcastLobby();
    });

    // ── 重連認座：帳號在未完成對局中有被保留的座位（寬限期內）即自動歸位 ──
    const target = this.manager.findReservedSeat(username);
    if (target) {
      // 掛進大廳名單（狀態=對局中）：保持多開計數正確，之後離房才不會從名單消失
      this.lobby.connect(username, elo, session.id);
      this.lobby.setStatus(username, 'playing');
      target.room.reattachPlayer(target.seat, {
        conn: wrapConn(session),
        name: username,
        username,
      });
      session.roomCode = target.room.code;
      this.send(session, { type: 'joined', payload: { code: target.room.code, seat: target.seat } });
      return;
    }

    // 同 username 多開：以 session 為單位掛進大廳名單
    this.lobby.connect(session.username, session.elo, session.id);

    // 認證通過：直接送大廳快照
    this.send(session, { type: 'lobby', payload: { snapshot: this.lobby.snapshot() } });
  }

  /** 心跳：清 dead connections */
  heartbeat(): void {
    for (const s of this.sessions.values()) {
      if (!s.alive) {
        s.ws.terminate();
        continue;
      }
      s.alive = false;
      s.ws.ping();
    }
  }

  private send(s: Session, msg: unknown): void {
    if (s.ws.readyState === 1) s.ws.send(JSON.stringify(msg));
  }

  /** 大廳快照廣播給所有不在對局內的連線 */
  broadcastLobby(): void {
    const snap = this.lobby.snapshot();
    for (const s of this.sessions.values()) {
      if (!s.roomCode) this.send(s, { type: 'lobby', payload: { snapshot: snap } });
    }
  }

  /** schema 驗證＋分派 */
  private handle(s: Session, msg: unknown): void {
    if (typeof msg !== 'object' || msg === null || !('type' in msg)) {
      this.send(s, { type: 'error', payload: { message: '訊息缺少 type' } });
      return;
    }
    const m = msg as ClientMsg;
    try {
      switch (m.type) {
        case 'joinLobby': {
          if (s.roomCode) {
            // 離開房間回大廳
            const old = this.manager.get(s.roomCode);
            old?.removeConn(s.id);
            s.roomCode = null;
          }
          this.lobby.setStatus(s.username, 'lobby');
          this.sendLobbyTo(s);
          this.broadcastLobby();
          break;
        }
        case 'queueJoin': {
          if (s.roomCode) return; // 對局中不可排隊
          this.lobby.joinQueue(s.username);
          this.broadcastLobby();
          this.tryStartMatchedGame();
          break;
        }
        case 'queueLeave': {
          this.lobby.leaveQueue(s.username);
          this.broadcastLobby();
          break;
        }
        case 'invite': {
          if (s.roomCode) return;
          const to = String((m.payload as { to?: unknown })?.to ?? '');
          const inv = this.lobby.createInvite(s.username, to);
          if (!inv) {
            this.send(s, { type: 'error', payload: { message: '無法邀請該玩家' } });
            return;
          }
          const target = this.findSessionByUsername(to);
          if (target) {
            this.send(target, { type: 'invited', payload: { id: inv.id, from: inv.from } });
          }
          break;
        }
        case 'inviteRespond': {
          if (s.roomCode) return;
          const p = m.payload as { id?: unknown; accept?: unknown };
          const id = String(p.id ?? '');
          const accept = p.accept === true;
          if (accept) {
            const inv = this.lobby.acceptInvite(id, s.username);
            if (!inv) {
              this.send(s, { type: 'error', payload: { message: '邀請已失效' } });
              return;
            }
            // 開房：受邀者藍方、邀請者紅方（任一方斷線則邀請作廢）
            const sFrom = this.findSessionByUsername(inv.from);
            if (!sFrom) {
              this.send(s, { type: 'error', payload: { message: '對方已離線' } });
              this.lobby.setStatus(inv.from, 'lobby');
              this.lobby.setStatus(s.username, 'lobby');
              return;
            }
            const room = this.manager.create();
            this.seatPlayer(sFrom, room.code, 'red');
            this.seatPlayer(s, room.code, 'blue');
            this.broadcastLobby();
          } else {
            this.lobby.declineInvite(id, s.username);
            this.broadcastLobby();
          }
          break;
        }
        case 'spectate': {
          if (s.roomCode) return;
          const code = String((m.payload as { code?: unknown })?.code ?? '').toUpperCase();
          const room = this.manager.get(code);
          if (!room) {
            this.send(s, { type: 'error', payload: { message: '找不到房間' } });
            return;
          }
          if (!room.addSpectator({ conn: wrapConn(s), name: s.username, username: s.username })) {
            this.send(s, { type: 'error', payload: { message: '旁觀席已滿' } });
            return;
          }
          s.roomCode = room.code;
          this.send(s, { type: 'spectating', payload: { code: room.code } });
          room.pushState();
          this.sendChatBacklog(room, s);
          break;
        }
        case 'chat': {
          const room = s.roomCode ? this.manager.get(s.roomCode) : null;
          if (!room) return;
          const text = String((m.payload as { text?: unknown })?.text ?? '').slice(0, 300).trim();
          if (!text) return;
          room.chat(s.username, text);
          break;
        }
        case 'submitCard': {
          const room = s.roomCode ? this.manager.get(s.roomCode) : null;
          const seat = room?.seatOf(s.id);
          if (!room || !seat) {
            this.send(s, { type: 'error', payload: { message: '你不是玩家' } });
            return;
          }
          const card = (m.payload as { card?: unknown })?.card;
          const target = (m.payload as { target?: unknown })?.target;
          if (card !== null && !(typeof card === 'string' && ALL_CARDS.includes(card as never))) {
            this.send(s, { type: 'error', payload: { message: '非法卡' } });
            return;
          }
          if (
            target !== undefined &&
            !(typeof target === 'string' && REGION_ORDER.includes(target as never))
          ) {
            this.send(s, { type: 'error', payload: { message: '非法目標' } });
            return;
          }
          const r = room.submitCard(seat, card as never, target as never);
          if (!r.ok) this.send(s, { type: 'error', payload: { message: r.reason ?? '提交失敗' } });
          else room.pushState();
          break;
        }
        case 'submitDeploy': {
          const room = s.roomCode ? this.manager.get(s.roomCode) : null;
          const seat = room?.seatOf(s.id);
          if (!room || !seat) {
            this.send(s, { type: 'error', payload: { message: '你不是玩家' } });
            return;
          }
          const alloc = (m.payload as { allocations?: Record<string, unknown> }).allocations;
          if (typeof alloc !== 'object' || alloc === null) {
            this.send(s, { type: 'error', payload: { message: '部署格式錯誤' } });
            return;
          }
          const clean: Record<string, number> = {};
          for (const [k, v] of Object.entries(alloc)) {
            if (typeof v === 'number') clean[k] = v;
          }
          const r = room.submitDeploy(seat, clean);
          if (!r.ok) this.send(s, { type: 'error', payload: { message: r.reason ?? '部署失敗' } });
          else this.broadcastLobby(); // 對局狀態變化 → 快照更新（回合數等）
          break;
        }
        case 'playAgain': {
          const room = s.roomCode ? this.manager.get(s.roomCode) : null;
          if (room?.game.finished) {
            room.rematch();
            this.broadcastLobby();
          }
          break;
        }
        case 'leaveGame': {
          // 主動棄賽（§3.1）：不進寬限期，即時判負；旁觀者／終局者僅脫離房間
          const room = s.roomCode ? this.manager.get(s.roomCode) : null;
          if (!room) return;
          const seat = room.seatOf(s.id);
          if (!room.game.finished) {
            if (seat) room.resignBySeat(seat);
            room.removeConn(s.id);
          }
          s.roomCode = null;
          this.broadcastLobby();
          break;
        }
        default:
          this.send(s, { type: 'error', payload: { message: '未知訊息類型' } });
      }
    } catch (err) {
      this.send(s, {
        type: 'error',
        payload: { message: err instanceof Error ? err.message : '伺服器內部錯誤' },
      });
    }
  }

  // ── 匹配 ────────────────────────────────────────────
  private tryStartMatchedGame(): void {
    for (;;) {
      const pair = this.lobby.tryMatch();
      if (!pair) break;
      const [uBlue, uRed] = pair;
      const sBlue = this.findSessionByUsername(uBlue);
      const sRed = this.findSessionByUsername(uRed);
      if (!sBlue || !sRed) {
        // 其中一方斷線：退回另一位
        this.lobby.setStatus(uBlue === sBlue?.username ? uRed : uBlue, 'lobby');
        continue;
      }
      const room = this.manager.create();
      this.seatPlayer(sBlue, room.code, 'blue');
      this.seatPlayer(sRed, room.code, 'red');
    }
    this.broadcastLobby();
  }

  /** 把 session 放入指定座位（Room 內部座位由 addPlayer 順序決定，這裡用直接 slot 寫入） */
  private seatPlayer(s: Session, code: string, seat: 'blue' | 'red'): void {
    const room = this.manager.get(code)!;
    this.leaveCurrent(s);
    const actual = room.addPlayer({ conn: wrapConn(s), name: s.username, username: s.username });
    s.roomCode = code;
    this.send(s, { type: 'joined', payload: { code, seat: actual ?? seat } });
    room.pushState();
    this.sendChatBacklog(room, s);
  }

  private findSessionByUsername(username: string): Session | null {
    for (const s of this.sessions.values()) {
      if (s.username === username && !s.roomCode) return s;
    }
    return null;
  }

  private sendLobbyTo(s: Session): void {
    this.send(s, { type: 'lobby', payload: { snapshot: this.lobby.snapshot() } });
  }

  private leaveCurrent(s: Session): void {
    if (s.roomCode) {
      const old = this.manager.get(s.roomCode);
      old?.removeConn(s.id);
      s.roomCode = null;
    }
  }

  private sendChatBacklog(room: import('../game/Room.js').Room, s: Session): void {
    for (const c of room.recentChat()) {
      this.send(s, { type: 'chat', payload: c });
    }
  }
}

/** 將 Session 包裝成 Room 需要的 Conn */
function wrapConn(s: Session): import('../game/Room.js').Conn {
  return {
    get id() {
      return s.id;
    },
    send: (msg) => {
      if (s.ws.readyState === 1) s.ws.send(JSON.stringify(msg));
    },
    close: () => s.ws.close(),
  };
}
