#!/usr/bin/env python3
"""PROXY WAR v2 — 規則原型模擬器（拋棄式原型，非正式產品代碼）。

目的：喺 TypeScript 重寫之前，用 Python 驗證 DESIGN.md v2 核心迴圈
可運行、無死鎖，並做蒙地卡羅初探平衡。發現嘅規則缺口寫入戰報。

用法：python3 prototypes/rules_sim.py
輸出：docs/battle-sim-r1.md
"""
from __future__ import annotations
import random
from collections import Counter

# ── 常數（全部來自 DESIGN.md §3，公債按討論改版 $40 / 每$20折1分 封頂−2）──
REGION_ORDER = ["Frontier", "Industrial", "Oilfield", "Capital"]  # 結算揭示序：邊境→首都高潮留最後
ZH = {"Frontier": "邊境", "Industrial": "工業城", "Oilfield": "油田", "Capital": "首都"}
REGIONS = {
    "Frontier":   dict(vp=1, income=10),
    "Industrial": dict(vp=2, income=30),
    "Oilfield":   dict(vp=2, income=25),
    "Capital":    dict(vp=3, income=20),
}
CARD_ZH = {
    "Sanctions": "經濟制裁", "AssetFreeze": "資產凍結", "OilPriceWar": "石油價格戰",
    "WarBonds": "戰爭公債", "CostImposition": "成本強加", "AttritionRaid": "消耗突襲",
}
ALL_CARDS = list(CARD_ZH)
ROUNDS, AID, START = 4, 20, 100
DEBT_STEP, DEBT_CAP = 20, 2          # 每 $20 債務折 1 分，封頂 −2
FREEZE_AMT, IMPOSE_RATE, RAID_MULT = 30, 0.20, 1.5
# ── 帝國過度擴張：收益愈高嘅區，衛冕投入折減愈大（攻方不受影響）──
# 防守有效值 = 投入 × K / (K + 區收入)。K=∞ 即無折減（baseline）；K=100 時：
#   工業城$30→×0.77、油田$25→×0.80、首都$20→×0.83、邊境$10→×0.91
DEFENSE_K = 100


