# PROXY WAR v2 — 重造設計文檔

> **狀態**：規則全部定案（骨架＋鎮壓折減 §3.4＋六張卡組合）；✅ 帳密系統＋ELO 排行榜已入範圍（§6.4）
> **日期**：2026-08-23（R1/R2 蒙地卡洛模擬驗證後定案；同日加入帳密系統決策）
> **背景**：本專案原為 ITP4708「遊戲伺服器設計與實作」課題，現進行作品集級全面重造——規則、架構、UI、工程配套全部重新設計。

---

## 1. 專案願景

將課題重新設計為現代化產品，作為個人作品集的核心展示：

| 層面 | 決定 |
|---|---|
| 遊戲規則 | 全部重新設計（戰爭經濟學博弈，見下） |
| 後端 | TypeScript 重寫、多房間架構（同時多場對戰） |
| 前端 | 原生 JS + 現代 CSS 重新設計（戰情中心視覺風格、零構建、無 CDN 依賴） |
| 工程配套 | vitest 測試、GitHub Actions CI、多階段 Docker |
| 文檔 | 中英雙語 README、機制研究來源引用、RULEBOOK |

## 2. 世界觀與遊戲身份

- **世界觀**：虛構列強的代理人戰爭（不使用真實地名與國名，政治中立；真實機制研究來源在 README 公開引用）。
- **遊戲身份**：「戰爭經濟學博弈」——所有行動卡都是真實存在的戰爭金融與經濟戰工具（借貸、印鈔、制裁、資產凍結、石油價格戰、成本強加……）。
- **設計研究路線**：以真實經濟學為入口——戰爭金融三分法（課稅／借貸／印鈔）、經濟戰工具分類學、冷戰經濟戰案例（1985-86 沙特石油價格戰）、俄烏衝突中的現代經濟戰工具（ERA 貸款、制裁、資產凍結）、消耗交換比經濟學。

## 3. 遊戲規則骨架（已定案）

### 3.1 基本架構

- **人數**：1v1（另有旁觀者即時觀戰）
- **回合**：4 回合，第 4 回合為**決戰回合**（戰略分 ×2）
- **起始國庫**：雙方各 $100
- **每回合收入** = 基本外援 $20 + 控制戰區收入
- **核心機制**：雙方**同時密秘**部署資金到戰區（原版的輪流制與資訊不對稱已廢除）
- **勝負**：4 回合後戰略分高者勝；平手比國庫；對局中斷線＝棄賽判負

### 3.2 戰區地圖

| 戰區 | 戰略分 | 收入/回合 | 設計意圖 |
|---|---|---|---|
| 首都 Capital | 3 | $20 | 分數重心，決戰回合值 6 分 |
| 工業城 Industrial | 2 | $30 | 經濟重心（最高收入） |
| 油田 Oilfield | 2 | $25 | 次高收入，石油價格戰的目標原型 |
| 邊境 Frontier | 1 | $10 | 低價值誘餌/次要戰線 |

分數與收入刻意錯開：玩家每回合都要在「搶分數」與「搶經濟」之間取捨。

### 3.3 回合流程（5 階段狀態機）

1. **收入階段** — 結算外援 + 戰區收入；卡片對收入的效果（制裁、石油價格戰等）在此生效
2. **行動卡階段** — 雙方同時密秘選卡（可不出），揭示；即時效果（借貸入帳、沒收轉移等）生效
3. **部署階段** — 雙方同時密秘分配資金到各戰區（凍結／出口管制的限制在此生效）
4. **結算階段** — 逐區揭示（邊境→首都，高潮留最後）；投入高者奪取控制權＋該區分數（決戰回合 ×2）；**平手時現任控制者守住**；消耗突襲的倍率在此計算；**鎮壓折減**（見 §3.4）只套用於現任控制者的防守投入
5. **結束階段** — 回合末效果（通膨侵蝕、配給儲蓄、戰爭財、外援條件檢查）結算

部署的資金一律支出（未部署才保留）。卡牌每張每場限用一次。**一回合同時密秘選一張行動卡（可不出）；同階段效果不疊加，衝突按「打擊方先結算、防禦方後結算」處理**（✅ 定案 2026-08-23）。

