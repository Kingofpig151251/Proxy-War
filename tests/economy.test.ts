/**
 * 經濟引擎單元測試 — 全部期望值手算鎖定（DESIGN.md §3.3/§3.4）。
 * 折減係數：industrial 50/80=0.625、capital 50/70≈0.714、frontier 50/60≈0.833
 */
import { describe, expect, it } from 'vitest';
import {
  type CardPlay,
  type PlayerEco,
  type Seat,
  computeIncome,
  determineWinner,
  effectiveValue,
  finalScore,
  other,
  resolveRegion,
  resolveRoundSettlement,
  suppressionFactor,
  validateCardSubmission,
  validateDeploy,
} from '../src/game/economy.js';
import { ALL_CARDS } from '../shared/protocol.js';

const mkPlayer = (over: Partial<PlayerEco> = {}): PlayerEco => ({
  treasury: 100,
  score: 0,
  debt: 0,
  frozen: 0,
  hand: new Set(ALL_CARDS),
  ...over,
});

describe('§3.4 鎮壓折減', () => {
  it('K/(K+income)：工業城 0.625、首都 50/70', () => {
    expect(suppressionFactor(30)).toBeCloseTo(0.625);
    expect(suppressionFactor(20)).toBeCloseTo(50 / 70);
  });

  it('防守折減只套用現任；攻方全額', () => {
    const def = effectiveValue(32, 'industrial', { isDefendingIncumbent: true });
    expect(def.value).toBe(20); // 32 × 0.625
    expect(def.notes).toHaveLength(1);

    const atk = effectiveValue(32, 'industrial', {});
    expect(atk.value).toBe(32);
    expect(atk.notes).toHaveLength(0);
  });

  it('突襲先乘再折減（§3.4 疊加序）：10 → ×1.5 → ×5/8 = 9', () => {
    const v = effectiveValue(10, 'industrial', {
      raided: true,
      isDefendingIncumbent: true,
    });
    // 10×1.5=15 → 15×0.625=9.375 → floor 9
    expect(v.value).toBe(9);
    expect(v.notes).toHaveLength(2);
  });
});

describe('階段1 收入', () => {
  it('無控制區＝淨外援 $20', () => {
    const r = computeIncome(mkPlayer(), { card: null }, []);
    expect(r.total).toBe(20);
  });

  it('正常戰區收入：首都20+邊境10+外援', () => {
    const r = computeIncome(mkPlayer(), { card: null }, ['capital', 'frontier']);
    expect(r.total).toBe(50);
  });

  it('制裁：戰區收入減半（floor），外援不變', () => {
    const r = computeIncome(mkPlayer(), { card: 'sanctions' }, ['oilfield']);
    // 25×0.5=12.5→floor 12；20+12=32
    expect(r.total).toBe(32);
  });

  it('油價戰：歸零收入最高控制區', () => {
    const r = computeIncome(mkPlayer(), { card: 'oilPriceWar' }, ['industrial', 'frontier']);
    // industrial(30) 歸零，frontier 照計：20+0+10=30
    expect(r.total).toBe(30);
    expect(r.zeroedRegion).toBe('industrial');
  });

  it('只有「對手」出嘅卡先影響我收入', () => {
    const r = computeIncome(mkPlayer(), { card: null }, ['industrial']);
    const oppPlayedSanctionsOnMe = computeIncome(mkPlayer(), { card: 'sanctions' }, ['industrial']);
    expect(r.total).toBe(50); // 對手冇出卡：20+30
    expect(oppPlayedSanctionsOnMe.total).toBe(35); // 20+15
  });
});

describe('提交驗證', () => {
  it('手牌冇嘅卡拒絕', () => {
    const p = mkPlayer({ hand: new Set(['warBonds' as const]) });
    expect(validateCardSubmission({ card: 'sanctions' }, p)).toMatchObject({ ok: false });
    expect(validateCardSubmission({ card: 'warBonds' }, p)).toMatchObject({ ok: true });
  });

  it('不出卡永遠合法', () => {
    expect(validateCardSubmission({ card: null }, mkPlayer())).toMatchObject({ ok: true });
  });

  it('突襲要目標', () => {
    expect(validateCardSubmission({ card: 'attritionRaid' }, mkPlayer())).toMatchObject({
      ok: false,
    });
    expect(
      validateCardSubmission({ card: 'attritionRaid', target: 'capital' }, mkPlayer()),
    ).toMatchObject({ ok: true });
  });

  it('部署：超過可用資金（含凍結）拒絕', () => {
    const p = mkPlayer({ treasury: 100, frozen: 30 });
    expect(validateDeploy({ capital: 71 }, p)).toMatchObject({ ok: false });
    const v = validateDeploy({ capital: 70 }, p);
    expect(v.ok && v.spend).toBe(70);
  });

  it('部署：負數／非整數／未知區拒絕', () => {
    expect(validateDeploy({ capital: -1 }, mkPlayer())).toMatchObject({ ok: false });
    expect(validateDeploy({ capital: 1.5 }, mkPlayer())).toMatchObject({ ok: false });
    expect(validateDeploy({ moon: 5 }, mkPlayer())).toMatchObject({ ok: false });
  });

  it('空部署合法（按兵不動）', () => {
    const v = validateDeploy({}, mkPlayer());
    expect(v.ok && v.spend).toBe(0);
  });
});

