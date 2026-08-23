/**
 * WS 連線硬化層：JSON parse 保護、訊息 schema 驗證、限速、路由。
 */
import type { WebSocket } from 'ws';
import type { ClientMsg } from '../../shared/protocol.js';
import { ALL_CARDS, REGION_ORDER } from '../../shared/protocol.js';
import { RoomManager } from '../game/Room.js';

export interface Session {
  id: number;
  ws: WebSocket;
  name: string;
  username: string | null;
  roomCode: string | null;
  alive: boolean;
}

const RATE = { windowMs: 10_000, maxMsgs: 40 };

export class ConnectionHub {
  private nextId = 1;
  private sessions = new Map<number, Session>();

  constructor(
    private manager: RoomManager,
    private verifyToken: (token: string) => string | null,
  ) {}

  attach(ws: WebSocket, token?: string | null): void {
    const session: Session = {
      id: this.nextId++,
      ws,
      name: `訪客${this.nextId}`,
      username: token ? this.verifyToken(token) : null,
      roomCode: null,
      alive: true,
    };
    this.sessions.set(session.id, session);

    let timestamps: number[] = [];
    ws.on('pong', () => {
      session.alive = true;
    });

    ws.on('message', (data: unknown) => {
      // 限速
      const now = Date.now();
      timestamps = timestamps.filter((t) => now - t < RATE.windowMs);
      if (timestamps.length >= RATE.maxMsgs) {
        this.send(session, { type: 'error', payload: { message: '講嘢太快，冷靜下' } });
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
    });
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

  /** schema 驗證＋分派 */
  private handle(s: Session, msg: unknown): void {
    if (typeof msg !== 'object' || msg === null || !('type' in msg)) {
      this.send(s, { type: 'error', payload: { message: '訊息缺少 type' } });
      return;
    }
    const m = msg as ClientMsg;
    try {
      switch (m.type) {
        case 'createRoom': {
          this.requireName(m.payload?.name);
          s.name = String(m.payload.name).slice(0, 24);
          const room = this.manager.create();
          this.joinAsPlayer(s, room.code);
          break;
        }
        case 'joinRoom': {
          this.requireName(m.payload?.name);
          s.name = String(m.payload.name).slice(0, 24);
          const code = String(m.payload.code ?? '').toUpperCase();
          const room = this.manager.get(code);
          if (!room) {
            this.send(s, { type: 'error', payload: { message: '搵唔到房間' } });
            return;
          }
          this.joinAsPlayer(s, code);
          break;
        }
        case 'spectate': {
          this.requireName(m.payload?.name);
          s.name = String(m.payload.name).slice(0, 24);
          const room = this.manager.get(String(m.payload.code ?? ''));
          if (!room) {
            this.send(s, { type: 'error', payload: { message: '搵唔到房間' } });
            return;
          }
          this.leaveCurrent(s);
          if (!room.addSpectator({ conn: wrapConn(s), name: s.name, username: s.username })) {
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
          room.chat(s.name, text);
          break;
        }
        case 'submitCard': {
          const room = s.roomCode ? this.manager.get(s.roomCode) : null;
          const seat = room?.seatOf(s.id);
          if (!room || !seat) {
            this.send(s, { type: 'error', payload: { message: '你唔係玩家' } });
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
            this.send(s, { type: 'error', payload: { message: '你唔係玩家' } });
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
          break;
        }
        case 'playAgain': {
          const room = s.roomCode ? this.manager.get(s.roomCode) : null;
          if (room?.game.finished) room.rematch();
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

  private requireName(name: unknown): void {
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('需要暱稱');
    }
  }

  private joinAsPlayer(s: Session, code: string): void {
    const room = this.manager.get(code)!;
    this.leaveCurrent(s);
    const seat = room.addPlayer({ conn: wrapConn(s), name: s.name, username: s.username });
    if (!seat) {
      // 額滿→自動轉旁觀
      room.addSpectator({ conn: wrapConn(s), name: s.name, username: s.username });
      s.roomCode = room.code;
      this.send(s, { type: 'spectating', payload: { code: room.code } });
      room.pushState();
      return;
    }
    s.roomCode = room.code;
    this.send(s, { type: 'joined', payload: { code: room.code, seat } });
    room.pushState();
    this.sendChatBacklog(room, s);
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

/** 將 Session 包裝成 Room 需要嘅 Conn */
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
