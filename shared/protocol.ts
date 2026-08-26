/**
 * PROXY WAR v2 — 協議 v2（shared，前後端共用）
 * 規範：camelCase、{type, payload} 信封、無錯字。
 */

// ── 戰區 ─────────────────────────────────────────────
export type RegionId = 'frontier' | 'industrial' | 'oilfield' | 'capital';

export interface RegionDef {
  id: RegionId;
  nameZh: string;
  vp: number;
  income: number;
}

/** 結算揭示序：邊境→首都，高潮留最後 */
export const REGION_ORDER: readonly RegionId[] = [
  'frontier',
  'industrial',
  'oilfield',
  'capital',
] as const;

// ── 行動卡（定案六張）──────────────────────────────────
export type CardId =
  | 'sanctions'
  | 'assetFreeze'
  | 'oilPriceWar'
  | 'warBonds'
  | 'costImposition'
  | 'attritionRaid';

export interface CardDef {
  id: CardId;
  nameZh: string;
  /** 效果生效點（§3.3 定案時序） */
  phase: 'income' | 'reveal' | 'deploy' | 'settlement';
  descZh: string;
}

/** 每場開局全體卡池；每張每場限用一次 */
export const ALL_CARDS: readonly CardId[] = [
  'sanctions',
  'assetFreeze',
  'oilPriceWar',
  'warBonds',
  'costImposition',
  'attritionRaid',
] as const;

// ── 遊戲快照（伺服器→客戶端）───────────────────────────
export type Phase = 'lobby' | 'cardSelect' | 'income' | 'reveal' | 'deploy' | 'settlement' | 'end';

export interface PlayerPublic {
  id: string;
  name: string;
  treasury: number;
  score: number;
  debt: number;
  frozen: number;
  cardsLeft: CardId[];
  /** 只喺結算後先有值 */
  lastDeployed?: Record<RegionId, number>;
  connected: boolean;
}

export interface RegionState {
  region: RegionId;
  controller: string | null; // player id or null=中立
}

export interface SettlementEntry {
  region: RegionId;
  blueSpend: number;
  redSpend: number;
  /** 折減／突襲後有效值＋算式明細（前端動畫用） */
  blueEffective: number;
  redEffective: number;
  formula: string[];
  winner: string | null; // null=平手現任守住
  gainedVp: number;
  outcome: 'capture' | 'defend' | 'flip';
}

export interface RoundSummary {
  round: number;
  incomes: { playerId: string; parts: string[]; total: number }[];
  cardsRevealed: { playerId: string; card: CardId | null }[];
  settlements: SettlementEntry[];
  endOfRound: string[];
}

export interface GameStateView {
  roomCode: string;
  phase: Phase;
  round: number; // 1..4
  decisiveRound: boolean;
  players: PlayerPublic[]; // [blue, red]
  regions: RegionState[];
  /** 你的視角：秘密資訊只會出現在 secret 區 */
  yourSeat: 'blue' | 'red' | 'spectator';
  yourTreasury: number | null;
  yourFrozen: number | null;
  /** 本階段你是否已提交（UI 用） */
  youSubmittedCard?: boolean;
  youSubmittedDeploy?: boolean;
  /** 消耗突襲需要目標區 */
  pendingCardNeedsTarget?: boolean;
  /** 對局中一方斷線進入重連寬限期（UI 顯示倒數） */
  disconnectGrace?: { seat: 'blue' | 'red'; deadline: number };
  lastRound?: RoundSummary;
  winner?: string | null; // 終局：seat 或 null=真和局
  winReason?: string;
}

// ── 大廳（v3）─────────────────────────────────────────
export type LobbyPlayerStatus = 'lobby' | 'queued' | 'playing';

export interface LobbyPlayer {
  username: string;
  elo: number;
  status: LobbyPlayerStatus;
}

export interface LobbyMatch {
  code: string;
  blue: string;
  red: string;
  round: number;
  phase: Phase;
  spectators: number;
}

export interface LobbySnapshot {
  players: LobbyPlayer[];
  matches: LobbyMatch[];
  queueSize: number;
}

// ── 客戶端→伺服器 ─────────────────────────────────────
export type ClientMsg =
  | { type: 'joinLobby'; payload: Record<string, never> }
  | { type: 'queueJoin'; payload: Record<string, never> }
  | { type: 'queueLeave'; payload: Record<string, never> }
  | { type: 'invite'; payload: { to: string } }
  | { type: 'inviteRespond'; payload: { id: string; accept: boolean } }
  | { type: 'spectate'; payload: { code: string } }
  | { type: 'chat'; payload: { text: string } }
  | { type: 'submitCard'; payload: { card: CardId | null; target?: RegionId } }
  | { type: 'submitDeploy'; payload: { allocations: Record<string, number> } }
  | { type: 'playAgain'; payload: Record<string, never> }
  | { type: 'leaveGame'; payload: Record<string, never> };

// ── 伺服器→客戶端 ─────────────────────────────────────
export type ServerMsg =
  | { type: 'lobby'; payload: { snapshot: LobbySnapshot } }
  | { type: 'invited'; payload: { id: string; from: string } }
  | { type: 'inviteResult'; payload: { id: string; accepted: boolean } }
  | { type: 'joined'; payload: { code: string; seat: 'blue' | 'red' } }
  | { type: 'spectating'; payload: { code: string } }
  | { type: 'reconnected'; payload: { seat: 'blue' | 'red'; name: string } }
  | { type: 'error'; payload: { message: string } }
  | { type: 'state'; payload: { view: GameStateView } }
  | { type: 'phaseChanged'; payload: { phase: Phase; round: number } }
  | { type: 'cardsRevealed'; payload: { plays: { playerId: string; card: CardId | null }[] } }
  | { type: 'regionResolved'; payload: { entry: SettlementEntry } }
  | { type: 'roundEnded'; payload: { summary: RoundSummary } }
  | { type: 'gameOver'; payload: { winner: string | null; reason: string } }
  | { type: 'chat'; payload: { from: string; text: string; ts: number } };
