/**
 * 遊戲數值配置 — DESIGN.md §3 全部參數集中於此。
 * 平衡調整只改呢個檔，測試鎖定行為不變式。
 */
import type { CardId, RegionDef, RegionId } from '../../shared/protocol.js';

export const CONFIG = {
  rounds: 4,
  startTreasury: 100,
  aidPerRound: 20,

  /** §3.4 鎮壓折減強度（防守有效值 = spend × K/(K+regionIncome)；K 越細越難守） */
  suppressionK: 50,

  warBonds: { gain: 40, debt: 40 },
  debtPenalty: { perDebt: 20, cap: 2 },

  sanctions: { incomeMultiplier: 0.5 }, // 對手所有戰區收入減半（外援不受影響）
  oilPriceWar: {},                       // 對手收入最高戰區歸零
  assetFreeze: { amount: 30 },
  costImposition: { rate: 0.2 },
  attritionRaid: { multiplier: 1.5 },

  rooms: { max: 50, maxSpectators: 10, codeLen: 4 },
} as const;

export const REGIONS: Record<RegionId, RegionDef> = {
  capital: { id: 'capital', nameZh: '首都', vp: 3, income: 20 },
  industrial: { id: 'industrial', nameZh: '工業城', vp: 2, income: 30 },
  oilfield: { id: 'oilfield', nameZh: '油田', vp: 2, income: 25 },
  frontier: { id: 'frontier', nameZh: '邊境', vp: 1, income: 10 },
};

export const CARD_PHASE: Record<CardId, 'income' | 'reveal' | 'deploy' | 'settlement'> = {
  sanctions: 'income',
  oilPriceWar: 'income',
  assetFreeze: 'deploy',
  warBonds: 'reveal',
  costImposition: 'settlement',
  attritionRaid: 'settlement',
};
