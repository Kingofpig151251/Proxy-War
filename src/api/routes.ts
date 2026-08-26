/**
 * HTTP 路由：/api/auth/*（register/login/me）、/api/leaderboard、健康檢查。
 * 靜態前端由 server.ts 掛 public/。
 */
import { Router, type Request, type Response } from 'express';
import { AuthService, AuthError } from '../auth/authService.js';
import type { UserRepo } from '../auth/userRepo.js';

export function apiRouter(auth: AuthService, repo: UserRepo): Router {
  const r = Router();

  const sendAuthError = (res: Response, e: unknown) => {
    if (e instanceof AuthError) {
      res.status(400).json({ error: e.message });
    } else {
      res.status(500).json({ error: '伺服器內部錯誤' });
    }
  };

  r.post('/auth/register', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body ?? {};
      const out = await auth.register(String(username ?? ''), String(password ?? ''));
      res.json(out);
    } catch (e) {
      sendAuthError(res, e);
    }
  });

  r.post('/auth/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body ?? {};
      const out = await auth.login(String(username ?? ''), String(password ?? ''));
      res.json(out);
    } catch (e) {
      sendAuthError(res, e);
    }
  });

  /** 一鍵體驗：自動建立唯一訪客帳號並登入（無需註冊） */
  r.post('/auth/guest', async (_req: Request, res: Response) => {
    try {
      const out = await auth.guestLogin();
      res.json(out);
    } catch (e) {
      sendAuthError(res, e);
    }
  });

  r.get('/auth/me', (req: Request, res: Response) => {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: '未登入' });
    try {
      const { username } = auth.verify(h.slice(7));
      res.json({ username });
    } catch {
      res.status(401).json({ error: 'token 無效' });
    }
  });

  r.get('/leaderboard', async (_req: Request, res: Response) => {
    try {
      const top = await repo.top(20);
      res.json({ top });
    } catch {
      res.json({ top: [] });
    }
  });

  return r;
}
