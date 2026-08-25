/**
 * Lobby — 作戰大廳：開房 / 加入 / 旁觀。
 */
import { useState } from 'react';
import { store } from '../store.js';
import { useStore } from './useStore.js';
import { EmojiIcon } from './EmojiIcon.tsx';

export function Lobby({ name }: { name: string }) {
  const [code, setCode] = useState('');
  const s = useStore();

  return (
    <div className="center-screen">
      {s.error && <div className="toast error">{s.error}</div>}
      <h1 className="title">作戰大廳</h1>
      <p className="subtitle">指揮官：{name}</p>
      <div className="lobby-actions">
        <button
          className="primary big"
          onClick={() => store.send({ type: 'createRoom', payload: { name } })}
        >
          <EmojiIcon emoji="🎖️" size={20} /> 開新房間
        </button>
        <div className="join-row">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="房號（4碼）"
            maxLength={4}
          />
          <button
            disabled={code.length !== 4}
            onClick={() => store.send({ type: 'joinRoom', payload: { code, name } })}
          >
            加入
          </button>
          <button
            className="ghost"
            disabled={code.length !== 4}
            onClick={() => store.send({ type: 'spectate', payload: { code, name } })}
          >
            旁觀
          </button>
        </div>
      </div>
    </div>
  );
}
