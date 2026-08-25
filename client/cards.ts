/**
 * 卡牌／地區顯示資料（與 src/game/config.ts、shared/protocol.ts 對齊）。
 */
import type { CardId, RegionId } from '../shared/protocol.js';
import { REGION_ORDER as PROTOCOL_REGION_ORDER } from '../shared/protocol.js';
import { ICON_MAP } from './ui/icons.js';

export const CARDS: Record<CardId, { name: string; desc: string; icon: string }> = {
  sanctions: {
    name: '經濟制裁',
    icon: ICON_MAP['📊'],
    desc: '對手全部戰區收入減半（外援不受影響）',
  },
  assetFreeze: {
    name: '資產凍結',
    icon: ICON_MAP['🧊'],
    desc: '凍結對手 $30 預算，本回合不可動用',
  },
  oilPriceWar: {
    name: '油價戰',
    icon: ICON_MAP['⛽'],
    desc: '對手收入最高戰區的收入歸零',
  },
  warBonds: {
    name: '戰爭公債',
    icon: ICON_MAP['🏛️'],
    desc: '國庫 +$40、債務 +$40（回合末債務折分）',
  },
  costImposition: {
    name: '成本強加',
    icon: ICON_MAP['💸'],
    desc: '吸收對手本回合部署額的 20%',
  },
  attritionRaid: {
    name: '消耗突襲',
    icon: ICON_MAP['⚔️'],
    desc: '指定一個戰區，我方投入 ×1.5',
  },
};

export const REGIONS: Record<RegionId, { name: string; income: number; vp: number; icon: string }> = {
  frontier: {
    name: '邊境',
    income: 10,
    vp: 1,
    icon: ICON_MAP['🏔️'],
  },
  industrial: {
    name: '工業城',
    income: 30,
    vp: 2,
    icon: ICON_MAP['🏭'],
  },
  oilfield: {
    name: '油田',
    income: 25,
    vp: 2,
    icon: ICON_MAP['⛽'],
  },
  capital: {
    name: '首都',
    income: 20,
    vp: 3,
    icon: ICON_MAP['🏰'],
  },
};

export const REGION_ORDER: readonly RegionId[] = PROTOCOL_REGION_ORDER;
