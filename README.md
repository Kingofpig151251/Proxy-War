# PROXY WAR v2 — 代・理・戰・爭

戰爭經濟學多人心理博弈：4 回合、4 戰區、6 張行動卡。虛張聲勢者勝。

> 規則真相源：[`docs/DESIGN.md`](docs/DESIGN.md)（§3.4 鎮壓折減 K=50、六卡組合、公債 $40 等全部定案）

## 架構

```
shared/protocol.ts     前後端共用型別協議（單一真相源）
src/game/              規則引擎（純函數）＋房間管理
src/auth/              帳密系統（bcrypt + JWT）
src/api/routes.ts      REST: /api/auth/*, /api/leaderboard
src/ws/connection.ts   WebSocket 硬化（schema驗證/限速64KB/心跳）
client/                React UI（Vite 構建到 public/）
```

## 快速開始

```bash
npm install
npm run build          # server tsc + client vite
JWT_SECRET=x npm start # http://localhost:3000

# 測試（42 單元 + E2E 兩 bot 打足一場）
npx vitest run
JWT_SECRET=e2e-secret PORT=3210 node dist/src/server.js &
PORT=3210 node scripts/e2e-smoke.mjs
```

## Docker 部署

```bash
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env
docker compose up -d --build
# → http://localhost:3000
```

Mongo 可選：未設 `MONGO_URL` 自動退回記憶體模式（遊戲照常，統計暫緩）。

## 排行榜

- 訪客即開即玩；**登入用戶對局先計 ELO**（K=32 零和，同分 ±16）
- `GET /api/leaderboard` → top 20
- WS 身份：連線時帶 `/ws?token=<jwt>`（瀏覽器 WS 不支援自訂 header）

## 玩法速覽

每回合：**密選行動卡 → 收入結算（插卡效果）→ 同時揭示 → 密分預算部署 → 逐區結算**

四區：邊境 1VP / 工業帶 2VP / 油田 2VP / 首都 3VP。
第 4 回合分高者勝；同分比首都，再同分真和局。

六卡（每場限用一次）：制裁 / 凍結 / 油價戰 / 公債 / 成本轉嫁 / 消耗突襲
