/**
 * 斷線重連寬限期測試（§3.1 修訂）：
 * 意外斷線保留座位 90 秒，期內同帳號重連歸位，期滿未歸判負；
 * 主動棄賽（leaveGame）不進寬限即刻判負；終局廣播與統計恰好一次。
 */
import { describe, expect, it } from 'vitest';
import { Room } from '../src/game/Room.js';

/** 最小 Conn stub：記錄收過的訊息 */
function stubConn(id: number) {
  const sent: unknown[] = [];
  return {
    id,
    sent,
    send(msg: unknown) {
      sent.push(msg);
    },
    close() {},
  };
}

/** 開一局雙人對局，回傳 {room, conns} */
function makeGame() {
  const room = new Room('TEST');
  const cb = stubConn(1);
  const cr = stubConn(2);
  room.addPlayer({ conn: cb, name: 'alice', username: 'alice' });
  room.addPlayer({ conn: cr, name: 'bob', username: 'bob' });
  return { room, cb, cr };
}

const types = (sent: unknown[]) => sent.map((m) => (m as { type: string }).type);

describe('斷線寬限期', () => {
  it('對局中斷線：座位保留、進入寬限，不即時判負', () => {
    const { room } = makeGame();
    room.removeConn(1); // alice 斷線
    expect(room.game.finished).toBe(false);
    expect(room.reservedSeatFor('alice')).toBe('blue');
    expect(room.game.winner).toBeNull();
  });

  it('寬限期內同帳號重連：認回原座位、清寬限、廣播 reconnected', () => {
    const { room, cr } = makeGame();
    room.removeConn(1);
    const seat = room.reservedSeatFor('alice');
    expect(seat).toBe('blue');

    const cNew = stubConn(3);
    room.reattachPlayer(seat!, { conn: cNew, name: 'alice', username: 'alice' });
    expect(room.seatOf(3)).toBe('blue');
    expect(room.reservedSeatFor('alice')).toBeNull(); // 寬限已清
    // bob 收到 reconnected 廣播＋新 state
    expect(types(cr.sent)).toContain('reconnected');
    expect(room.game.finished).toBe(false);
  });

  it('寬限期滿未歸：判負＋gameOver 廣播恰好一次', () => {
    const { room, cr } = makeGame();
    room.removeConn(1); // alice 斷
    // 直接把期限撥回過去模擬到期
    const slot = room.reservedSeatFor('alice') === 'blue' ? 'blue' : 'red';
    room.forceExpireForTest(slot);
    room.expireGraceIfNeeded();
    expect(room.game.finished).toBe(true);
    expect(room.game.winner).toBe('red');
    expect(room.game.winReason).toContain('逾時');
    // bob 收到 gameOver
    expect(types(cr.sent)).toContain('gameOver');
    // 重複呼叫不再廣播（overAnnounced 幂等）
    const count = types(cr.sent).filter((t) => t === 'gameOver').length;
    room.expireGraceIfNeeded();
    const after = types(cr.sent).filter((t) => t === 'gameOver').length;
    expect(after).toBe(count);
  });

  it('主動棄賽 resignBySeat：即刻判負，無寬限', () => {
    const { room } = makeGame();
    room.resignBySeat('red'); // bob 棄賽
    expect(room.game.finished).toBe(true);
    expect(room.game.winner).toBe('blue');
    expect(room.reservedSeatFor('bob')).toBeNull();
  });

  it('非對局中斷線（終局後）：不觸發寬限也不判定', () => {
    const { room } = makeGame();
    room.resignBySeat('red');
    const before = room.game.winReason;
    room.removeConn(1);
    expect(room.game.winReason).toBe(before); // 不變
    expect(room.reservedSeatFor('alice')).toBeNull();
  });

  it('viewFor 帶出 disconnectGrace 資訊', () => {
    const { room, cr } = makeGame();
    room.removeConn(1);
    const view = room.viewFor(2);
    expect(view.disconnectGrace).toBeDefined();
    expect(view.disconnectGrace!.seat).toBe('blue');
    expect(view.disconnectGrace!.deadline).toBeGreaterThan(Date.now());
  });
});
