/**
 * SSR 渲染煙霧測試（一次性驗證概念）：
 * 用 react-dom/server 把 App 以「已入房」state 渲染成字串。
 * v is not defined 這類 ReferenceError 在渲染時必炸——SSR 能抓住。
 *
 * 問題：bundle 是 esbuild 產物，無 export；要測源碼而非 bundle。
 * 源碼是 TSX，需要即場轉譯。用 vite 的 ssrLoadModule 最乾淨。
 */
import { createServer } from 'vite';
import { renderToString } from 'react-dom/server';
import React from 'react';

// 瀏覽器全域 stub（node 環境無；store/App 頂層會用到）
const store1 = new Map();
globalThis.localStorage = {
  getItem: (k) => store1.get(k) ?? null,
  setItem: (k, v) => void store1.set(k, v),
  removeItem: (k) => void store1.delete(k),
};
const store2 = new Map();
globalThis.sessionStorage = {
  getItem: (k) => store2.get(k) ?? null,
  setItem: (k, v) => void store2.set(k, v),
  removeItem: (k) => void store2.delete(k),
};
globalThis.location = { protocol: 'http:', host: 'localhost:3000', href: 'http://localhost:3000/' };
globalThis.WebSocket = class {
  send() {}
  close() {}
};
globalThis.window = globalThis;

const vite = await createServer({
  root: new URL('..', import.meta.url).pathname,
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
});

try {
  const { store } = await vite.ssrLoadModule('/client/store.ts');
  const { App } = await vite.ssrLoadModule('/client/ui/App.tsx');

  // 場景一：登入頁
  let html = renderToString(React.createElement(App));
  if (!html.includes('PROXY WAR')) throw new Error('登入頁渲染異常');
  console.log('PASS：登入頁 SSR 正常');

  // 場景二：對局畫面（含 grace pill 路徑）——舊版此處炸 v is not defined
  const fakeView = {
    roomCode: 'TEST',
    phase: 'cardSelect',
    round: 1,
    decisiveRound: false,
    players: [
      { id: 'blue', name: 'alice', treasury: 100, score: 0, debt: 0, frozen: 0, cardsLeft: [], connected: false },
      { id: 'red', name: 'bob', treasury: 100, score: 0, debt: 0, frozen: 0, cardsLeft: [], connected: true },
    ],
    regions: [
      { region: 'frontier', controller: null },
      { region: 'industrial', controller: null },
      { region: 'oilfield', controller: null },
      { region: 'capital', controller: null },
    ],
    yourSeat: 'blue',
    yourTreasury: 100,
    yourFrozen: 0,
    disconnectGrace: { seat: 'blue', deadline: Date.now() + 60_000 },
  };
  const s = store;
  s.view = fakeView;
  s.screen = 'room';
  s.me = 'alice';
  html = renderToString(React.createElement(App));
  if (!html.includes('grace-pill')) throw new Error('grace-pill 未渲染');
  if (!html.includes('斷線')) throw new Error('斷線標示未渲染');
  console.log('PASS：對局畫面 SSR 正常（grace-pill＋斷線標示齊）');

  console.log('RENDER SMOKE PASS');
} finally {
  await vite.close();
}
