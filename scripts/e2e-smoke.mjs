/**
 * E2E 冒煙測試：註冊兩個帳號 → WS 開房 → 打足一場（4回合）→ 驗證終局＋排行榜。
 * 用 node 原生 WebSocket（v22+），零依賴。
 */
const BASE = `http://127.0.0.1:${process.env.PORT ?? 3210}`;
const rand = (n) => Math.floor(Math.random() * n);

class Bot {
  constructor(name, user, pass) {
    this.name = name;
    this.user = user;
    this.pass = pass;
    this.view = null;
    this.joined = null;
    this.log = [];
  }
  async registerOrLogin() {
    const res = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: this.user, password: this.pass }),
    });
    if (!res.ok) {
      const l = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: this.user, password: this.pass }),
      });
      if (!l.ok) throw new Error(`${this.user} login failed: ${l.status}`);
      this.token = (await l.json()).token;
    } else {
      this.token = (await res.json()).token;
    }
  }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${process.env.PORT ?? 3210}/ws?token=${encodeURIComponent(this.token)}`);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = (e) => reject(new Error('ws error'));
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'state') this.view = msg.payload.view;
        if (msg.type === 'joined') this.joined = msg.payload;
        if (msg.type === 'gameOver') this.over = msg.payload;
        if (msg.type === 'roundEnded')
          this.log.push(`R${msg.payload.summary.round}: ${msg.payload.summary.settlements.map((s) => `${s.region} ${s.blueSpend}v${s.redSpend}→${s.winner ?? 'tie'}`).join(' | ')}`);
        if (msg.type === 'error') console.error(`[${this.name}] server error:`, msg.payload.message);
      };
    });
  }
  send(t, p) { this.ws.send(JSON.stringify({ type: t, payload: p })); }
  wait(pred, ms = 8000) {
    const t0 = Date.now();
    return new Promise((resolve, reject) => {
      const iv = setInterval(() => {
        try { if (pred(this)) { clearInterval(iv); resolve(); } } catch {}
        if (Date.now() - t0 > ms) { clearInterval(iv); reject(new Error(`${this.name} timeout`)); }
      }, 50);
    });
  }
}

/** 一個行動週期：選卡→部署，直到遊戲結束 */
async function driveRound(bot) {
  await bot.wait((b) => b.view && !b.over);
  if (b_over(bot)) return false;
  const v = bot.view;
  if (v.phase === 'cardSelect' && v.youSubmittedCard !== true) {
    const me = v.players.find((p) => p.id === v.yourSeat);
    const hand = me?.cardsLeft ?? [];
    const card = hand.length && Math.random() < 0.8 ? hand[rand(hand.length)] : null;
    const payload = { card };
    if (card === 'attritionRaid') {
      payload.target = ['frontier', 'industrial', 'oilfield', 'capital'][rand(4)];
    }
    bot.send('submitCard', payload);
  } else if (v.phase === 'deploy' && v.youSubmittedDeploy !== true) {
    // 可用＝國庫 − 凍結
    const budget = Math.max((v.yourTreasury ?? 0) - (v.yourFrozen ?? 0), 0);
    const regions = ['frontier', 'industrial', 'oilfield', 'capital'];
    const alloc = {};
    let left = budget;
    // 隨機揀兩個區分身
    const picks = [...regions].sort(() => Math.random() - 0.5).slice(0, 2);
    alloc[picks[0]] = Math.min(left, 5 + rand(Math.max(budget >> 1, 1)));
    left -= alloc[picks[0]];
    alloc[picks[1]] = left;
    bot.send('submitDeploy', { allocations: alloc });
  }
  return true;
}
const b_over = (b) => b.view?.phase === 'end' || !!b.over;

async function main() {
  const stamp = Date.now().toString(36);
  const A = new Bot('BotBlue', `bb_${stamp}`, 'password123');
  const B = new Bot('BotRed', `rr_${stamp}`, 'password123');

  await A.registerOrLogin();
  await B.registerOrLogin();
  console.log('[1] 註冊/登入 OK:', A.user, B.user);

  await A.connect();
  await B.connect();
  A.send('createRoom', { name: A.name });
  await A.wait((b) => b.joined);
  console.log('[2] 房間建立:', A.joined.code, 'seat=', A.joined.seat);

  B.send('joinRoom', { code: A.joined.code, name: B.name });
  await B.wait((b) => b.joined);
  console.log('[3] 紅方加入:', B.joined.seat);

  // 打到完場
  let guard = 0;
  while (!b_over(A) && guard++ < 200) {
    await Promise.allSettled([driveRound(A), driveRound(B)]);
    await new Promise((r) => setTimeout(r, 30));
  }
  if (!b_over(A)) throw new Error('遊戲未喺限期內結束');
  console.log('[4] 對局完成：', JSON.stringify(A.over));
  A.log.forEach((l) => console.log('   ', l));

  // 等統計入帳（async）
  await new Promise((r) => setTimeout(r, 600));
  const lb = await (await fetch(`${BASE}/api/leaderboard`)).json();
  const mine = lb.top.filter((u) => [A.user, B.user].includes(u.username));
  console.log('[5] 排行榜：', lb.top.length, '人；本場：',
    mine.map((m) => `${m.username} ELO=${m.stats?.elo} W=${m.stats?.wins} L=${m.stats?.losses}`).join(', '));
  if (mine.length !== 2) throw new Error('排行榜未入帳！');

  // 聊天冒煙
  A.send('chat', { text: '打得漂亮' });
  await new Promise((r) => setTimeout(r, 300));

  A.ws.close();
  B.ws.close();
  console.log('\n✅ E2E SMOKE PASSED');
  process.exit(0);
}

main().catch((e) => {
  console.error('\n❌ E2E FAILED:', e.message);
  process.exit(1);
});
