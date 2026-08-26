import { useState, useEffect } from 'react';
import { store } from '../store.js';
import { useStore } from './useStore.js';
import { Lobby } from './Lobby.js';
import { GameRoom } from './GameRoom.js';
import { Icon } from './icons.js';

type Notice = React.ReactNode;

export function App() {
  const s = useStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [user, setUser] = useState('');
  const [name, setName] = useState('');
  const [token, setToken] = useState(localStorage.getItem('pw_token') || '');
  const [notice, setNotice] = useState<Notice>('');
  const [busy, setBusy] = useState(false);

  /** 取得 token 後即建立 WS 連線（強制帳號制） */
  useEffect(() => {
    if (token && !store.connected && !store.connecting) {
      store.connect(name || user || localStorage.getItem('pw_user') || '指揮官', token);
    }
  }, [token]);

  useEffect(() => {
    if (s.error) {
      setNotice(s.error);
      setBusy(false);
    }
  }, [s.error]);

  const submit = async () => {
    if (!user || !name) return;
    setNotice('');
    setBusy(true);
    try {
      const res = await fetch(`/api/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失敗');
      localStorage.setItem('pw_user', data.user.username);
      localStorage.setItem('pw_token', data.token);
      setToken(data.token);
      setNotice(
        <>
          <Icon name="check" size={16} /> {mode === 'login' ? '登入' : '註冊'}成功，進入大廳
        </>,
      );
    } catch (e) {
      setNotice(
        <>
          <Icon name="xCircle" size={16} /> {(e as Error).message}
        </>,
      );
    } finally {
      setBusy(false);
    }
  };

  /** 一鍵體驗：向伺服器索取唯一訪客帳號（guest_ 前綴），免註冊直進大廳 */
  const quickPlay = async () => {
    setNotice('');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/guest', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '訪客登入不可用');
      localStorage.setItem('pw_user', data.user.username);
      localStorage.setItem('pw_token', data.token);
      setToken(data.token);
    } catch (e) {
      setNotice(
        <>
          <Icon name="xCircle" size={16} /> {(e as Error).message}
        </>,
      );
      setBusy(false);
    }
  };

  if (s.screen === 'room') {
    return <GameRoom />;
  }
  if (s.screen === 'lobby') {
    return <Lobby me={s.me} onLogout={() => store.logout()} />;
  }

  return (
    <div className="center-screen">
      <h1 className="title">
        <Icon name="sword" size={32} /> PROXY WAR
      </h1>
      <p className="subtitle">代・理・戰・爭 — 戰爭經濟學心理博弈</p>

      {notice && <div className="toast">{notice}</div>}
      {s.connecting && <div className="hint">連線中……</div>}

      <button className="primary big" onClick={quickPlay} disabled={busy}>
        <Icon name="zap" size={20} /> 一鍵體驗
      </button>

      <div className="panel join-box">
        <details open>
          <summary>{mode === 'login' ? '登入' : '註冊'}帳戶</summary>
          <div className="acct-box">
            <input
              placeholder="用戶名（3-16 英數底線）"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              disabled={busy}
            />
            <input
              placeholder="密碼（至少 8 位）"
              type="password"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
            <div className="btn-row">
              <button className="primary" onClick={submit} disabled={busy || !user || !name}>
                {mode === 'login' ? '登入' : '註冊'}
              </button>
              <button
                className="ghost"
                onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              >
                切換到{mode === 'login' ? '註冊' : '登入'}
              </button>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
