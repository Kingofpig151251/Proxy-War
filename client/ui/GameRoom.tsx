/**
 * GameRoom — 牌桌主畫面：對手列、戰區、我方列、行動面板、聊天。
 */
import { useState, useEffect } from 'react';
import type { CardId, GameStateView, Phase, PlayerPublic, RegionId } from '../../shared/protocol.js';
import { REGION_ORDER } from '../../shared/protocol.js';
import { REGIONS } from '../cards.js';
import { store } from '../store.js';
import { useStore } from './useStore.js';
import { useFlashOnChange, useCountUp } from './anim.js';
import { CardPicker, ChatBox, DeployPanel, EndPanel, LastRoundReport } from './panels.js';
import { Icon } from './icons.js';

/** 五段回合 stepper：phase → 步驟序號（income/reveal 併入揭示段顯示） */
const PHASE_STEPS: { key: string; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
  { key: 'cardSelect', label: '選卡', icon: 'cards' },
  { key: 'income', label: '收入', icon: 'coin' },
  { key: 'reveal', label: '揭示', icon: 'sparkles' },
  { key: 'deploy', label: '部署', icon: 'flag' },
  { key: 'settlement', label: '結算', icon: 'scale' },
];

function phaseStepIndex(phase: Phase): number {
  if (phase === 'end') return -1;
  const i = PHASE_STEPS.findIndex((p) => p.key === phase);
  return i === -1 ? 0 : i;
}

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
          <Icon name="sparkles" size={16} /> {s.revealToast}
        </div>
      )}
      <header className="topbar">
        <span className="room-code">房間 {v.roomCode}</span>
        <span className={`round-pill ${v.decisiveRound ? 'decisive' : ''}`}>
          第 {v.round}/4 回合{v.decisiveRound ? (
            <>
              {' '}<Icon name="zap" size={14} />決勝
            </>
          ) : null}
        </span>
        <PhaseStepper phase={v.phase} round={v.round} />
        <button
          className="ghost small"
          onClick={() => {
            store.send({ type: 'playAgain', payload: {} });
          }}
          hidden={v.phase !== 'end'}
        >
          <Icon name="refresh" size={16} /> 再來一場
        </button>
        <button
          className="ghost small"
          onClick={() => {
            store.send({ type: 'leaveGame', payload: {} });
            setTimeout(() => location.reload(), 150);
          }}
        >
          離開
        </button>
      </header>

      <PlayerBar p={red} you={v.yourSeat === 'red'} grace={v.disconnectGrace} />
      <Regions v={v} />
      <PlayerBar p={blue} you={v.yourSeat === 'blue'} grace={v.disconnectGrace} />
      <ActionPanel v={v} />
      {v.yourSeat === 'spectator' ? (
        <div className="spectator-badge">
          <Icon name="eye" size={16} /> 旁觀模式
        </div>
      ) : (
        <ChatBox />
      )}
    </div>
  );
}

/** 寬限倒數：每秒跳動的剩余時間（mm:ss） */
function GraceCountdown({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  return <span className="num">{`${mm}:${ss}`}</span>;
}

function PhaseStepper({ phase, round }: { phase: Phase; round: number }) {
  const cur = phaseStepIndex(phase);
  return (
    <div className="phase-stepper" role="status">
      {PHASE_STEPS.map((step, i) => (
        <div
          key={step.key}
          className={`ps-step ${i === cur ? 'current' : ''} ${i < cur ? 'done' : ''}`}
          aria-current={i === cur ? 'step' : undefined}
        >
          <Icon name={step.icon} size={14} />
          <span>{step.label}</span>
        </div>
      ))}
    </div>
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
          <RegionCell
            key={rid}
            rid={rid}
            cls={cls}
            ctrl={ctrl}
            ctrlName={ctrlName}
          />
        );
      })}
    </div>
  );
}

/** 單一戰區：包 flash hook（控制權變更時邊框閃爍） */
function RegionCell({
  rid,
  cls,
  ctrl,
  ctrlName,
}: {
  rid: RegionId;
  cls: string;
  ctrl: string | null;
  ctrlName: string;
}) {
  const flash = useFlashOnChange(ctrl);
  return (
    <div className={`region ${cls} ${flash}`}>
      <div className="region-icon"><Icon name={REGIONS[rid].icon} size={30} /></div>
      <div className="region-name">{REGIONS[rid].name}</div>
      <div className="region-vp">
        {REGIONS[rid].vp} VP · +${REGIONS[rid].income}/回合
      </div>
      <div className={`controller ${!ctrl ? 'neutral' : ''}`}>
        {!ctrl ? (
          '中立'
        ) : (
          <>
            <Icon name={ctrl === 'blue' ? 'dotBlue' : 'dotRed'} size={16} /> {ctrlName}
          </>
        )}
      </div>
    </div>
  );
}

function PlayerBar({
  p,
  you,
  grace,
}: {
  p: PlayerPublic;
  you: boolean;
  grace?: { seat: 'blue' | 'red'; deadline: number };
}) {
  const treasury = useCountUp(p.treasury);
  const score = useCountUp(p.score);
  return (
    <div className={`player-bar ${p.id === 'blue' ? 'pb-blue' : 'pb-red'} ${you ? 'is-you' : ''}`}>
      <span className="pname">
        <Icon name={p.id === 'blue' ? 'dotBlue' : 'dotRed'} size={16} /> {p.name}
        {you && '（你）'}
        {!p.connected && (
          <span className="dc-warn">
            {' '}
            <Icon name="warn" size={14} /> 斷線
          </span>
        )}
        {grace?.seat === p.id && (
          <span className="grace-pill">
            <Icon name="hourglass" size={14} />
            <GraceCountdown deadline={grace.deadline} />
          </span>
        )}
      </span>
      <span className="stat"><Icon name="coin" size={16} /> ${treasury}</span>
      <span className="stat"><Icon name="trophy" size={16} /> {score}VP</span>
      {p.debt > 0 && (
        <span className="stat debt"><Icon name="trendDown" size={16} /> 債 ${p.debt}</span>
      )}
      {p.frozen > 0 && (
        <span className="stat frozen"><Icon name="snowflake" size={16} /> 凍 ${p.frozen}</span>
      )}
      <span className="cards-left"><Icon name="cards" size={16} />{p.cardsLeft.length}</span>
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
      <h3><Icon name="hourglass" size={20} /> {text}</h3>
    </div>
  );
}
