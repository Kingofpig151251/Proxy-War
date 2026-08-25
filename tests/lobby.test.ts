/**
 * LobbyService 單元測試：在線名單、隨機配對、邀請流程、狀態機。
 */
import { describe, expect, it } from 'vitest';
import { LobbyService } from '../src/lobby/LobbyService.js';

/** 最小 RoomManager stub：snapshot 只用到 listSummary */
function stubManager(rooms: ReturnType<typeof roomFactory>[] = []) {
  return { listSummary: () => rooms } as never;
}
function roomFactory(code: string, blue: string, red: string, phase: string) {
  return { code, blue, red, players: 2, spectators: 0, phase, round: 1 };
}

function makeLobby(rooms: Parameters<typeof stubManager>[0] = []) {
  return new LobbyService(stubManager(rooms));
}

describe('LobbyService 在線名單', () => {
  it('連線即上名單；多開分頁要全部斷線才除名', () => {
    const l = makeLobby();
    l.connect('alice', 1000, 1);
    l.connect('alice', 1000, 2);
    let snap = l.snapshot();
    expect(snap.players).toHaveLength(1);

    l.disconnect('alice', 1);
    expect(l.snapshot().players).toHaveLength(1); // 還有一頁在

    l.disconnect('alice', 2);
    expect(l.snapshot().players).toHaveLength(0);
  });

  it('斷線會自動退出排隊', () => {
    const l = makeLobby();
    l.connect('a', 1000, 1);
    l.connect('b', 1000, 2);
    l.joinQueue('a');
    l.disconnect('a', 1);
    // b 排隊不應與已離線者配對
    l.connect('b', 1000, 2);
    expect(l.tryMatch()).toBeNull();
  });
});

describe('匹配隊列', () => {
  it('非 lobby 狀態不可入隊；配對成功雙方轉 playing', () => {
    const l = makeLobby();
    l.connect('a', 1000, 1);
    l.connect('b', 1000, 2);
    l.setStatus('b', 'playing');
    l.joinQueue('b'); // 應被拒
    l.joinQueue('a');
    expect(l.snapshot().queueSize).toBe(1);

    l.setStatus('b', 'lobby');
    l.joinQueue('b');
    const pair = l.tryMatch();
    expect(pair).toEqual(['a', 'b']);
    expect(l.get('a')!.status).toBe('playing');
    expect(l.get('b')!.status).toBe('playing');
  });

  it('tryMatch 遇離線殘留會跳過繼續找', () => {
    const l = makeLobby();
    l.connect('x', 1000, 1);
    l.joinQueue('x');
    // x 直接從名單刪除（模擬內部不一致）
    (l as unknown as { players: Map<string, unknown> }).players.delete('x');
    l.connect('y', 1000, 2);
    l.connect('z', 1000, 3);
    l.joinQueue('y');
    l.joinQueue('z');
    expect(l.tryMatch()).toEqual(['y', 'z']);
  });

  it('leaveQueue 歸位 lobby', () => {
    const l = makeLobby();
    l.connect('a', 1000, 1);
    l.joinQueue('a');
    l.leaveQueue('a');
    expect(l.get('a')!.status).toBe('lobby');
    expect(l.snapshot().queueSize).toBe(0);
  });
});

describe('邀請對局', () => {
  it('只有雙方都在 lobby 才能發邀請；接受後雙方轉 playing', () => {
    const l = makeLobby();
    l.connect('a', 1000, 1);
    l.connect('b', 1000, 2);
    l.setStatus('b', 'playing');
    expect(l.createInvite('a', 'b')).toBeNull(); // 對方對局中

    l.setStatus('b', 'lobby');
    const inv = l.createInvite('a', 'b');
    expect(inv).not.toBeNull();

    const done = l.acceptInvite(inv!.id, 'b');
    expect(done).not.toBeNull();
    expect(l.get('a')!.status).toBe('playing');
    expect(l.get('b')!.status).toBe('playing');
  });

  it('受邀者身份不符／婉拒／失效都正確處理', () => {
    const l = makeLobby();
    l.connect('a', 1000, 1);
    l.connect('b', 1000, 2);
    l.connect('c', 1000, 3);
    const inv = l.createInvite('a', 'b')!;

    expect(l.acceptInvite(inv.id, 'c')).toBeNull(); // 不是受邀者
    expect(l.declineInvite(inv.id, 'c')).toBe(false);
    expect(l.declineInvite(inv.id, 'b')).toBe(true);
    expect(l.acceptInvite(inv.id, 'b')).toBeNull(); // 已被刪
  });

  it('快照含進行中對局且過濾終局房', () => {
    const l = makeLobby([
      roomFactory('ABCD', 'p1', 'p2', 'deploy'),
      roomFactory('EFGH', 'p3', 'p4', 'end'),
    ]);
    const snap = l.snapshot();
    expect(snap.matches).toHaveLength(1);
    expect(snap.matches[0]).toMatchObject({ code: 'ABCD', blue: 'p1', red: 'p2' });
  });
});
