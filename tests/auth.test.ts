/**
 * Auth + 排行榜測試（記憶體 repo，無需真 DB）。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { AuthService, AuthError } from '../src/auth/authService.js';
import { openUserRepo, type UserRepo } from '../src/auth/userRepo.js';
import { eloDeltas, recordMatch } from '../src/game/ranking.js';

let R: UserRepo;
let svc: AuthService;

beforeAll(async () => {
  R = await openUserRepo(null);
  svc = new AuthService(R, 'test-secret-please-change');
});

describe('AuthService', () => {
  it('註冊→登入→verify 閉環', async () => {
    const reg = await svc.register('hunter_2', 'supersecret99');
    expect(reg.user.username).toBe('hunter_2');
    expect(reg.user.elo).toBe(1000);

    const login = await svc.login('hunter_2', 'supersecret99');
    expect(svc.verify(login.token).username).toBe('hunter_2');
  });

  it('密碼有 hash 唔存明文', async () => {
    await svc.register('hashcheck', 'supersecret99');
    const u = await R.find('hashcheck');
    expect(u!.passHash).not.toContain('supersecret99');
    expect(await bcrypt.compare('supersecret99', u!.passHash)).toBe(true);
  });

  it('錯密碼／重複註冊被拒', async () => {
    await svc.register('dup', 'password123');
    await expect(svc.login('dup', 'wrongpass1')).rejects.toBeInstanceOf(AuthError);
    await expect(svc.register('dup', 'another123')).rejects.toBeInstanceOf(AuthError);
  });

  it('用戶名規則：3-16 英數底線', async () => {
    await expect(svc.register('ab', 'password123')).rejects.toBeInstanceOf(AuthError);
    await expect(svc.register('有中文名', 'password123')).rejects.toBeInstanceOf(AuthError);
    await expect(svc.register('bad name', 'password123')).rejects.toBeInstanceOf(AuthError);
    await expect(svc.register('ok_name_16x', 'password123')).resolves.toBeTruthy();
  });

  it('弱密碼拒絕', async () => {
    await expect(svc.register('weakpw', 'short')).rejects.toBeInstanceOf(AuthError);
  });

  it('假 token 拒絕', () => {
    expect(() => svc.verify('forged.token.here')).toThrow(AuthError);
  });
});

describe('ELO 與排行榜', () => {
  it('同分對決：勝 +16 / 敗 −16', () => {
    const [dBlue, dRed] = eloDeltas(1000, 1000, 'blue');
    expect(dBlue).toBe(16);
    expect(dRed).toBe(-16);
  });

  it('平手：同分互不變', () => {
    const [dB, dR] = eloDeltas(1000, 1000, null);
    expect(dB).toBe(0);
    expect(dR).toBe(0);
  });

  it('以下犯上贏更多：1000 勝 1200 至少 +19', () => {
    const [dLow] = eloDeltas(1000, 1200, 'blue');
    expect(dLow).toBeGreaterThanOrEqual(19);
  });

  it('recordMatch 入帳＋零和', async () => {
    await svc.register('eloA', 'password123');
    await svc.register('eloB', 'password123');
    await recordMatch(R, { username: 'eloA' }, { username: 'eloB' }, 'blue', '測試');
    const a = (await R.find('eloA'))!;
    const b = (await R.find('eloB'))!;
    expect(a.stats.wins).toBe(1);
    expect(b.stats.losses).toBe(1);
    expect(a.stats.elo + b.stats.elo).toBe(2000); // 零和
  });

  it('top() 按 ELO 排序', async () => {
    const list = await R.top(10);
    expect(list.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1]!.stats.elo).toBeGreaterThanOrEqual(list[i]!.stats.elo);
    }
  });
});
