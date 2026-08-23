/**
 * App — 頂層：連線畫面（含帳號登入/註冊）→ 大廳 → 房間。
 */
import { useCallback, useState, useSyncExternalStore } from 'react';
import { store } from '../store.js';
import { Lobby } from './Lobby.js';
import { GameRoom } from './GameRoom.js';

export function useStore() {
  return useSyncExternalStore(
    useCallback((cb) => store.subscribe(cb), []),
    () => store,
  );
}

export function App() {
  const s = useStore();
  const [name, setName] = useState(sessionStorage.getItem('pw_name') ?? '');
  const [token, setToken] = useState(localStorage.getItem('pw_token') ?? '');
  const [phase, setPhase] = useState<'connect' | 'in'>('connect');

  if (phase === 'connect') {
    return (
      <ConnectScreen
        name={name}
        setName={setName}
        token={token}
        setToken={setToken}
        onEnter={(finalToken, finalName) => {
          sessionStorage.setItem('pw_name', finalName);
          store.connect(finalName, finalToken || null);
          setPhase('in');
        }}
      />
    );
  }

  if (!s.connected) {
    return (
      <div className="center-screen">
        <h1>連線中斷</h1>
        <button onClick={() => location.reload()}>重新整理</button>
      </div>
    );
  }
  return s.screen === 'room' ? <GameRoom /> : <Lobby name={name} />;
}

function ConnectScreen({
  name,
  setName,
  token,
  setToken,
  onEnter,
}: {
  name: string;
  setName: (v: string) => void;
  token: string;
  setToken: (v: string) => void;
  onEnter: (token: string, name: string) => void;
}) {
  const [user, setUser] = useState(localStorage.getItem('pw_user') ?? '');
  const [pass, setPass] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** 有帳號就先認證；否則純訪客 */
  const doAuth = async (mode: 'login' | 'register') => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '失敗');
      localStorage.setItem('pw_token', data.token);
      localStorage.setItem('pw_user', user);
      setToken(data.token);
      if (!name) setName(user);
      setMsg(`✅ ${mode === 'login' ? '登入' : '註冊'}成功——對局會計入排行榜`);
    } catch (e) {
      setMsg(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const guest = () => onEnter(token, name || `訪客${Date.now() % 1000}`);

  return (
    <div className="center-screen">
      <h1 className="title">⚔️ PROXY WAR</h1>
      <p className="subtitle">代・理・戰・爭 — 戰爭經濟學心理博弈</p>

      <div className="panel join-box">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="對內顯示嘅指揮官代號"
          maxLength={24}
        />
        {token && <p className="hint ok">已有帳號憑證，直接進入即計排行榜</p>}
        <button className="primary big" disabled={!name.trim()} onClick={() => onEnter(token, name.trim())}>
          進入戰區 →
        </button>
      </div>

      <details className="panel acct-box" open={!token}>
        <summary>{token ? '帳號（已登入）' : '排行榜需要帳號（可選）'}</summary>
        <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="帳號（3-16 英數）" maxLength={16} />
        <input
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder="密碼（≥8 碼）"
          onKeyDown={(e) => e.key === 'Enter' && user && pass.length >= 8 && !busy && doAuth('login')}
        />
        <div className="btn-row">
          <button disabled={busy || !user || pass.length < 8} onClick={() => doAuth('login')}>
            登入
          </button>
          <button className="ghost" disabled={busy || !user || pass.length < 8} onClick={() => doAuth('register')}>
            註冊新帳號
          </button>
        </div>
        {msg && <p className="hint">{msg}</p>}
        <p className="hint">唔登入都得——訪客照玩，只係唔計排行。</p>
      </details>

      <p className="hint">4 回合 · 4 戰區 · 6 張行動卡 · 虛張聲勢者勝</p>
    </div>
  );
}