describe('結算', () => {
  const baseCtx = (round = 1) => ({
    plays: {
      blue: { card: null } as CardPlay,
      red: { card: null } as CardPlay,
    },
    allocations: {
      blue: { frontier: 0, industrial: 0, oilfield: 0, capital: 0 },
      red: { frontier: 0, industrial: 0, oilfield: 0, capital: 0 },
    },
    controllers: {
      frontier: null,
      industrial: null,
      oilfield: null,
      capital: null,
    } as Record<RegionId_, Seat | null>,
    round,
  });
  type RegionId_ = 'frontier' | 'industrial' | 'oilfield' | 'capital';

  it('中立區：高投入者奪取（capture）', () => {
    const ctx = baseCtx();
    ctx.allocations.blue.capital = 50;
    ctx.allocations.red.capital = 49;
    const res = resolveRegion('capital', ctx);
    expect(res.entry.winner).toBe('blue');
    expect(res.entry.outcome).toBe('capture');
    expect(res.vpGain.blue).toBe(3);
  });

  it('決戰回合（round=4）分數 ×2', () => {
    const ctx = baseCtx(4);
    ctx.allocations.blue.frontier = 10;
    const res = resolveRegion('frontier', ctx);
    expect(res.vpGain.blue).toBe(2); // 1×2
  });

  it('平手（有效值相等）：現任守住；中立維持中立', () => {
    const ctx = baseCtx();
    ctx.controllers.capital = 'red';
    // 紅守 20 → 有效 floor(20×5/7)=14；藍攻 14 → 相等 → 平手現任守住
    ctx.allocations.blue.capital = 14;
    ctx.allocations.red.capital = 20;
    const res = resolveRegion('capital', ctx);
    expect(res.entry.winner).toBeNull();
    expect(res.newController).toBe('red');
    expect(res.vpGain.red).toBe(0);
  });

  it('§3.4 後果：同額投入，被折減嘅防守方反而輸', () => {
    const ctx = baseCtx();
    ctx.controllers.capital = 'red';
    ctx.allocations.blue.capital = 20; // 攻方全額
    ctx.allocations.red.capital = 20; // 守方 → 14
    const res = resolveRegion('capital', ctx);
    expect(res.entry.winner).toBe('blue');
    expect(res.entry.outcome).toBe('flip');
  });

  it('易手（flip）：折減後守唔住', () => {
    const ctx = baseCtx();
    ctx.controllers.industrial = 'red';
    // red 守 32 → 有效 20；blue 攻 21 → 21>20 flip
    ctx.allocations.red.industrial = 32;
    ctx.allocations.blue.industrial = 21;
    const res = resolveRegion('industrial', ctx);
    expect(res.entry.winner).toBe('blue');
    expect(res.entry.outcome).toBe('flip');
    expect(res.entry.redEffective).toBe(20);
  });

  it('衛冕成功照計分（defend 有 VP）', () => {
    const ctx = baseCtx();
    ctx.controllers.industrial = 'red';
    ctx.allocations.red.industrial = 32; // 有效 20
    ctx.allocations.blue.industrial = 19;
    const res = resolveRegion('industrial', ctx);
    expect(res.entry.winner).toBe('red');
    expect(res.entry.outcome).toBe('defend');
    expect(res.vpGain.red).toBe(2);
  });

  it('揭示序：邊境→工業城→油田→首都；全場彙總 VP 正確', () => {
    const ctx = baseCtx(4);
    ctx.allocations.blue = { frontier: 5, industrial: 5, oilfield: 5, capital: 5 };
    const out = resolveRoundSettlement(ctx);
    expect(out.entries.map((e) => e.region)).toEqual([
      'frontier',
      'industrial',
      'oilfield',
      'capital',
    ]);
    expect(out.vpBySeat.blue).toBe(16); // (1+2+2+3)×2
    expect(out.entries.every((e) => e.winner === 'blue')).toBe(true);
  });
});

describe('終局', () => {
  it('債務罰：每 $20 折 1 分、封頂 −2', () => {
    expect(finalScore(mkPlayer({ score: 10, debt: 19 })).penalty).toBe(0);
    expect(finalScore(mkPlayer({ score: 10, debt: 20 })).penalty).toBe(1);
    expect(finalScore(mkPlayer({ score: 10, debt: 999 })).vp).toBe(8); // cap 2
  });

  it('平分比國庫', () => {
    const r = determineWinner(
      mkPlayer({ score: 5, treasury: 30 }),
      mkPlayer({ score: 5, treasury: 31 }),
    );
    expect(r.winner).toBe('red');
  });

  it('真和局', () => {
    const r = determineWinner(
      mkPlayer({ score: 5, treasury: 30 }),
      mkPlayer({ score: 5, treasury: 30 }),
    );
    expect(r.winner).toBeNull();
    expect(r.reason).toContain('真和局');
  });

  it('other() 對稱', () => {
    expect(other('blue')).toBe('red');
    expect(other('red')).toBe('blue');
  });
});
