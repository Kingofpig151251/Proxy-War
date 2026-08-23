/**
 * 卡牌／區域顯示資料（對齊 shared/protocol.ts）。
 */
import type { CardId, RegionId } from '../../shared/protocol.js';

export const CARDS: Record<CardId, { name: string; desc: string; icon: string }> = {
  sanctions: {
    name: '經濟制裁',
    icon: '🚫',
    desc: '本回合對手收入 −30%',
  },
  assetFreeze: {
    name: '資產凍結',
    icon: '🧊',
    desc: '凍結對手 $30（下回合解凍）',
  },
  oilPriceWar: {
    name: '油價戰',
    icon: '🛢️',
    desc: '有油田者收入 ×2；無油田者 −$8',
  },
  warBonds: {
    name: '戰爭公債',
    icon: '🏛️',
    desc: '即得 $40，但累積債務（每回合還息 $4）',
  },
  costImposition: {
    name: '成本轉嫁',
    icon: '💸',
    desc: '本回合你所有部署成本 +25%（更貴但更狠）',
  },
  attritionRaid: {
    name: '消耗突襲',
    icon: '⚔️',
    desc: '指定一區：雙方有效值都扣 20% 再比',
  },
};

export const REGIONS: Record<RegionId, { name: string; vp: number; income: number; icon: string }> = {
  frontier: { name: '邊境', vp: 1, income: 2, icon: '🏞️' },
  industrial: { name: '工業帶', vp: 2, income: 3, icon: '🏭' },
  oilfield: { name: '油田', vp: 2, income: 4, icon: '🛢️' },
  capital: { name: '首都', vp: 3, income: 3, icon: '🏛️' },
};

export const REGION_ORDER: RegionId[] = ['frontier', 'industrial', 'oilfield', 'capital'];