### 3.4 鎮壓折減（Suppression Decay）✅ 已定案 2026-08-23

**規則**：收益愈大嘅戰區愈難守住。結算時，現任控制者嘅防守投入按以下公式折減，進攻方不受影響：

```
防守有效值 = 投入 × K / (K + 該區收入)
```

- K 為全局鎮壓強度參數，入選後參數化於 `game/config.ts`（初值 K=50，待平衡測試精調）
- K→∞ 即無折減；K=50 時：工業城($30) ×0.63、油田($25) ×0.66、首都($20) ×0.71、邊境($10) ×0.83
- 只影響「衛冕」場景；攻取中立區／互搶不受折減
- 消耗突襲倍率可與折減疊加（先計突襲，再計折減）
- 平手判定用折減後有效值；現任守住的平手規則不變

**設計意圖**：帝國過度擴張——佔領唔等於統治。真實原型：游擊戰消耗佔領軍、阿富汗「帝國墳場」、冷戰代理人戰爭嘅佔領區治理成本。

**模擬驗證**（`prototypes/rules_sim.py`，1600 場/變體，正反座對照）：

| 變體 | 經濟流勝率 | 分數流勝率 | 平均分差 |
|---|---|---|---|
| 無折減（原案） | 94% | 6% | 12.35 |
| **K=50（採用）** | **72%** | **28%** | **6.16** |
| K=25 | 28% | 72% | 7.29 |

無折減時經濟流靠防守經濟區滾雪球近乎必勝；K=50 分差砍半、比賽顯著咬緊，且曲線平滑有調參空間。

---

## 4. 卡牌系統設計

### 4.1 設計原則（已鎖定）

1. **決戰回合必須有效**——每張卡在任何回合（含第 4 回合 ×2）都必須有效果。籌資卡的代價一律設計為「即時」或「終局結算」，絕不依賴「下回合」存在。
2. **只收可執行的戰術與政策**——描述性經濟概念（戰時通膨、大炮與奶油、戰爭債務、消耗交換比本身）不做成卡；卡必須是決策者主動執行的動作。
3. **真實原型**——每張卡都要有真實歷史/經濟學原型，README 附引用。

### 4.2 十五張卡初步設計（數值全部為第一版草案，最終入選後统一平衡）

#### ⚔️ 打擊對手型 — 經濟戰武器

| # | 卡 | 初步效果 | 生效點 | 決戰有效 | 真實原型 |
|---|---|---|---|---|---|
| 1 | 經濟制裁 Sanctions | 對手本回合所有戰區收入減半（外援 $20 不受影響） | 收入階段 | ✓ | EU 對俄 20 波制裁、SWIFT 排除 |
| 2 | 資產凍結 Asset Freeze | 對手國庫 $30 本回合無法部署，回合末解凍 | 選卡後→部署 | ✓ | 凍結俄央行約 $3000 億儲備 |
| 3 | 石油價格戰 Oil Price War | 對手「收入最高戰區」本回合收入歸零 | 收入階段 | ✓ | 1985-86 沙特增產、油價 $30→$10 拖垮蘇聯 |
| 4 | 封鎖 Blockade | 指定一個戰區本回合隔離：不產分、不產收入、不可奪取、部署退回 | 選卡後→結算 | ✓ | 一戰英國北海封鎖、拿破崙大陸體系 |
| 5 | 沒收徵用 Expropriation | 即時從對手國庫轉移 $15 到你的國庫 | 選卡即時 | ✓ | 凍結資產收益轉貸烏克蘭（ERA 機制） |
| 6 | 出口管制 Export Controls | 指定一個戰區，對手本回合在該區部署上限 $40 | 選卡後→部署 | ✓ | 晶片出口管制 |

#### 💰 籌措資金型 — 戰爭金融（代價即時或終局結算）