class Player:
    def __init__(self, pid: str):
        self.pid = pid
        self.treasury = START
        self.debt = 0
        self.score = 0
        self.frozen = 0
        self.hand = set(ALL_CARDS)
        self.deployed_total = 0

    def final_vp(self) -> int:
        return self.score - min(self.debt // DEBT_STEP, DEBT_CAP)


def split_budget(total: int, weights: dict[str, float]) -> dict[str, int]:
    """最大餘數法按權重拆預算。"""
    tw = sum(weights.values())
    if total <= 0 or tw <= 0:
        return {}
    raw = {k: total * w / tw for k, w in weights.items()}
    out = {k: int(v) for k, v in raw.items()}
    rem = total - sum(out.values())
    for k in sorted(raw, key=lambda k: raw[k] - out[k], reverse=True)[:rem]:
        out[k] += 1
    return out


class Game:
    def __init__(self, seed: int, defense_k: float = float("inf")):
        self.rng = random.Random(seed)
        self.seed = seed
        self.defense_k = defense_k   # 帝國過度擴張強度；inf＝無折減（baseline）
        self.p = {"B": Player("BLUE"), "R": Player("RED")}
        self.ctrl = {r: None for r in REGION_ORDER}   # 假設：全中立開局
        self.round_no = 0
        self.log: list[str] = []
        self.snapshots: list[str] = []

    # ── AI 包裝：加雜訊模擬人類誤差 ──
    def _noisy_decide(self, pid: str, ai) -> dict:
        v = self._view(pid)
        d = ai.decide(v)
        card = d.get("card")
        if card and card not in self.p[pid].hand:
            card = None
        if card and self.rng.random() < 0.12:       # 12% 人為失誤：忍手不出
            card = None
        spend = min(d.get("spend", 0.8) * self.rng.uniform(0.9, 1.1), 1.0)
        weights = {r: w * self.rng.uniform(0.8, 1.2) for r, w in d.get("weights", {}).items()}
        tgt = d.get("raid_target")
        return dict(card=card, raid_target=tgt, weights=weights, spend=spend)

    def _view(self, pid: str) -> dict:
        me, op = self.p[pid], self.p["R" if pid == "B" else "B"]
        return dict(round=self.round_no, decisive=self.round_no == ROUNDS,
                    pid=pid,
                    me=dict(treasury=me.treasury, score=me.score, debt=me.debt, frozen=me.frozen),
                    opp=dict(treasury=op.treasury, score=op.score, debt=op.debt),
                    ctrl=dict(self.ctrl))

    # ── 一個回合 ──
    def play_round(self, ais: dict):
        self.round_no += 1
        rn = self.round_no
        mult = 2 if rn == ROUNDS else 1
        self.say(f"\n═══ 第 {rn} 回合{'（決戰：戰略分 ×2）' if mult == 2 else ''} ═══")

        dec = {pid: self._noisy_decide(pid, ais[pid]) for pid in ("B", "R")}
        eff = dict(sanctions=[], oilwar=[], freeze=[], impose=[], raid={})
        for pid, d in dec.items():
            c = d["card"]
            if c == "Sanctions":
                eff["sanctions"].append(pid)
            elif c == "OilPriceWar":
                eff["oilwar"].append(pid)
            elif c == "AssetFreeze":
                eff["freeze"].append(pid)
            elif c == "CostImposition":
                eff["impose"].append(pid)
            elif c == "AttritionRaid" and d["raid_target"] in REGION_ORDER:
                eff["raid"][pid] = d["raid_target"]

        # ── 階段1：收入（制裁／油戰效果在此插入；見戰報缺口#1 的時序說明）──
        for pid in ("B", "R"):
            pl = self.p[pid]
            parts = [f"外援${AID}"]
            total = AID
            halved = any(a != pid for a in eff["sanctions"])
            zeroable = [a for a in eff["oilwar"] if a != pid]
            owned = [(r, REGIONS[r]["income"]) for r in REGION_ORDER if self.ctrl[r] == pid]
            if halved:
                owned = [(r, v // 2) for r, v in owned]
            if owned and zeroable:                      # 歸零對手控制中收入最高一區
                tr, tv = max(owned, key=lambda x: (x[1], -REGION_ORDER.index(x[0])))
                owned = [(r, 0 if r == tr else v) for r, v in owned]
            for r, v in owned:
                note = ZH[r] + (f"${v}" + ("（制裁減半）" if halved else "") +
                                ("〔油價戰歸零〕" if v == 0 else ""))
                parts.append(note)
                total += v
            if owned and zeroable and not any(v == 0 for _, v in owned):
                pass
            pl.treasury += total
            self.say(f"💰 收入｜{pid} +${total}（{' + '.join(parts)}）→ 國庫 ${pl.treasury}")

        # ── 階段2：行動卡揭示＋即時效果 ──
        rev = []
        for pid in ("B", "R"):
            c = dec[pid]["card"]
            if c:
                self.p[pid].hand.discard(c)
                if c == "WarBonds":
                    self.p[pid].treasury += 40
                    self.p[pid].debt += 40
                    rev.append(f"{pid}:{CARD_ZH[c]}(+$40/負債+$40)")
                else:
                    rev.append(f"{pid}:{CARD_ZH[c]}")
            else:
                rev.append(f"{pid}:不出")
            if c == "AssetFreeze":                       # 凍結即刻封鎖對手部署額度
                victim = self.p["R" if pid == "B" else "B"]
                victim.frozen = min(FREEZE_AMT, victim.treasury)
        self.say("🃏 揭卡｜" + "　".join(rev))
        for pid in eff["freeze"]:
            victim_id = "R" if pid == "B" else "B"
            self.say(f"  ❄️ 凍結｜{victim_id} ${self.p[victim_id].frozen} 本回合不可部署")

        # ── 階段3：同時秘密部署（未部署資金保留；部署一律支付）──
        allocs = {}
        for pid in ("B", "R"):
            pl = self.p[pid]
            avail = pl.treasury - pl.frozen
            budget = min(int(avail * dec[pid]["spend"]), avail)
            alloc = split_budget(budget, dec[pid]["weights"])
            allocs[pid] = alloc
            pl.deployed_total = sum(alloc.values())
            pl.treasury -= pl.deployed_total
            pretty = " ".join(f"{ZH[r]}:${a}" for r, a in alloc.items()) or "全軍按兵不動"
            self.say(f"🎯 部署｜{pid} {pretty}（共 ${pl.deployed_total}，國庫餘 ${pl.treasury}）")

        # ── 階段4前置：成本強加 ──
        for pid in eff["impose"]:
            victim_id = "R" if pid == "B" else "B"
            steal = int(IMPOSE_RATE * self.p[victim_id].deployed_total)
            self.p[pid].treasury += steal
            self.say(f"  📡 成本強加｜{pid} 抽走 {victim_id} 部署額 20% = ${steal} 入國庫")

        # ── 階段4：逐區結算（帝國過度擴張：衛冕投入按區收入折減）──
        self.say("⚔️ 結算｜")
        for r in REGION_ORDER:
            bv = allocs["B"].get(r, 0)
            rv = allocs["R"].get(r, 0)

            def eff_val(pid: str, raw: int) -> tuple[int, str]:
                """回傳 (有效值, 註解)。突襲倍率同防守折減可疊。"""
                note_parts = []
                v = raw
                if eff["raid"].get(pid) == r:
                    v = int(v * RAID_MULT)
                    note_parts.append(f"{RAID_MULT}× 突襲")
                if self.ctrl[r] == pid and self.defense_k != float("inf"):
                    k = self.defense_k
                    d = k / (k + REGIONS[r]["income"])
                    v = int(v * d)
                    note_parts.append(f"鎮壓折減 ×{d:.2f}")
                return v, ("（" + "＋".join(note_parts) + "）" if note_parts else "")

            eff_b, nb = eff_val("B", bv)
            eff_r, nr = eff_val("R", rv)
            inc = self.ctrl[r]
            if eff_b > eff_r:
                win, gain = "B", REGIONS[r]["vp"] * mult
                note = nb if win == "B" else ""
            elif eff_r > eff_b:
                win, gain = "R", REGIONS[r]["vp"] * mult
                note = nr if win == "R" else ""
            else:                                        # 平手：現任守住；中立維持中立
                if inc:
                    self.p[inc].score += 0
                self.say(f"   · {ZH[r]}｜B ${bv}{nb} vs R ${rv}{nr} → 平手，{'現任 ' + inc + ' 守住' if inc else '維持中立'}")
                continue
            prev = self.ctrl[r]
            flipped = "易手！" if prev and prev != win else ("奪取" if prev is None else "衛冕")
            self.ctrl[r] = win
            self.p[win].score += gain
            self.say(f"   · {ZH[r]}｜B ${bv}{nb if win=='B' else ''} vs R ${rv}{nr if win=='R' else ''} → {win} {flipped}（+{gain}分）")

        # ── 階段5：回合末（解凍）──
        for pl in self.p.values():
            pl.frozen = 0
        self.snapshots.append(self._summary_line())

    def _summary_line(self) -> str:
        ctl = " ".join(f"{ZH[r]}:{self.ctrl[r] or '中立'}" for r in REGION_ORDER)
        b, rr = self.p["B"], self.p["R"]
        return f"| {self.round_no} | \${b.treasury} | {b.score} | \${rr.treasury} | {rr.score} | {ctl} |"

    def say(self, t: str):
        self.log.append(t)

    def finish(self) -> tuple[str, str | None, int, int]:
        """回傳 (結果行, 勝方座位或None[真和局], 藍分, 紅分)。規則：平分→比國庫→真和局。"""
        fb, fr = self.p["B"].final_vp(), self.p["R"].final_vp()
        debt_note = ""
        for pl in self.p.values():
            pen = pl.score - pl.final_vp()
            if pen:
                debt_note += f"（{pl.pid} 債務罰 −{pen}）"
        if fb > fr:
            winner = "B"
            res = f"🏆 BLUE 勝 {fb}:{fr}{debt_note}"
        elif fr > fb:
            winner = "R"
            res = f"🏆 RED 勝 {fr}:{fb}{debt_note}"
        else:
            bt, rt = self.p["B"].treasury, self.p["R"].treasury
            if bt > rt:
                winner = "B"
                res = f"⚖️ 戰略分平手 {fb}:{fr}{debt_note} → 比國庫：BLUE ${bt} vs RED ${rt}，BLUE 勝"
            elif rt > bt:
                winner = "R"
                res = f"⚖️ 戰略分平手 {fb}:{fr}{debt_note} → 比國庫：BLUE ${bt} vs RED ${rt}，RED 勝"
            else:
                winner = None
                res = f"🤝 真和局：戰略分 {fb}:{fr}，國庫同為 ${bt}"
        self.say("\n" + res)
        return res, winner, fb, fr


# ── 兩種風格 AI（啟發式＋雜訊）──
class EconBot:  # AZURE：經濟流——先搶收入區，決戰突襲首都
    NAME = "BLUE·AZURE（經濟流）"
    def decide(self, v):
        ctrl, r = v["ctrl"], v["round"]
        theirs = [x for x in REGION_ORDER if ctrl[x] == "R"]
        card, tgt = None, None
        if r == 1:
            card = "WarBonds"
        elif r == 2:
            card = "OilPriceWar" if "Oilfield" in theirs else ("Sanctions" if theirs else None)
        elif r == 3:
            card = "AssetFreeze"
        else:
            card, tgt = "AttritionRaid", "Capital"
        W = {1: ([("Industrial", 6), ("Oilfield", 4)], 0.8),
             2: ([("Industrial", 5), ("Oilfield", 4), ("Capital", 2)], 0.7),
             3: ([("Industrial", 5), ("Capital", 4), ("Oilfield", 3)], 0.8),
             4: ([("Capital", 6), ("Industrial", 4)], 1.0)}[r]
        return dict(card=card, raid_target=tgt,
                    weights={x: w for x, w in W[0]}, spend=W[1])


class WarBot:   # CRIMSON：分數流——劍指首都，決戰成本強加
    NAME = "RED·CRIMSON（分數流）"
    def decide(self, v):
        ctrl, r = v["ctrl"], v["round"]
        theirs = [x for x in REGION_ORDER if ctrl[x] == "B"]
        card, tgt = None, None
        if r == 2:
            card = "Sanctions" if theirs else "WarBonds"
        elif r == 3:
            card = "AssetFreeze"
        elif r == 4:
            card = "CostImposition"
        W = {1: ([("Capital", 7), ("Frontier", 2)], 0.85),
             2: ([("Capital", 6), ("Industrial", 3), ("Frontier", 1)], 0.8),
             3: ([("Capital", 5), ("Oilfield", 4)], 0.9),
             4: ([("Capital", 6), ("Industrial", 4)], 1.0)}[r]
        return dict(card=card, raid_target=tgt,
                    weights={x: w for x, w in W[0]}, spend=W[1])


GAPS = """
## 模擬發現嘅規則缺口（TS 重寫前要補）

1. **選卡時序矛盾**——DESIGN.md 將「收入階段」排喺「行動卡階段」之前，
   但制裁／油價戰嘅效果掛喺收入階段：收入計算時其實已經知道咗選卡。
   本 sim 採用：**回合開始同時密秘選卡 → 收入（插效果）→ 揭示（即時效果）→ 部署 → 結算 → 回合末**。
   規則書要照咁寫，「行動卡階段」改名「揭示階段」。
2. **初始控制權未定義**——開局四區誰屬？本 sim 用全中立開局。
   若改成「各控兩區」，前期收入曲線完全不同，平衡要重新驗。
3. **石油價格戰空轉**——對手零控制區時出卡=完全浪費（卡照燒）。
   建議：無合法目標時退回手牌，或規則寫明「出卡前自行承擔」。
4. **資產凍結對低國庫對手近乎硬控**——國庫 <$30 時全凍，決戰回合等於禁手。
   數值平衡測試要特別睇 R4 凍結場景。
5. **成本強加係通脹源**——對手已支付嘅部署金 20% 「轉入」我方國庫＝系統憑空注資。
   1v1 四回合內無所謂；二期永續沙盒若沿用，會推高通脹模型。
6. **平手守則利領先者**——現任守住＋對稱投入＝落後方必須 overinvest 先搶到區。
   設計上合理（逼進攻方冒險），但 RULEBOOK 要明示呢個張力。
7. **衛冕計分假設（⚠️ 影響最大）**——DESIGN.md 只寫「投入高者奪取控制權＋該區分數」，
   冇講明已控區再贏（衛冕）有冇分。本 sim 採用「每回合結算贏家都計分，衛冕照計」。
   若改成「只有易手／首次奪取先計分」，經濟流靠反覆防守經濟區刷分嘅優勢會大幅收窄，
   蒙地卡洛結論可能反轉——**要拍板**。
"""


def run_game(seed: int, swap: bool = False, defense_k: float = float("inf")) -> Game:
    g = Game(seed, defense_k=defense_k)
    ais = ({"B": WarBot(), "R": EconBot()} if swap else {"B": EconBot(), "R": WarBot()})
    for _ in range(ROUNDS):
        g.play_round(ais)
    g.finish()
    return g


VARIANTS = [
    ("baseline", "無折減（原案）", float("inf")),
    ("k50",      "鎮壓折減 K=50（強）", 50.0),
    ("k25",      "鎮壓折減 K=25（極強）", 25.0),
]


def main():
    N = 800
    report = ["# PROXY WAR v2 — 帝國過度擴張 A/B 戰報 R2\n",
              "> 問題：收益愈大嘅區愈難守住（衛冕投入按區收入折減，攻方全額）能否修正 R1 發現嘅經濟流滾雪球？\n",
              "> 公式：防守有效值 = 投入 × K/(K+區收入)。K→∞ 即原案；工業城($30)喺 K=50 時折減 ×0.63、首都($20) ×0.71、邊境($10) ×0.83。\n"]

    for vname, vdesc, k in VARIANTS:
        wins, seat_bias = Counter(), Counter()
        margins = []
        for s in range(N):
            for swap in (False, True):
                g = run_game(1000000 * int(swap) + s, swap=swap, defense_k=k)
                _, winner, fb, fr = g.finish()
                if winner:
                    wstrat = "ECON" if ((winner == "B") != swap) else "SCORE"
                    wins[wstrat] += 1
                    seat_bias[winner] += 1
                    margins.append(abs(fb - fr))
                else:
                    wins["draw"] += 1
                    seat_bias["draw"] += 1
        total = 2 * N
        flips = sum(margins) / max(len(margins), 1)
        report.append(f"## 變體：{vdesc}\n")
        report.append(f"- 經濟流 **{wins['ECON']}**（{wins['ECON']/total:.0%}）｜分數流 {wins['SCORE']}（{wins['SCORE']/total:.0%}）｜和 {wins['draw']}")
        report.append(f"- 座位 B{seat_bias['B']}:R{seat_bias['R']}｜平均分差 {flips:.2f}")
        report.append("")
    report.append("---")
    report.append("*同 1600 場/變體、同 seed 集、正反座對照；兩派 AI 未因新機制調整策略（刻意——驗證舊打法會唔會被懲罰）。*")

    out = "\n".join(report) + "\n"
    with open("docs/battle-sim-r2-overextension.md", "w") as f:
        f.write(out)

    print(out)


if __name__ == "__main__":
    main()
