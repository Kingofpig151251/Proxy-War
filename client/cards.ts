/**
 * 卡牌／地區顯示資料（與 src/game/config.ts、shared/protocol.ts 對齊）。
 * icon 直接存 IconName——拼錯名稱編譯期即報錯。
 */
import type { CardId, RegionId } from '../shared/protocol.js';
import { REGION_ORDER as PROTOCOL_REGION_ORDER } from '../shared/protocol.js';
import type { IconName } from './ui/icons.js';

export const CARDS: Record<CardId, { name: string; desc: string; icon: IconName }> = {
  sanctions: {
    name: '經濟制裁',
    icon: 'chart',
    desc: '對手全部戰區收入減半（外援不受影響）',
  },
  assetFreeze: {
    name: '資產凍結',
    icon: 'snowflake',
    desc: '凍結對手 $30 預算，本回合不可動用',
  },
  oilPriceWar: {
    name: '油價戰',
    icon: 'droplet',
    desc: '對手收入最高戰區的收入歸零',
  },
  warBonds: {
    name: '戰爭公債',
    icon: 'flag',
    desc: '國庫 +$40、債務 +$40（回合末債務折分）',
  },
  costImposition: {
    name: '成本強加',
    icon: 'coin',
    desc: '吸收對手本回合部署額的 20%',
  },
  attritionRaid: {
    name: '消耗突襲',
    icon: 'swords',
    desc: '指定一個戰區，我方投入 ×1.5',
  },
};

export const REGIONS: Record<RegionId, { name: string; income: number; vp: number; icon: IconName }> = {
  frontier: { name: '邊境', income: 10, vp: 1, icon: 'mountain' },
  industrial: { name: '工業城', income: 30, vp: 2, icon: 'factory' },
  oilfield: { name: '油田', income: 25, vp: 2, icon: 'droplet' },
  capital: { name: '首都', income: 20, vp: 3, icon: 'castle' },
};

export const REGION_ORDER: readonly RegionId[] = PROTOCOL_REGION_ORDER;