| # | 卡 | 初步效果 | 生效點 | 決戰有效 | 真實原型 |
|---|---|---|---|---|---|
| 7 | 戰爭公債 War Bonds | 即時 +$40；終局每 $20 未清償債務折抵 1 戰略分（封頂 −2）（✅ 改版定案 2026-08-23，原 $50/每$25） | 選卡即時＋終局 | ✓ | 一戰自由債券、G7 ERA 貸款 |
| 8 | 貨幣融資 Monetization | 即時 +$30；本回合結束時國庫 −15%（通膨侵蝕；花掉免罰、囤積受罰） | 選卡即時＋回合末 | ✓ | 威瑪式貨幣融資、鑄幣稅 |
| 9 | 戰爭稅 War Taxation | 即時 +$25；終局戰略分 −1（民意代價） | 選卡即時＋終局 | ✓ | 一戰戰時稅（加稅使戰爭支持度降約 15%） |
| 10 | 外援撥款 Aid Package | 即時 +$35；條件：本回合結束時未奪下任何戰區則改列債務（終局每 $25 折 1 分） | 選卡即時＋回合末 | ✓ | 租借法案、附條件軍援 |

#### 🏭 內部動員型 — 戰時經濟政策

| # | 卡 | 初步效果 | 生效點 | 決戰有效 | 真實原型 |
|---|---|---|---|---|---|
| 11 | 軍工動員 Defense Mobilization | 即時收入 +$10，其後每回合再 +$10 | 收入階段 | △ **若入選需改版**（見待決事項） | 砲彈產能爬坡、軍事凱恩斯主義 |
| 12 | 配給制 Rationing | 回合結束時未部署資金 +$15，且該筆儲蓄本回合免疫沒收與通膨 | 回合末 | ✓ | 二戰配給券 |
| 13 | 戰爭財 Profiteering | 回合結束時，本回合每有一個戰區控制權易手（不論誰奪），你賺 $15 | 回合末 | ✓ | 戰時投機商 |

#### 🎯 戰場經濟戰術型 — 戰略經濟學

| # | 卡 | 初步效果 | 生效點 | 決戰有效 | 真實原型 |
|---|---|---|---|---|---|
| 14 | 成本強加 Cost Imposition | 對手本回合部署總額的 20% 於結算前轉入你的國庫 | 部署後→結算前 | ✓ | 美國國防戰略「成本強加」 |
| 15 | 消耗突襲 Attrition Raid | 指定一個戰區，你在該區的結算投入以 ×1.5 計 | 結算時 | ✓ | 成本交換比：$500 無人機 vs $500 萬坦克 |

### 4.3 重疊檢查結論（選卡時已錯開的設計）

- 制裁（全場收入 −50%）vs 石油價格戰（單一命脈區歸零）：廣度 vs 精度
- 資產凍結（暫時封鎖）vs 沒收徵用（永久轉移）：時間性差異
- 封鎖（移除整個戰區）vs 出口管制（限制單區投入）：強度與副作用差異

### 4.4 建議入選組合（僅供參考，未定案）

**經濟制裁、資產凍結、石油價格戰、戰爭公債、成本強加、消耗突襲**
（打擊×3 + 籌資×1 + 戰術×2；原型層次最豐富、決戰全部有效、相互重疊最低）

---

## 5. ⚠️ 待決定事項

| # | 事項 | 狀態 |
|---|---|---|
| 1 | **最終 6 張卡的組合**——經濟制裁、資產凍結、石油價格戰、戰爭公債、成本強加、消耗突襲 | ✅ 定案 2026-08-23 |
| 2 | 軍工動員 surge 改版——隨 #1 定案而**不需要**（動員型全數落選） | ✅ 結案 2026-08-23 |
| 3 | **數值平衡**——K=50 初值已定；全部金額/比例入 TS 版後統一調整，參數化於 `game/config.ts`，以單元測試鎖定 | 🟡 TS 實作階段處理 |

### 5.1 模擬發現嘅規則缺口（TS 重寫前要補，來源：`prototypes/rules_sim.py` 戰報）

