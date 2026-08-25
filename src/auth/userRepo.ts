/**
 * 用戶 repository — MongoDB 持久化，DB 不可用時退回記憶體模式（開發/測試用）。
 * 密碼 bcrypt(10)；JWT HS256 簽發。
 */
import type { Collection, Db, MongoClient } from 'mongodb';

export interface UserDoc {
  username: string; // 唯一、3-16 字元 [A-Za-z0-9_]
  passHash: string;
  createdAt: Date;
  stats: { wins: number; losses: number; draws: number; elo: number };
}

export interface MatchRecord {
  playedAt: Date;
  blue: string;
  red: string;
  winner: 'blue' | 'red' | 'draw';
  reason: string;
  eloBlue: number;
  eloRed: number;
}

export interface UserRepo {
  create(username: string, passHash: string): Promise<UserDoc>;
  find(username: string): Promise<UserDoc | null>;
  /** 對局結果入帳（冪等由調用方保證） */
  recordResult(
    username: string,
    result: 'win' | 'loss' | 'draw',
    eloDelta: number,
  ): Promise<void>;
  top(n: number): Promise<Pick<UserDoc, 'username' | 'stats'>[]>;
  /** 對局明細；記憶體模式可選實作 */
  appendMatch?(rec: MatchRecord): Promise<void>;
  mode: 'mongo' | 'memory';
}

const ELO_START = 1000;

function makeMemoryRepo(): UserRepo {
  const users = new Map<string, UserDoc>();
  const matches: MatchRecord[] = [];
  return {
    mode: 'memory',
    async create(username, passHash) {
      if (users.has(username)) throw new Error('username taken');
      const u: UserDoc = {
        username,
        passHash,
        createdAt: new Date(),
        stats: { wins: 0, losses: 0, draws: 0, elo: ELO_START },
      };
      users.set(username, u);
      return u;
    },
    async find(username) {
      return users.get(username) ?? null;
    },
    async recordResult(username, result, eloDelta) {
      const u = users.get(username);
      if (!u) return;
      u.stats.elo += eloDelta;
      if (result === 'win') u.stats.wins += 1;
      else if (result === 'loss') u.stats.losses += 1;
      else u.stats.draws += 1;
    },
    async top(n) {
      return Array.from(users.values())
        .sort((a, b) => b.stats.elo - a.stats.elo)
        .slice(0, n)
        .map((u) => ({ username: u.username, stats: { ...u.stats } }));
    },
    async appendMatch(rec) {
      matches.push(rec);
    },
  };
}

function makeMongoRepo(db: Db): UserRepo {
  const col: Collection<UserDoc> = db.collection('users');
  const matches: Collection<MatchRecord> = db.collection('matches');
  return {
    mode: 'mongo',
    async create(username, passHash) {
      const u: UserDoc = {
        username,
        passHash,
        createdAt: new Date(),
        stats: { wins: 0, losses: 0, draws: 0, elo: ELO_START },
      };
      await col.insertOne(u);
      return u;
    },
    async find(username) {
      return (await col.findOne({ username })) ?? null;
    },
    async recordResult(username, result, eloDelta) {
      const inc: Record<string, number> = { 'stats.elo': eloDelta };
      if (result === 'win') inc['stats.wins'] = 1;
      else if (result === 'loss') inc['stats.losses'] = 1;
      else inc['stats.draws'] = 1;
      await col.updateOne({ username }, { $inc: inc });
    },
    async top(n) {
      const docs = await col
        .find({}, { projection: { username: 1, stats: 1 } })
        .sort({ 'stats.elo': -1 })
        .limit(n)
        .toArray();
      return docs.map((d) => ({ username: d.username, stats: d.stats }));
    },
    async appendMatch(rec) {
      await matches.insertOne(rec);
    },
  };
}

/** 無法連上 DB 即退回記憶體模式——遊戲始終可玩，統計暫不持久 */
export async function openUserRepo(client: MongoClient | null): Promise<UserRepo> {
  if (!client) return makeMemoryRepo();
  try {
    await client.db().command({ ping: 1 });
    const repo = makeMongoRepo(client.db());
    // 唯一索引：username
    await client.db().collection('users').createIndex({ username: 1 }, { unique: true });
    return repo;
  } catch {
    return makeMemoryRepo();
  }
}
