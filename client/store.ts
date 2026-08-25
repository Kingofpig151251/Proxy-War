/**
 * WS 客戶端 + 全域狀態 store（極簡：不引入 redux/zustand）。
 */
import type { ClientMsg, GameStateView, LobbySnapshot, ServerMsg } from '../shared/protocol.js';

export interface ChatEntry {
  from: string;
  text: string;
  ts: number;
}

export interface InviteEntry {
  id: string;
  from: string;
}

type Listener = () => void;

export type { Store };

class Store {
  connected = false;
  /** connect() 已呼叫但未開／已斷 */
  connecting = false;
  view: GameStateView | null = null;
  chat: ChatEntry[] = [];
  error: string | null = null;
  /** 'connecting' 認證中｜'lobby' 大廳｜'room' 房內 */
  screen: 'connecting' | 'lobby' | 'room' = 'connecting';
  revealToast: string | null = null;
  lobby: LobbySnapshot | null = null;
  invites: InviteEntry[] = [];
  /** 我方排隊中 */
  queued = false;
  me = '';

  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  connect(name: string, token: string): void {
    this.me = name;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const qs = `?token=${encodeURIComponent(token)}`;
    this.ws = new WebSocket(`${proto}//${location.host}/ws${qs}`);
    this.connecting = true;
    this.ws.onopen = () => {
      this.connected = true;
      this.connecting = false;
      sessionStorage.setItem('pw_name', name);
      // 認證由 query param 完成；開啟後等伺服器推 lobby 快照
      this.send({ type: 'joinLobby', payload: {} });
    };
    this.ws.onclose = () => {
      this.connected = false;
      this.connecting = false;
      this.screen = 'connecting';
      this.view = null;
      this.lobby = null;
      this.emit();
    };
    this.ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      this.onServerMsg(msg);
    };
  }

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private onServerMsg(msg: ServerMsg): void {
    switch (msg.type) {
      case 'lobby':
        this.lobby = msg.payload.snapshot;
        if (this.screen !== 'room') this.screen = 'lobby';
        break;
      case 'joined':
      case 'spectating':
        this.screen = 'room';
        this.queued = false;
        break;
      case 'invited':
        this.invites.push({ id: msg.payload.id, from: msg.payload.from });
        break;
      case 'inviteResult':
        if (!msg.payload.accepted) {
          this.error = `${msg.payload.id} 對方婉拒了邀請`;
          setTimeout(() => {
            if (this.error?.includes('婉拒')) {
              this.error = null;
              this.emit();
            }
          }, 4000);
        }
        break;
      case 'state':
        this.view = msg.payload.view;
        break;
      case 'gameOver':
        // 終局畫面保留 view（phase=end），玩家按「再來一場」或「回大廳」
        break;
      case 'chat':
        this.chat.push(msg.payload);
        if (this.chat.length > 200) this.chat.shift();
        break;
      case 'cardsRevealed':
        this.revealToast = msg.payload.plays
          .map((p) => `${p.playerId}: ${p.card ?? '（不出卡）'}`)
          .join('　vs　');
        setTimeout(() => {
          this.revealToast = null;
          this.emit();
        }, 4000);
        break;
      case 'error':
        this.error = msg.payload.message;
        setTimeout(() => {
          if (this.error === msg.payload.message) {
            this.error = null;
            this.emit();
          }
        }, 5000);
        break;
      default:
        break;
    }
    this.emit();
  }
}

export const store = new Store();
