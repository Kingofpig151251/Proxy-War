/**
 * Lobby — 作戰大廳：快速匹配、在線玩家、進行中對局（觀戰）、排行榜。
 * 資料全部由伺服器 lobby 快照驅動；排行另經 /api/leaderboard 拉取。
 */
import { useEffect, useState } from 'react';
import { store } from '../store.js';
import { useStore } from './useStore.js';
import { Icon } from './icons.js';

interface LeaderRow {
  username: string;
  stats: { wins: number; losses: number; draws: number; elo: number };
}

const STATUS_TEXT = { lobby: '閒置', queued: '排隊中', playing: '對局中' } as const;

export function Lobby({ me, onLogout }: { me: string; onLogout: () => void }) {
  const s = useStore();
  const snap = s.lobby;
  const [board, setBoard] = useState<LeaderRow[]>([]);

  useEffect(() => {
    fetch('/api/leaderboard')
      .then((r) => r.json())
      .then((d) => setBoard(d.top ?? []))
      .catch(() => setBoard([]));
  }, [s.lobby]);

  if (!snap) {
    return (
      <div className="center-screen">
        <h1>正在載入大廳……</h1>
      </div>
    );
  }

  const queueToggle = () => {
    if (s.queued) {
      store.send({ type: 'queueLeave', payload: {} });
      s.queued = false;
    } else {
      store.send({ type: 'queueJoin', payload: {} });
      s.queued = true;
    }
  };

  return (
    <div className="lobby">
      <header className="topbar">
        <span className="room-code">
          <Icon name="sword" size={18} /> PROXY WAR
        </span>
        <span className="phase-label">指揮官：{me}</span>
        <button
          className="ghost small"
          onClick={onLogout}
          title="登出並清除本機憑據"
        >
          <Icon name="exit" size={16} /> 登出
        </button>
        <button
          className={s.queued ? 'primary' : ''}
          onClick={queueToggle}
        >
          {s.queued ? (
            <>
              <Icon name="hourglass" size={16} /> 取消匹配（佇列 {snap.queueSize}）
            </>
          ) : (
            <>
              <Icon name="zap" size={16} /> 快速匹配
            </>
          )}
        </button>
      </header>

      {s.invites.length > 0 && (
        <div className="panel invite-tray">
          {s.invites.map((inv) => (
            <div key={inv.id} className="invite-row">
              <Icon name="medal" size={16} /> {inv.from} 邀你對局
              <button
                className="primary"
                onClick={() => {
                  store.send({ type: 'inviteRespond', payload: { id: inv.id, accept: true } });
                  store.invites = store.invites.filter((x) => x.id !== inv.id);
                }}
              >
                接受
              </button>
              <button
                className="ghost"
                onClick={() => {
                  store.send({ type: 'inviteRespond', payload: { id: inv.id, accept: false } });
                  store.invites = store.invites.filter((x) => x.id !== inv.id);
                }}
              >
                婉拒
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="lobby-grid">
        <section className="panel">
          <h3><Icon name="dotBlue" size={18} /> 在線玩家（{snap.players.length}）</h3>
          <ul className="lobby-list">
            {snap.players.map((p) => {
              const isMe = p.username === me;
              const challengeable = p.status === 'lobby' || p.status === 'queued';
              return (
                <li key={p.username} className={isMe ? 'me' : ''}>
                  <span className="lp-name">{p.username}{isMe ? '（你）' : ''}</span>
                  <span className="lp-elo">{p.elo}</span>
                  <span className={`lp-status st-${p.status}`}>{STATUS_TEXT[p.status]}</span>
                  {!isMe && challengeable && (
                    <button
                      className="ghost small"
                      onClick={() => store.send({ type: 'invite', payload: { to: p.username } })}
                    >
                      挑戰
                    </button>
                  )}
                </li>
              );
            })}
            {snap.players.length === 0 && <li className="hint">暫無其他玩家在線</li>}
          </ul>
        </section>

        <section className="panel">
          <h3><Icon name="eye" size={18} /> 進行中對局</h3>
          <ul className="lobby-list">
            {snap.matches.map((m) => (
              <li key={m.code}>
                <span className="lp-name">{m.blue} vs {m.red}</span>
                <span className="lp-elo">R{m.round}</span>
                <span className={`lp-status`}>{m.phase}</span>
                <button
                  className="ghost small"
                  onClick={() => store.send({ type: 'spectate', payload: { code: m.code } })}
                >
                  觀戰
                </button>
              </li>
            ))}
            {snap.matches.length === 0 && <li className="hint">暫無進行中的對局</li>}
          </ul>
        </section>

        <section className="panel">
          <h3><Icon name="trophy" size={18} /> 排行榜</h3>
          <ol className="lobby-list ranked">
            {board.map((row, i) => (
              <li key={row.username}>
                <span className="lp-rank">#{i + 1}</span>
                <span className="lp-name">{row.username}</span>
                <span className="lp-elo">{row.stats.elo}</span>
                <span className="lp-status">
                  {row.stats.wins}勝 {row.stats.losses}負 {row.stats.draws}和
                </span>
              </li>
            ))}
            {board.length === 0 && <li className="hint">尚無紀錄——成為第一位上榜者</li>}
          </ol>
        </section>
      </div>
    </div>
  );
}
