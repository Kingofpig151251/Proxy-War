/**
 * GameRoom — 牌桌主畫面：對手列、戰區、我方列、行動面板、聊天。
 */
import { useState } from 'react';
import type { CardId, GameStateView, Phase, PlayerPublic } from '../../shared/protocol.js';
import { REGION_ORDER } from '../../shared/protocol.js';
import { REGIONS } from '../cards.js';
import { store } from '../store.js';
import { useStore } from './useStore.js';
import { CardPicker, ChatBox, DeployPanel, EndPanel, LastRoundReport } from './panels.js';
import { EmojiIcon } from './EmojiIcon.tsx';

const PHASE_LABEL: Record<Phase, { emoji: string; text: string }> = {
  lobby: { emoji: '🎖️', text: '大廳' },
  cardSelect: { emoji: '🃏', text: '選卡' },
  income: { emoji: '💰', text: '收入' },
  reveal: { emoji: '🎭', text: '揭示' },
  deploy: { emoji: '💰', text: '部署' },
  settlement: { emoji: '⚖️', text: '結算' },
  end: { emoji: '🏁', text: '終局' },
};

export function GameRoom() {
  const s = useStore();
  const v = s.view;
  if (!v) {
    return (
      <div className="center-screen">
        <h1>等待房間狀態……</h1>
      </div>
    );
  }
  const [blue, red] = v.players;
  return (
    <div className="game-root">
      {s.error && <div className="toast error">{s.error}</div>}
      {s.revealToast && (
        <div className="toast reveal">
          <EmojiIcon emoji="🎭" size={16} /> {s.revealToast}
        </div>
      )}
      <header className="topbar">
        <span className="room-code">房間 {v.roomCode}</span>
        <span className={`round-pill ${v.decisiveRound ? 'decisive' : ''}`}>
          第 {v.round}/4 回合{v.decisiveRound ? (
            <>
              {' '}<EmojiIcon emoji="⚡" size={14} />決勝
            </>
          ) : null}
        </span>
        <PhaseLabel phase={v.phase} />
        <button
          className="ghost small"
          onClick={() => {
            store.send({ type: 'playAgain', payload: {} });
          }}
          hidden={v.phase !== 'end'}
        >
          <EmojiIcon emoji="🔄" size={16} /> 再來一場
        </button>
        <button className="ghost small" onClick={() => location.reload()}>
          離開
        </button>
      </header>

      <PlayerBar p={red} you={v.yourSeat === 'red'} />
      <Regions v={v} />
      <PlayerBar p={blue} you={v.yourSeat === 'blue'} />
      <ActionPanel v={v} />
      {v.yourSeat === 'spectator' ? (
        <div className="spectator-badge">
          <EmojiIcon emoji="👁️" size={16} /> 旁觀模式
        </div>
      ) : (
        <ChatBox />
      )}
    </div>
  );
}

function PhaseLabel({ phase }: { phase: Phase }) {
  const info = PHASE_LABEL[phase] ?? { emoji: '⏳', text: phase };
  return (
    <span className="phase-label">
      <EmojiIcon emoji={info.emoji} size={16} /> {info.text}
    </span>
  );
}

function Regions({ v }: { v: GameStateView }) {
  const [blue, red] = v.players;
  return (
    <div className="regions">
      {REGION_ORDER.map((rid) => {
        const st = v.regions.find((r) => r.region === rid);
        const ctrl = st?.controller ?? null;
        const cls = ctrl === 'blue' ? 'ctrl-blue' : ctrl === 'red' ? 'ctrl-red' : '';
        const ctrlName = ctrl === 'blue' ? blue.name : ctrl === 'red' ? red.name : '';
        return (
          <div key={rid} className={`region ${cls}`}>
            <div className="region-icon">{REGIONS[rid].icon}</div>
            <div className="region-name">{REGIONS[rid].name}</div>
            <div className="region-vp">
              {REGIONS[rid].vp} VP · +${REGIONS[rid].income}/回合
            </div>
            <div className={`controller ${!ctrl ? 'neutral' : ''}`}>
              {!ctrl ? (
                '中立'
              ) : (
                <>
                  <EmojiIcon emoji={ctrl === 'blue' ? '🔵' : '🔴'} size={16} /> {ctrlName}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlayerBar({ p, you }: { p: PlayerPublic; you: boolean }) {
  return (
    <div className={`player-bar ${p.id === 'blue' ? 'pb-blue' : 'pb-red'} ${you ? 'is-you' : ''}`}>
      <span className="pname">
        <EmojiIcon emoji={p.id === 'blue' ? '🔵' : '🔴'} size={16} /> {p.name}
        {you && '（你）'}
        {!p.connected && (
          <span className="dc-warn">
            {' '}
            <EmojiIcon emoji="⚠️" size={14} /> 斷線
          </span>
        )}
      </span>
      <span className="stat"><EmojiIcon emoji="💰" size={16} /> ${p.treasury}</span>
      <span className="stat"><EmojiIcon emoji="🏆" size={16} /> {p.score}VP</span>
      {p.debt > 0 && (
        <span className="stat debt"><EmojiIcon emoji="📉" size={16} /> 債 ${p.debt}</span>
      )}
      {p.frozen > 0 && (
        <span className="stat frozen"><EmojiIcon emoji="🧊" size={16} /> 凍 ${p.frozen}</span>
      )}
      <span className="cards-left"><EmojiIcon emoji="🃏" size={16} />{p.cardsLeft.length}</span>
    </div>
  );
}

// ── 行動面板 ────────────────────────────────────────
function ActionPanel({ v }: { v: GameStateView }) {
  if (v.phase === 'end') return <EndPanel v={v} />;
  if (v.yourSeat === 'spectator') return <LastRoundReport v={v} />;

  if (v.phase === 'cardSelect') {
    if (v.youSubmittedCard) return <Waiting text="卡已提交，等待對手……" />;
    return (
      <CardPicker
        treasury={v.yourTreasury ?? 0}
        frozen={v.yourFrozen ?? 0}
        cardsLeft={myCards(v)}
      />
    );
  }
  if (v.phase === 'deploy') {
    if (v.youSubmittedDeploy) return <Waiting text="部署已確認，等待對手……" />;
    // 可用＝國庫 − 凍結
    return (
      <DeployPanel
        treasury={Math.max((v.yourTreasury ?? 0) - (v.yourFrozen ?? 0), 0)}
      />
    );
  }
  // income / reveal / settlement：顯示戰報
  return <LastRoundReport v={v} />;
}

/** 我的手牌＝自己一側的 cardsLeft */
function myCards(v: GameStateView): CardId[] {
  const me = v.players.find((p) => p.id === v.yourSeat);
  return me?.cardsLeft ?? [];
}

function Waiting({ text }: { text: string }) {
  return (
    <div className="panel waiting">
      <h3><EmojiIcon emoji="⏳" size={20} /> {text}</h3>
    </div>
  );
}
