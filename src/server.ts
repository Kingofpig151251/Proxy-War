/**
 * PROXY WAR v2 伺服器主入口。
 * Express（HTTP auth/排行榜/靜態前端）+ ws（WebSocket 遊戲）同一 port。
 * MongoDB 可選：連不上自動退回記憶體模式，遊戲照常運行。
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { MongoClient } from 'mongodb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const PORT = Number(process.env.PORT ?? 3000);
  const MONGO_URL = process.env.MONGO_URL ?? '';
  const JWT_SECRET = process.env.JWT_SECRET ?? '';

  if (!JWT_SECRET) {
    console.error('[fatal] 缺 JWT_SECRET env');
    process.exit(1);
  }

  // ── Mongo（可選）──
  let mongo: MongoClient | null = null;
  if (MONGO_URL) {
    try {
      mongo = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 3000 });
      await mongo.connect();
      console.log('[mongo] connected');
    } catch (e) {
      console.warn('[mongo] 連線失敗，退記憶體模式：', (e as Error).message);
      mongo = null;
    }
  } else {
    console.log('[mongo] 未設 MONGO_URL，用記憶體模式');
  }

  // ── 組裝 ──
  const { openUserRepo } = await import('./auth/userRepo.js');
  const repo = await openUserRepo(mongo);
  const { AuthService } = await import('./auth/authService.js');
  const auth = new AuthService(repo, JWT_SECRET);
  const { RoomManager } = await import('./game/Room.js');
  const manager = new RoomManager(repo);
  const { apiRouter } = await import('./api/routes.js');

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter(auth, repo));
  app.use(express.static(path.join(__dirname, '../../public')));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  const { ConnectionHub } = await import('./ws/connection.js');
  const { LobbyService } = await import('./lobby/LobbyService.js');
  const lobby = new LobbyService(manager);
  const hub = new ConnectionHub(manager, lobby, (token) => {
    try {
      const { username } = auth.verify(token);
      // ELO 即時取；查不到（記憶體模式邊界）以 1000 起始分計
      return Promise.resolve(repo.find(username)).then((u) => ({
        username,
        elo: u?.stats.elo ?? 1000,
      }));
    } catch {
      return null;
    }
  });
  wss.on('connection', (ws, req) => {
    // token 經 query param 傳送：/ws?token=xxx（瀏覽器 WS 不支援自訂 header）
    const url = new URL(req.url ?? '/', 'http://localhost');
    hub.attach(ws, url.searchParams.get('token'));
  });

  // 心跳：30s 清死連線＋檢查重連寬限期；房間清理由 listSummary 惰性觸發＋定時兜底
  setInterval(() => hub.heartbeat(), 30_000).unref();
  setInterval(() => manager.expireAllGraceTimers(), 5_000).unref();
  setInterval(() => manager.cleanupEmpty(), 60_000).unref();

  server.listen(PORT, () => {
    console.log(`[proxy-war] listening :${PORT}｜auth=${auth.mode}｜rooms上限${50}`);
  });

  // SIGTERM 優雅關閉
  const shutdown = () => {
    console.log('[shutdown] closing...');
    wss.clients.forEach((c) => c.close());
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  console.error('[fatal]', e);
  process.exit(1);
});
