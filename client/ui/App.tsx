import { useState, useEffect } from 'react';
import { store } from '../store.js';
import { useStore } from './useStore.js';
import { Lobby } from './Lobby.js';
import { GameRoom } from './GameRoom.js';
import { EmojiIcon } from './EmojiIcon.tsx';

export function App() {
  const s = useStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [user, setUser] = useState('');
  const [name, setName] = useState('');
  const [token, setToken] = useState(localStorage.getItem('pw_token') || '');
  /** 提示訊息：字串或 JSX（帶 icon） */
  const [msg, setMsg] = useState<React.ReactNode>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (token) {
      store.send({ type: 'auth', payload: { token } });
    }
  }, [token]);

  useEffect(() => {
    if (s.error) {
      setMsg(s.error);
      setBusy(false);
    }
  }, [s.error]);

  const submit = async () => {
    if (!user || !name) return;
    setMsg('');
    setBusy(true);
    try {
      // 相對路徑經 vite proxy／生產反代轉發，不寫死 host
      const res = await fetch(`/api/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失敗');
      localStorage.setItem('pw_user', user);
      localStorage.setItem('pw_token', data.token);
      setToken(data.token);
      setMsg(
        <>
          <EmojiIcon emoji="✅" size={16} /> {mode === 'login' ? '登入' : '註冊'}成功——對局將計入排行榜
        </>,
      );
    } catch (e) {
      setMsg(
        <>
          <EmojiIcon emoji="❌" size={16} /> {(e as Error).message}
        </>,
      );
    } finally {
      setBusy(false);
    }
  };

  if (s.screen === 'room') {
    return <GameRoom />;
  }

  return (
    <div className="center-screen">
      <h1 className="title">
        <EmojiIcon emoji="⚔" size={32} /> PROXY WAR
      </h1>
      <p className="subtitle">代・理・戰・爭 — 戰爭經濟學心理博弈</p>

      {msg && <div className="toast">{msg}</div>}

      <div className="panel join-box">
        <details open>
          <summary>{mode === 'login' ? '登入' : '註冊'}帳戶</summary>
          <div className="acct-box">
            <input
              placeholder="用戶名"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              disabled={busy}
            />
            <input
              placeholder="顯示名稱"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
            <div className="btn-row">
              <button className="primary" onClick={submit} disabled={busy || !user || !name}>
                {mode === 'login' ? '登入' : '註冊'}
              </button>
              <button className="ghost" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
                切換到{mode === 'login' ? '註冊' : '登入'}
              </button>
            </div>
          </div>
        </details>
        <details>
          <summary>遊覽模式</summary>
          <button
            className="ghost big"
            onClick={() => {
              setToken('guest');
              store.send({ type: 'spectate', payload: {} });
            }}
          >
            <EmojiIcon emoji="👁️" size={20} /> 旁觀對局
          </button>
        </details>
      </div>

      <div className="lobby-actions">
        <Lobby name={name || '匿名玩家'} />
      </div>
    </div>
  );
}
