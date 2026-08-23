/**
 * GameRoom — 牌桌主畫面：對手列、戰區、我方列、行動面板、聊天。
 */
import { useEffect, useRef, useState } from 'react';
import type { CardId, GameStateView, PlayerPublic } from '../../shared/protocol.js';
import { CARDS, REGIONS, REGION_ORDER } from '../cards.js';
import { store } from '../store.js';
import { useStore } from './App.js';

export function GameRoom() {
  const s = useStore();
  const v = s.view;
  if (!v) {
    return (
      <div className="center-screen">
        <h1>等待房間狀態…</h1>
      </div>
    );
  }
  const [blue, red] = v.players;
  return (
    <div className="game-root">
      {s.error && <div className="toast error">{s.error}</div>}
      {s.revealToast && <div className="toast reveal">🎭 {s.revealToast}</div>}
      <header className="topbar">
        <span className="room-code">房間 {v.roomCode}</span>
        <span className={`round-pill ${v.decisiveRound ? 'decisive' : ''}`}>
          第 {v.round}/4 回合{v.decisiveRound ? ' ⚡決勝' : ''}
        </span>
        <PhaseLabel phase={v.phase} />
        <button
          className="ghost small"
          onClick={() => {
            store.send({ type: 'playAgain', payload: {} });
          }}
          hidden={v.phase !== 'end'}
        >
          再嚟一場
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
        <div className="spectator-badge">👁️ 旁觀模式</div>
      ) : (
        <ChatBox />
      )}
    </div>
  );
}

function PhaseLabel({ phase }: { phase: GameStateView['phase'] }) {
  const map: Record<string, string> = {
    cardSelect: '🃏 選卡',
    deploy: '💰 部署',
    settlement: '⚖️ 結算',
    end: '🏁 終局',
  };
  return <span className="phase-label">{map[phase] ?? phase}</span>;
}

function Regions({ v }: { v: GameStateView }) {
  const [blue, red] = v.players;
  return (
    <div className="regions">
      {REGION_ORDER.map((rid) => {
        const st = v.regions.find((r) => r.region === rid);
        const ctrl = st?.controller ?? null;
        const cls = ctrl === 'blue' ? 'ctrl-blue' : ctrl === 'red' ? 'ctrl-red' : '';
        return (
          <div key={rid} className={`region ${cls}`}>
            <div className="region-icon">{REGIONS[rid].icon}</div>
            <div className="region-name">{REGIONS[rid].name}</div>
            <div className="region-vp">
              {REGIONS[rid].vp} VP · +${REGIONS[rid].income}/回合
            </div>
            <div className={`controller ${!ctrl ? 'neutral' : ''}`}>
              {!ctrl ? '中立' : ctrl === 'blue' ? `🔵 ${blue.name}` : `🔴 ${red.name}`}
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
        {p.id === 'blue' ? '🔵' : '🔴'} {p.name}
        {you && '（你）'}
        {!p.connected && '⚠️斷線'}
      </span>
      <span className="stat">💰 ${p.treasury}</span>
      <span className="stat">🏆 {p.score}VP</span>
      {p.debt > 0 && <span className="stat debt">📉 債 ${p.debt}</span>}
      {p.frozen > 0 && <span className="stat frozen">🧊 凍 ${p.frozen}</span>}
      <span className="cards-left">🃏{p.cardsLeft.length}</span>
    </div>
  );
}

// ── 行動面板 ────────────────────────────────────────
function ActionPanel({ v }: { v: GameStateView }) {
  if (v.phase === 'end') return <EndPanel v={v} />;
  if (v.yourSeat === 'spectator') return null;

  if (v.phase === 'cardSelect') {
    if (v.youSubmittedCard) return <Waiting text="卡已提交，等對手…" />;
    return (
      <CardPicker
        treasury={v.yourTreasury ?? 0}
        frozen={v.yourFrozen ?? 0}
        cardsLeft={myCards(v)}
      />
    );
  }
  if (v.phase === 'deploy') {
    if (v.youSubmittedDeploy) return <Waiting text="部署已確認，等對手…" />;
    // 可用＝國庫 − 凍結
    return <Deployer treasury={Math.max((v.yourTreasury ?? 0) - (v.yourFrozen ?? 0), 0)} />;
  }
  // settlement / 其他：睇戰報
  return <LastRoundReport v={v} />;
}

/** 我嘅手牌＝自己嗰邊嘅 cardsLeft */
function myCards(v: GameStateView): CardId[] {
  const me = v.players.find((p) => p.id === v.yourSeat);
  return me?.cardsLeft ?? [];
}

function Waiting({ text }: { text: string }) {
  return (
    <div className="panel waiting">
      <h3>⏳ {text}</h3>
    </div>
  );
}
