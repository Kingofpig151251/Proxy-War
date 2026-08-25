/**
 * 行動面板：選卡、預算分配、上回合戰報、終局、等待、聊天。
 * 全部資料由 GameStateView 驅動；發送經 store（ClientMsg 協議）。
 */
import { useMemo, useState } from 'react';
import type { CardId, GameStateView, RegionId } from '../../shared/protocol.js';
import { REGION_ORDER } from '../../shared/protocol.js';
import { CARDS, REGIONS } from '../cards.js';
import { store } from '../store.js';
import { useStore } from './useStore.js';
import { EmojiIcon } from './EmojiIcon.tsx';

// ── 選卡 ────────────────────────────────────────────
export function CardPicker({
  treasury,
  frozen,
  cardsLeft,
}: {
  treasury: number;
  frozen: number;
  cardsLeft: CardId[];
}) {
  useStore();
  const [selected, setSelected] = useState<CardId | null>(null);
  const [target, setTarget] = useState<RegionId | null>(null);

  const needsTarget = selected === 'attritionRaid';
  const canSubmit = selected !== null && (!needsTarget || target !== null);

  const submit = () => {
    if (!canSubmit) return;
    store.send({
      type: 'submitCard',
      payload: { card: selected, target: needsTarget ? target! : undefined },
    });
  };
  /** 不出卡也是一種策略：保留國庫 */
  const pass = () => store.send({ type: 'submitCard', payload: { card: null } });

  return (
    <div className="panel card-pick">
      <div className="panel-head">
        <h3>
          <EmojiIcon emoji="🃏" size={20} /> 揀本回合行動卡
        </h3>
        <span className="res">
          國庫 ${treasury}
          {frozen > 0 && ` · <EmojiIcon emoji="🧊" size={16} />凍結 $${frozen}`}
        </span>
      </div>
      <div className="hand">
        {cardsLeft.map((c) => (
          <button
            key={c}
            className={`action-card ${selected === c ? 'selected' : ''}`}
            onClick={() => setSelected(c)}
            title={CARDS[c].desc}
          >
            <span className="ac-icon">{CARDS[c].icon}</span>
            <span className="ac-name">{CARDS[c].name}</span>
            <span className="ac-desc">{CARDS[c].desc}</span>
          </button>
        ))}
        {cardsLeft.length === 0 && (
          <p className="hint">手牌已空——只能以國庫硬拼部署。</p>
        )}
      </div>
      {needsTarget && (
        <div className="target-row">
          突襲目標：
          {REGION_ORDER.map((r) => (
            <label key={r} className={`tgt ${target === r ? 'on' : ''}`}>
              <input
                type="radio"
                name="tgt"
                checked={target === r}
                onChange={() => setTarget(r)}
              />
              {REGIONS[r].name}
            </label>
          ))}
        </div>
      )}
      <div className="panel-actions">
        <button className="primary" disabled={!canSubmit} onClick={submit}>
          確認出卡
        </button>
        <button className="ghost" onClick={pass}>
          不出卡
        </button>
      </div>
      <p className="hint">雙方密選 → 收入結算時同時揭示</p>
    </div>
  );
}

