/**
 * 重現「登入後連線中斷」：完全模擬瀏覽器流程。
 */
const BASE = `http://127.0.0.1:${process.env.PORT ?? 3210}`;
const stamp = Date.now().toString(36);

async function step(name, fn) {
  try {
    const r = await fn();
    console.log(`[${name}] OK`, r ?? '');
    return r;
  } catch (e) {
    console.log(`[${name}] FAIL:`, e.message);
    throw e;
  }
}

const res = await fetch(`${BASE}/api/auth/register`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: `dbg_${stamp}`, password: 'password123' }),
});
const data = await res.json();
console.log('[register]', res.status, JSON.stringify(data).slice(0, 80));
if (!res.ok) {
  // 已存在就 login
  const l = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: `dbg_${stamp}`, password: 'password123' }),
  });
  console.log('[login-fallback]', l.status);
  Object.assign(data, await l.json());
}
await step('me-verify', async () => {
  const m = await fetch(`${BASE}/api/auth/me`, {
    headers: { authorization: `Bearer ${data.token}` },
  });
  if (!m.ok) throw new Error('me failed ' + m.status);
  return JSON.stringify(await m.json());
});

console.log('\n-- WS connect with token --');
const ws = new WebSocket(`ws://127.0.0.1:${process.env.PORT ?? 3210}/ws?token=${encodeURIComponent(data.token)}`);
let closed = false;
ws.onclose = (ev) => {
  closed = true;
  console.log(`[ws] CLOSED code=${ev.code} reason="${ev.reason}" clean=${ev.wasClean}`);
};
ws.onerror = () => console.log('[ws] ERROR');
ws.onopen = () => console.log('[ws] OPEN');

await new Promise((r) => setTimeout(r, 800));
if (!closed) {
  console.log('[ws] still open after 800ms — sending createRoom');
  ws.send(JSON.stringify({ type: 'createRoom', payload: { name: '除錯員' } }));
  await new Promise((r) => setTimeout(r, 800));
  console.log(closed ? '[ws] closed after createRoom!' : '[ws] still open, got messages ok');
}
// 停 3 秒觀察心跳期會唔會斷（30s 心跳太長，呢度只做短觀察）
await new Promise((r) => setTimeout(r, 2000));
console.log(closed ? '\n❌ REPRODUCED: ws 被關' : '\n✅ ws 保持連住——問題可能喺前端邏輯');
ws.close();
process.exit(0);
