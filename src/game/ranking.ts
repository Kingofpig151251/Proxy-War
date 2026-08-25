/**
 * ELO（K=32，標準雙人制）＋ 對局結果入帳。
 */
import type { Seat } from '../game/economy.js';
import type { UserRepo } from '../auth/userRepo.js';

const K = 32;

/** 回傳 [blueDelta, redDelta] */
export function eloDeltas(blueElo: number, redElo: number, winner: Seat | null): [number, number] {
  const expectedBlue = 1 / (1 + 10 ** ((redElo - blueElo) / 400));
  const scoreBlue = winner === 'blue' ? 1 : winner === null ? 0.5 : 0;
  const dBlue = Math.round(K * (scoreBlue - expectedBlue));
  // 避免 -0：Object.is(-0, 0) 為 false，會搞亂測試同 JSON 比對
  const dRed = dBlue === 0 ? 0 : -dBlue;
  return [dBlue, dRed];
}

export interface PlayerRef {
  username: string;
}

export async function recordMatch(
  repo: UserRepo,
  blue: PlayerRef,
  red: PlayerRef,
  winner: Seat | null,
  reason: string,
): Promise<void> {
  const [b, r] = await Promise.all([
    repo.find(blue.username),
    repo.find(red.username),
  ]);
  if (!b || !r) return; // 記憶體模式下帳號一定在；防禦性跳過
  const [dBlue, dRed] = eloDeltas(b.stats.elo, r.stats.elo, winner);
  await repo.recordResult(blue.username, winner === 'blue' ? 'win' : winner === null ? 'draw' : 'loss', dBlue);
  await repo.recordResult(red.username, winner === 'red' ? 'win' : winner === null ? 'draw' : 'loss', dRed);

  // 對局紀錄（排行榜明細用）；失敗不影響遊戲
  try {
    await repo.appendMatch?.({
      playedAt: new Date(),
      blue: blue.username,
      red: red.username,
      winner: winner ?? 'draw',
      reason,
      eloBlue: dBlue,
      eloRed: dRed,
    });
  } catch {
    /* 統計非關鍵路徑 */
  }
}
