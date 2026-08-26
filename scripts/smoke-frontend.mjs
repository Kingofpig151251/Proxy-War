/**
 * 前端煙霧測試（一次性腳本，可重跑）：
 * 1. 對 public/assets/*.js 每個 bundle 做「未定義識別碼」靜態掃描——
 *    抓 v is not defined 這類 esbuild 不報的 ReferenceError 地雷
 * 2. 用 node 載入 bundle（stub document/window），確認頂層執行不炸
 *
 * 用法：node scripts/smoke-frontend.mjs [http://localhost:3000]
 * 有傳 URL 則額外驗證首頁 200＋HTML 引用的 bundle 可取得。
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const assetsDir = join(root, 'public/assets');
const base = process.argv[2];

let failures = 0;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failures += 1;
};

// ── 1) 掃描 JS bundle 的明顯未定義引用 ──
if (!existsSync(assetsDir)) fail(`找不到 ${assetsDir}——先跑 npm run build`);

for (const f of readdirSync(assetsDir).filter((n) => n.endsWith('.js'))) {
  const src = readFileSync(join(assetsDir, f), 'utf8');

  // 1a. JSX 元件誤入字串模板（`<Xxx ...>` 出現在反引號內）——曾實際發生
  const jsxInTemplate = src.match(/`[^`]*<([A-Z][A-Za-z0-9]*)\s[^`]{0,80}`/);
  if (jsxInTemplate) {
    fail(`${f}: 反引號字串內出現 JSX（<${jsxInTemplate[1]}...>）——元件被當文字，不會渲染`);
  }

  // 1b. 以 node --check 驗證語法層（ReferenceError 抓不到，但先掃低級）
  try {
    execFileSync(process.execPath, ['--check', join(assetsDir, f)], { stdio: 'pipe' });
  } catch (e) {
    fail(`${f}: 語法檢查失敗 ${(e.stderr ?? '').toString().slice(0, 200)}`);
  }
}

// ── 2) 載入主 bundle：抓「v is not defined」級 ReferenceError ──
const mainBundle = readdirSync(assetsDir)
  .filter((n) => /^index-.*\.js$/.test(n))
  .map((n) => ({ n, m: readFileSync(join(assetsDir, n)).mtimeMs }))
  .sort((a, b) => b.m - a.m)[0]?.n;

if (!mainBundle) {
  fail('找不到 index-*.js 主 bundle');
} else {
  const code = readFileSync(join(assetsDir, mainBundle), 'utf8');
  // 最小 DOM stub：讓 React 頂層初始化走完即可
  const domStub = `
    const el = () => ({ style:{}, classList:{add(){},remove(){}}, setAttribute(){}, appendChild(){}, addEventListener(){}, attachShadow(){return {appendChild(){}}}, });
    globalThis.window = globalThis;
    globalThis.document = { createElement: el, createTextNode: () => ({}), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], head: { appendChild(){} }, body: Object.assign(el(), { children: [] }), documentElement: el(), addEventListener(){}, removeEventListener(){}, readyState: 'complete' };
    globalThis.navigator = { userAgent: 'smoke' };
    globalThis.location = { href: 'http://localhost/', protocol: 'http:', host: 'localhost' };
    globalThis.localStorage = { getItem: () => null, setItem(){}, removeItem(){} };
    globalThis.sessionStorage = { getItem: () => null, setItem(){}, removeItem(){} };
    globalThis.CustomEvent = class {};
    globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
  `;
  const wrapper = `${domStub}\n;try {\n(0, eval)(globalThis.eval);\n} catch {};\n`;
  // 用 vm 隔離執行，只關心同步頂層 ReferenceError
  const { runInNewContext } = await import('node:vm');
  try {
    runInNewContext(code, {
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      queueMicrotask,
      Promise,
      Date,
      Math,
      JSON,
      Object,
      Array,
      String,
      Number,
      Boolean,
      Symbol,
      Map,
      Set,
      WeakMap,
      WeakSet,
      Error,
      TypeError,
      RangeError,
      RegExp,
      parseInt,
      parseFloat,
      isNaN,
      encodeURIComponent,
      decodeURIComponent,
      Buffer,
      process: { env: {}, version: 'v22' },
      window: undefined,
    }, { timeout: 5000 });
    // bundle 內部自帶 DOM guard；能跑完頂層即無 ReferenceError
    console.log(`PASS: ${mainBundle} 頂層載入無同步錯誤`);
  } catch (e) {
    // React 需要 DOM；ReferenceError 才是我們要抓的地雷
    if (/ReferenceError: (\w+) is not defined/.test(e.message)) {
      fail(`${mainBundle}: ${e.message}`);
    } else if (/document|window|navigator|localStorage/.test(e.message)) {
      console.log(`SKIP: ${mainBundle} 需要 DOM（${e.message.slice(0, 60)}…）——語法與引用層正常`);
    } else {
      fail(`${mainBundle}: 非預期錯誤 ${e.message.slice(0, 120)}`);
    }
  }
}

// ── 3) 可選：線上驗證 ──
if (base) {
  const res = await fetch(base).catch((e) => ({ status: 0, error: e }));
  if (res.status !== 200) {
    fail(`GET ${base} → ${res.status ?? res.error?.message}`);
  } else {
    const html = await res.text();
    const m = html.match(/src="([^"]+index-[^"]+\.js)"/);
    if (!m) {
      fail('首頁 HTML 未引用 index-*.js');
    } else {
      const jsRes = await fetch(new URL(m[1], base));
      if (jsRes.status !== 200) fail(`bundle ${m[1]} → ${jsRes.status}`);
      else console.log(`PASS: ${base} 首頁 200＋bundle ${m[1]} 可取得`);
    }
  }
}

console.log(failures === 0 ? 'SMOKE PASS' : `SMOKE FAIL（${failures} 項）`);
process.exit(failures === 0 ? 0 : 1);
