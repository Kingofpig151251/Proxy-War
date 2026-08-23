/**
 * WS 客戶端 + 全域狀態 store（極簡：唔引 redux/zustand）。
 */
import type { ClientMsg, GameStateView, ServerMsg } from '../../shared/protocol.js';

export interface ChatEntry {
  from: string;
  text: string;
  ts: number;
}

type Listener = () => void;

class Store {
  connected = false;
  view: GameStateView | null = null;
  chat: ChatEntry[] = [];
  error: string | null = null;
  /** 'idle' 未連｜'lobby' 大廳｜'room' 房內 */
  screen: 'idle' | 'lobby' | 'room' = 'idle';
  revealToast: string | null = null;

  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  connect(name: string, token: string | null): void {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const qs = token ? `?token=${encodeURIComponent(token)}` : '';
    this.ws = new WebSocket(`${proto}//${location.host}/ws${qs}`);
    this.ws.onopen = () => {
      this.connected = true;
      sessionStorage.setItem('pw_name', name);
      this.screen = 'lobby';
      this.emit();
    };
    this.ws.onclose = () => {
      this.connected = false;
      this.screen = 'idle';
      this.view = null;
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
      case 'state':
        this.view = msg.payload.view;
        break;
      case 'joined':
      case 'spectating':
        this.screen = 'room';
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