1. **選卡時序矛盾**——收入階段排喺行動卡階段前，但制裁／油價戰效果掛收入。定案：回合開始同時密秘選卡 → 收入（插效果）→ 揭示 → 部署 → 結算 → 回合末；「行動卡階段」改名「揭示階段」
2. **初始控制權未定義**——模擬採用全中立開局；若改「各控兩區」平衡要重驗 🟡
3. **石油價格戰空轉**——對手零控制區時出卡浪費。建議無合法目標時退回手牌 🟡
4. **資產凍結低國庫硬控**——國庫 <$30 全凍，決戰等於禁手；平衡測試重點場景 🟡
5. **成本強加係通脹源**——系統憑空注資；1v1 四回合可接受，二期沙盒要重新設計 🟡
6. ~~衛冕計分假設~~ → ✅ 由 §3.4 鎮壓折減解決（衛冕照計分但變貴）

---

## 6. 技術架構（摘要）

### 6.1 目錄結構

```
├── src/                      # TypeScript 後端（strict，tsc 編譯到 dist/）
│   ├── server.ts / config.ts / logger.ts
│   ├── ws/connection.ts      # 連線生命週期、JSON parse 保護、訊息路由、限速
│   ├── game/
│   │   ├── RoomManager.ts    # 房間表、唯一 4 碼房號、自動清理
│   │   ├── Room.ts           # 玩家/旁觀者、廣播、聊天、斷線處理
│   │   ├── Game.ts           # 5 階段回合狀態機
│   │   ├── cards.ts          # 行動卡效果引擎（純函數）
│   │   ├── economy.ts        # 收入/支出/凍結/結算純函數
│   │   └── Player.ts         # 玩家金流實體 + 驗證
│   └── chat/chatStore.ts     # MongoDB 介面化儲存庫（失敗退回記憶體模式）
├── shared/protocol.js + .d.ts  # 協議 v2（camelCase、{type,payload}、無錯字）
├── public/                   # 原生前端（零構建、戰情中心風）
├── tests/                    # vitest：規則引擎全覆蓋 + 假 WS 客戶端整合測試
├── docs/                     # 本文檔 + 課堂原始文件 + RULEBOOK + IMPROVEMENTS
├── .github/workflows/ci.yml  # lint → test → build → docker build
└── Dockerfile（多階段）/ docker-compose.yml（mongo:7）/ .env.example
```

### 6.2 技術要點

- **協議 v2**：結構化事件（`phaseChanged`、`cardRevealed`、`regionResolved`、`settlement` 帶完整算式明細）驅動前端動畫；修正所有錯字（`UPDATA_LABEL`→`updateState` 等）
- **多房間**：玩家建立/用房號加入；額滿自動旁觀；房間清空自動銷毀；上限 50 房、每房 10 旁觀者
- **安全**：入站訊息 schema 驗證、`JSON.parse` 保護、`readyState` 檢查、聊天限速、前端一律 `textContent` 渲染（根治原版儲存型 XSS）
- **MongoDB**：每房間聊天、只回放最近 100 則、指數退避重試、DB 不可用時退回記憶體模式、SIGTERM 優雅關閉
- **前端**：大廳（房間列表）+ 房間（戰區地圖板、5 階段指示、部署面板、卡牌 UI、結算 overlay、聊天側欄）；深黑藍＋螢光綠/琥珀、等寬數字、CSS 掃描線質感；移除 7MB 影片背景；響應式、aria-live
- **測試**：經濟引擎全覆蓋、狀態機轉移、房間生命週期、雙假 WS 客戶端完整 4 回合對局（聊天用記憶體 fake）

### 6.3 Repo 清理清單

- `git rm` 58MB `proxy-war-image.tar` 與 `Wallpaper.mp4`（不重寫歷史；日後可用 git-filter-repo 徹底瘦身）
- `.gitignore` 補齊（dist、.env、coverage、*.tar、node_modules）
- `Documentation.docx`、`gameplay.txt` 移入 `docs/`

### 6.4 帳密系統與排行榜 ✅ 定案 2026-08-23（方案 C：完整帳密）

**決策**：加入註冊／登入系統，排行榜綁真實帳號。

