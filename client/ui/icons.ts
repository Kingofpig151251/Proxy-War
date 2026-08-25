/**
 * Icon 映射表 — emoji → SVG icon name（鍵唯一，與 icons.tsx IconName 對齊）。
 */
export const ICON_MAP = {
  // 地區
  '🏔️': 'mountain',
  '🏭': 'factory',
  '⛽': 'droplet',
  '🏰': 'castle',

  // 卡牌
  '📊': 'chart',
  '🧊': 'snowflake',
  '🏛️': 'flag',
  '💸': 'coin',
  '⚔️': 'swords',

  // 玩家
  '🔵': 'dotBlue',
  '🔴': 'dotRed',
  '⚖️': 'scale',
  '👁️': 'eye',
  '⚡': 'zap',
  '🎖️': 'medal',
  '⚠️': 'warn',

  // 遊戲狀態
  '🔄': 'refresh',
  '🎭': 'sparkles',
  '⏳': 'hourglass',

  // 獎勵／狀態
  '🏆': 'trophy',
  '📉': 'trendDown',
  '✅': 'check',
  '❌': 'xCircle',
  '📋': 'doc',

  // 標題
  '⚔': 'sword',
} as const;

export type IconKey = keyof typeof ICON_MAP;