// ── 部署（滑桿分配預算）─────────────────────────────
export function DeployPanel({ treasury }: { treasury: number }) {
  useStore();
  const [alloc, setAlloc] = useState<Record<string, number>>({
    frontier: 0,
    industrial: 0,
    oilfield: 0,
    capital: 0,
  });
  const spent = useMemo(
    () => Object.values(alloc).reduce((a: number, b: number) => a + b, 0),
    [alloc],
  );
  const left = treasury - spent;

  const bump = (r: string, d: number) => {
    if (d > 0 && left < d) return; // 餘款不足
    if (d < 0 && alloc[r] + d < 0) return; // 不可為負
    setAlloc((a) => ({ ...a, [r]: a[r] + d }));
  };

  const confirm = () => {
    // 只送非零項，減少傳輸與後端清理成本
    const clean = Object.fromEntries(Object.entries(alloc).filter(([, v]) => v > 0));
    store.send({ type: 'submitDeploy', payload: { allocations: clean } });
  };

  return (
    <div className="panel deploy">
      <div className="panel-head">
        <h3>
          <EmojiIcon emoji="💰" size={20} /> 分配戰爭預算
        </h3>
        <span className={`res ${left < 0 ? 'neg' : ''}`}>剩餘 ${left}</span>
      </div>
      <div className="alloc-grid">
        {REGION_ORDER.map((r) => (
          <div key={r} className="alloc-row">
            <span className="ar-name">
              {REGIONS[r].icon} {REGIONS[r].name}
              <small>{REGIONS[r].vp}VP</small>
            </span>
            <button onClick={() => bump(r, -5)} disabled={alloc[r] === 0}>−5</button>
            <input
              type="range"
              min={0}
              max={Math.max(treasury, 1)}
              value={alloc[r]}
              onChange={(e) => {
                const nv = Number(e.target.value);
                if (nv - alloc[r] <= left) setAlloc((a) => ({ ...a, [r]: nv }));
              }}
            />
            <button onClick={() => bump(r, 5)} disabled={left < 5}>+5</button>
            <span className="ar-val">${alloc[r]}</span>
          </div>
        ))}
      </div>
      <div className="panel-actions">
        <button className="primary" onClick={confirm} disabled={spent === 0}>
          確認部署 ${spent}
        </button>
      </div>
      <p className="hint">雙方同時揭示——推測對手在各區的投入</p>
    </div>
  );
}

// ── 上回合戰報 ──────────────────────────────────────
export function LastRoundReport({ v }: { v: GameStateView }) {
  const s = v.lastRound;
  if (!s) return null;
  return (
    <div className="panel report">
      <h3>
        <EmojiIcon emoji="📋" size={20} /> 第 {s.round} 回合戰報
      </h3>
      <ul className="formula-list">
        {s.settlements.map((e) => (
          <li key={e.region}>
            <b>{e.region}</b>：藍 {e.blueSpend}→{e.blueEffective} vs 紅 {e.redSpend}→
            {e.redEffective} ——{' '}
            {e.winner ? (
              <EmojiIcon emoji={e.winner === 'blue' ? '🔵' : '🔴'} size={14} />
            ) : (
              <EmojiIcon emoji="⚖️" size={14} />
            )}
            {e.formula.length > 0 && ` (${e.formula.join('; ')})`}
          </li>
        ))}
      </ul>
      {s.endOfRound.map((t, i) => (
        <p key={i} className="hint">{t}</p>
      ))}
    </div>
  );
}

// ── 終局 ────────────────────────────────────────────
export function EndPanel({ v }: { v: GameStateView }) {
  const [b, r] = v.players;
  const win =
    v.winner === 'draw' || v.winner == null
      ? null
      : v.players.find((p) => p.id === v.winner);
  return (
    <div className="panel end-panel">
      <h1>
        {win ? (
          <>
            <EmojiIcon emoji="🏆" size={28} /> {win.name} 勝出！
          </>
        ) : (
          <>
            <EmojiIcon emoji="⚖️" size={28} /> 和局
          </>
        )}
      </h1>
      <p className="reason">{v.winReason}</p>
      <p className="score-line">
        <EmojiIcon emoji="🔵" size={18} /> {b.name} {b.score}VP — {r.score}VP {r.name}{' '}
        <EmojiIcon emoji="🔴" size={18} />
      </p>
      {v.yourSeat !== 'spectator' && (
        <button
          className="primary big"
          onClick={() => store.send({ type: 'playAgain', payload: {} })}
        >
          <EmojiIcon emoji="🔄" size={18} /> 再來一場
        </button>
      )}
    </div>
  );
}

// ── 聊天 ────────────────────────────────────────────
export function ChatBox() {
  const [text, setText] = useState('');
  return (
    <div className="chatbox">
      <input
        value={text}
        placeholder="講兩句……心理戰也是武器"
        maxLength={300}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && text.trim()) {
            store.send({ type: 'chat', payload: { text: text.trim() } });
            setText('');
          }
        }}
      />
    </div>
  );
}
