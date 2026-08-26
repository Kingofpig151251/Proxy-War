/**
 * 註冊／登入／驗證。JWT secret 由 env 提供；測試可注入固定值。
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import type { UserRepo } from './userRepo.js';

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
/** 訪客帳號用戶名隨機段長度（base36） */
const GUEST_RANDOM_LEN = 8;
/** 訪客帳號保留時長：30 日（長於 JWT 7 日，避免出現死 token 窗口） */
export const GUEST_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class AuthError extends Error {}

export interface AuthedUser {
  username: string;
  elo: number;
}

export class AuthService {
  constructor(
    private repo: UserRepo,
    private jwtSecret: string,
  ) {}

  async register(username: string, password: string): Promise<{ token: string; user: AuthedUser }> {
    if (!USERNAME_RE.test(username)) {
      throw new AuthError('用戶名須為 3-16 字元英數底線');
    }
    if (password.length < 8 || password.length > 128) {
      throw new AuthError('密碼長度須 8-128');
    }
    const exists = await this.repo.find(username);
    if (exists) throw new AuthError('用戶名已被註冊');
    const hash = await bcrypt.hash(password, 10);
    const u = await this.repo.create(username, hash);
    return { token: this.sign(u.username), user: { username: u.username, elo: u.stats.elo } };
  }

  async login(username: string, password: string): Promise<{ token: string; user: AuthedUser }> {
    const u = await this.repo.find(username);
    if (!u) throw new AuthError('用戶名或密碼錯誤');
    const ok = await bcrypt.compare(password, u.passHash);
    if (!ok) throw new AuthError('用戶名或密碼錯誤');
    return { token: this.sign(u.username), user: { username: u.username, elo: u.stats.elo } };
  }

  /**
   * 一鍵體驗：自動建立唯一訪客帳號（guest_ 前綴＋隨機段）。
   * 密碼隨機生成不外流——會話結束即棄，帳號由 purgeStaleGuests 逾齡清理。
   * 每次呼叫順手清理一次過期訪客（惰性 TTL）。
   */
  async guestLogin(): Promise<{ token: string; user: AuthedUser }> {
    await this.repo.purgeStaleGuests(GUEST_TTL_MS);
    for (;;) {
      const suffix = randomBytes(GUEST_RANDOM_LEN)
        .toString('base64url')
        .replaceAll('-', '_')
        .slice(0, GUEST_RANDOM_LEN);
      const name = `guest_${suffix}`;
      try {
        return await this.register(name, this.randomPassword());
      } catch {
        // 用戶名撞車：換一段再試
      }
    }
  }

  private randomPassword(): string {
    return randomBytes(24).toString('base64');
  }

  verify(token: string): { username: string } {
    try {
      const payload = jwt.verify(token, this.jwtSecret);
      if (typeof payload === 'string' || typeof payload.sub !== 'string') {
        throw new AuthError('bad token');
      }
      return { username: payload.sub };
    } catch {
      throw new AuthError('token 無效或過期');
    }
  }

  private sign(username: string): string {
    return jwt.sign({ sub: username }, this.jwtSecret, { expiresIn: '7d' });
  }

  get mode(): 'mongo' | 'memory' {
    return this.repo.mode;
  }
}
