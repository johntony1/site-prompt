// Break it down in the page: what is moving keeps moving in the view, as its own layer.
//   node test/view.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const S = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'server') + '/';
const { launch, wait } = await import(S + 'chrome.mjs');
const { instant, viewer } = await import(S + 'viewer.mjs');
const { snapshot } = await import(S + 'component.mjs');
const { spKit } = await import(S + 'kit.mjs');
const { THEME, ICONS } = await import(S + 'theme.mjs');
const { page, close } = await launch({ width: 1440, height: 900 });
const html = `<body style="margin:0;background:#f4f4f5;font-family:Helvetica"><div id="c" style="width:420px;height:260px;margin:200px auto;border-radius:20px;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.12);position:relative;display:grid;place-items:center"><div class="dot" style="width:40px;height:40px;border-radius:50%;background:#f43;animation:pulse 1200ms ease-in-out infinite"></div><p style="position:absolute;bottom:10px;left:20px">Live</p><div id="js" style="position:absolute;top:20px;right:20px;width:24px;height:24px;border-radius:6px;background:#2b64f8"></div></div><script>const j = document.getElementById("js"); const go = (t) => { j.style.transform = "translateY(" + (Math.sin(t / 300) * 30) + "px)"; requestAnimationFrame(go); }; requestAnimationFrame(go);</script><style>@keyframes pulse{50%{transform:scale(1.8);opacity:.4}}</style></body>`;
await page.send('Page.navigate', { url: 'data:text/html,' + encodeURIComponent(html) }); await wait(600);
await page.eval(`window.__spTheme = ${JSON.stringify(THEME)}; window.__spIcons = ${JSON.stringify(ICONS)}; window.__spKit = (${spKit})(); window.__spSnap = ${snapshot}; window.__spViewer = ${viewer}; window.__spInstant = ${instant};`);
const r = await page.eval(`(async () => { const x = await window.__spInstant(document.getElementById('c'), 'Card'); return { layers: x.layers.map((l) => l.name), moving: x.why.moving }; })()`);
let failures = 0;
const check = (ok, label, extra) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra !== undefined ? `  ${JSON.stringify(extra)}` : ''}`); if (!ok) failures++; };
check(r.moving >= 2 && r.layers.some((l) => /^Animation/.test(l)) && r.layers.includes('Surface'), 'the looping dot is its own Animation layer; the card is not torn apart around it', r.layers);
await wait(1800);
const scales = [];
for (let k = 0; k < 4; k++) { scales.push(await page.eval(`(() => { const e = [...document.querySelector('site-prompt-view').shadowRoot.querySelectorAll('.copy .c1')].find((d) => getComputedStyle(d).visibility === 'visible'); return e ? getComputedStyle(e).transform : 'none'; })()`)); await wait(250); }
const ys = [];
for (let k = 0; k < 4; k++) { ys.push(await page.eval(`(() => { const e = [...document.querySelector('site-prompt-view').shadowRoot.querySelectorAll('.copy .c3')].find((d) => getComputedStyle(d).visibility === 'visible'); return e ? new DOMMatrix(getComputedStyle(e).transform).m42 : null; })()`)); await wait(200); }
check(ys.every((y) => y != null) && new Set(ys.map((y) => Math.round(y))).size >= 3, 'a script-driven animation (requestAnimationFrame) is mirrored live too', ys.map((y) => Math.round(y)));
const sc = scales.map((m) => parseFloat(m.match(/matrix\(([\d.]+)/)?.[1] ?? '1'));
check(new Set(sc.map((x) => x.toFixed(2))).size >= 3 && Math.max(...sc) > 1.3, 'and it keeps playing in the view (its scale changes over time)', sc);
close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