| 項目 | 決定 |
|---|---|
| 認證 | 用戶名（3-16 英數底線）+ 密碼（≥8），bcrypt(10) hash 存儲 |
| Session | JWT HS256，7 日有效，secret 由 `JWT_SECRET` env 提供 |
| 儲存 | MongoDB `users` 集合（username 唯一索引）＋ `matches` 對局明細；DB 不可用退記憶體模式（遊戲可玩、統計暫緩） |
| 排行榜 | ELO（K=32，起始 1000，零和）；終局自動入帋勝/敗/和＋ELO 變動＋對局紀錄 |
| WS 認證 | 連線後首則訊息帶 token 驗證；房間制玩法唔強制登入，排行榜先需要 |

**模組**：`src/auth/userRepo.ts`（repo + memory fallback）、`src/auth/authService.ts`（register/login/verify JWT）、`src/game/ranking.ts`（eloDeltas + recordMatch）。

---

## 7. 執行順序（後續實作，每階段一個 commit）

1. `chore:` repo 清理
2. `feat(server):` TS 腳手架 + 協議 v2 + 規則引擎（含測試）
3. `feat(server):` 多房間 + 連線硬化 + 聊天儲存
4. `feat(web):` 戰情中心風大廳 + 房間 UI
5. `feat(infra):` Docker + CI
6. `docs:` 雙語 README + RULEBOOK + 研究引用 + 截圖 + IMPROVEMENTS.md

**完成標準**：`npm test` / `lint` / `build` 全綠；`docker compose up` 一鍵可玩；兩個瀏覽器實測完整 4 回合對局（建房/加入/旁觀/行動卡/決戰 ×2/斷線判負全部走通）。

---

## 8. 研究來源

**戰爭金融（課稅/借貸/印鈔三分法）**
- [Paying for World War I: The Creation of the Liberty Bond — Richmond Fed](https://www.richmondfed.org/publications/research/econ_focus/2016/q1/economic_history)
- [War, the National Debt, Taxes, and the Creation of Money — NWTRCC](https://nwtrcc.org/war-tax-resistance-resources/readings/war-the-national-debt-taxes-and-the-creation-of-money/)
- [War Finance Methods and Public Support for War — Peace Science Digest](https://warpreventioninitiative.org/peace-science-digest/war-finance-methods-and-public-support-for-war/)

**經濟戰工具分類**
- [Economic Warfare — Britannica](https://www.britannica.com/topic/economic-warfare)
- [The New Tools of Economic Warfare — CNAS](https://www.lawandsecurity.org/wp-content/uploads/2016/04/FINAL-CNASReport-EconomicWarfare-160408v02.pdf)
- [Beyond Sanctions — Modern War Institute, West Point](https://mwi.westpoint.edu/beyond-sanctions-economic-warfare-and-modern-military-conflict/)

**冷戰經濟戰（石油價格戰）**
- [How Saudi Arabia's oil policy triggered the collapse of the USSR — Russia Beyond](https://www.rbth.com/history/331825-saudi-arabia-oil-crisis-ussr-collapse)

**現代案例（俄烏衝突的經濟戰工具）**
- [What is the status of Russia's frozen sovereign assets? — Brookings](https://www.brookings.edu/articles/what-is-the-status-of-russias-frozen-sovereign-assets/)
- [G7 ERA $50B loans — U.S. Treasury](https://home.treasury.gov/news/press-releases/jy2744)
- [EU 20th Sanctions Package — Council of the EU](https://www.consilium.europa.eu/en/press/press-releases/2026/04/23/russia-s-war-of-aggression-against-ukraine-20th-round-of-stern-eu-sanctions-hits-energy-military-industrial-complex-trade-and-financial-services-including-crypto/)
- [Ukraine Democracy Defense Lend-Lease Act — Wikipedia](https://en.wikipedia.org/wiki/Ukraine_Democracy_Defense_Lend-Lease_Act)

**消耗經濟學**
- [David vs. Goliath: Cost Asymmetry in Warfare — RAND](https://www.rand.org/pubs/commentary/2025/03/david-vs-goliath-cost-asymmetry-in-warfare.html)
- [Russia Is Right: The US Is Waging a Proxy War in Ukraine — AEI](https://www.aei.org/commentary/russia-is-right-the-us-is-waging-a-proxy-war-in-ukraine/)
