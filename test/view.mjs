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
// a section with a see-through canvas drawn over its heading (accessgrid's call to action): the heading, the text and
// the canvas all stay, the heading keeps its own font and one line, and the canvas plays in the view
await page.eval('window.__spViewClose?.()'); await wait(1300);
const html2 = `<body style="margin:0;background:#fff;font-family:Helvetica"><section id="s" style="position:relative;overflow:hidden;padding:120px 0;background:#fff;font-family:Georgia"><canvas id="cv" width="1440" height="400" style="position:absolute;left:0;top:0;width:100%;height:100%;z-index:1;pointer-events:none"></canvas><div style="display:flex;flex-direction:column;align-items:center;gap:40px"><h2 style="font-size:56px;margin:0;text-align:center"><span style="display:block">Mobile credentials.</span><span style="display:block">Zero complexity.</span></h2><div style="position:relative;z-index:2;display:flex;gap:16px"><a style="background:#2b64f8;color:#fff;padding:8px 12px;border-radius:5px">Get started</a><a style="background:#eee;padding:8px 12px;border-radius:5px">Contact sales</a></div></div></section><script>const c = document.getElementById("cv").getContext("2d"); const go = (t) => { c.clearRect(0, 0, 1440, 400); c.strokeStyle = "#2b64f8"; c.strokeRect(200 + Math.sin(t / 300) * 40, 100, 60, 60); requestAnimationFrame(go); }; requestAnimationFrame(go);</script></body>`;
await page.send('Page.navigate', { url: 'data:text/html,' + encodeURIComponent(html2) }); await wait(600);
await page.eval(`window.__spTheme = ${JSON.stringify(THEME)}; window.__spIcons = ${JSON.stringify(ICONS)}; window.__spKit = (${spKit})(); window.__spSnap = ${snapshot}; window.__spViewer = ${viewer}; window.__spInstant = ${instant};`);
const r2 = await page.eval(`(async () => { const x = await window.__spInstant(document.getElementById('s'), 'Section'); return x.layers.map((l) => l.name); })()`);
check(r2.some((n) => /Mobile credentials/.test(n)) && r2.some((n) => /Zero complexity/.test(n)), 'a see-through canvas over the heading does not hide it', r2);
check(r2.some((n) => /^Animation/.test(n)), 'the canvas is a live Animation layer', r2);
await wait(1800);
const lay = await page.eval(`(() => { const r = document.querySelector('site-prompt-view').shadowRoot; const sp = r.querySelector('.copy span'); const cs = getComputedStyle(sp); const cv = [...r.querySelectorAll('.copy canvas')]; const drawn = cv.some((k) => { try { return k.getContext('2d').getImageData(0, 0, k.width, k.height).data.some((v) => v > 0); } catch { return false; } }); return { font: cs.fontFamily, h: Math.round(sp.getBoundingClientRect().height / parseFloat(cs.lineHeight === 'normal' ? cs.fontSize : cs.lineHeight)), drawn }; })()`);
check(/Georgia/.test(lay.font), 'the copy keeps the page font (the view styles do not leak in)', lay.font);
check(lay.drawn, 'the canvas pixels are drawn in the view', lay);
// a menu open on hover, picked, then closed by the time Break it down is pressed: the view shows it open, as clicked
await page.eval('window.__spViewClose?.()'); await wait(1300);
const html3 = `<body style="margin:0;font-family:Helvetica"><nav style="padding:20px"><button>Developers</button><div id="m" style="position:absolute;top:60px;left:20px;width:480px;padding:24px;border-radius:12px;background:#fff;box-shadow:0 8px 30px rgba(0,0,0,.15);transition:opacity .15s"><h3 style="margin:0">Guides</h3><p>Learn, create, innovate</p><h3>Tools</h3><p>Our resources</p></div></nav></body>`;
await page.send('Page.navigate', { url: 'data:text/html,' + encodeURIComponent(html3) }); await wait(600);
await page.eval(`window.__spTheme = ${JSON.stringify(THEME)}; window.__spIcons = ${JSON.stringify(ICONS)}; window.__spKit = (${spKit})(); window.__spSnap = ${snapshot}; window.__spViewer = ${viewer}; window.__spInstant = ${instant};`);
const r3 = await page.eval(`(async () => { const m = document.getElementById('m'); const pre = await window.__spInstant(m, '', null, false); m.style.opacity = '0'; m.style.visibility = 'hidden'; const x = await window.__spInstant(m, 'Menu', null, true, pre); return { from: x.fromClick, layers: x.layers.map((l) => l.name) }; })()`);
await wait(1800);
const shown = await page.eval(`(() => { const r = document.querySelector('site-prompt-view').shadowRoot; const h = [...r.querySelectorAll('.copy h3')].find((e) => getComputedStyle(e).visibility === 'visible'); if (!h) return null; let op = 1; for (let x = h; x; x = x.parentElement) op *= parseFloat(getComputedStyle(x).opacity); const b = h.getBoundingClientRect(); return { text: h.textContent, op: Math.round(op * 100) / 100, w: Math.round(b.width) }; })()`);
check(r3.from && r3.layers.some((n) => /Guides/.test(n)), 'a menu that closed after it was picked breaks down as it was when clicked', r3);
check(shown && shown.op > 0.9 && shown.w > 10, 'and the view shows it open, not the closed menu', shown);
// a menu like accessgrid's: a hidden panel stacked over the shown one, and line art clipped through a <clipPath>
await page.eval('window.__spViewClose?.()'); await wait(1300);
const html4 = `<body style="margin:0;font-family:Helvetica"><div id="w" style="display:grid;width:600px;margin:40px;background:#fff"><div style="grid-area:1/1"><a style="display:block;background:#fff;padding:16px"><h2 style="margin:0;font-size:15px">Tools</h2><svg width="280" height="200" viewBox="0 0 280 200"><g clip-path="url(#cl)"><circle cx="140" cy="100" r="80" fill="none" stroke="#d9d9de" stroke-width="2"/><path d="M0 0 L280 200" stroke="#d9d9de"/></g><defs><clipPath id="cl"><rect width="280" height="200"/></clipPath></defs></svg></a></div><div style="grid-area:1/1;opacity:0;pointer-events:none"><a style="display:block;background:#fff;padding:16px"><h2 style="margin:0">Pricing</h2><p>Plans</p></a></div></div></body>`;
await page.send('Page.navigate', { url: 'data:text/html,' + encodeURIComponent(html4) }); await wait(600);
await page.eval(`window.__spTheme = ${JSON.stringify(THEME)}; window.__spIcons = ${JSON.stringify(ICONS)}; window.__spKit = (${spKit})(); window.__spSnap = ${snapshot}; window.__spViewer = ${viewer}; window.__spInstant = ${instant};`);
const r4 = await page.eval(`(async () => { const x = await window.__spInstant(document.getElementById('w'), 'Menu'); return { covered: x.why.covered, layers: x.layers.map((l) => l.name + ' ' + l.members.length) }; })()`);
check(r4.covered === 0 && r4.layers.some((n) => /Tools/.test(n)), 'an invisible panel stacked on top hides nothing', r4);
await wait(1800);
const clip = await page.eval(`(() => { const r = document.querySelector('site-prompt-view').shadowRoot; const rects = [...r.querySelectorAll('clipPath rect')]; return rects.length && rects.every((x) => getComputedStyle(x).visibility === 'visible'); })()`);
check(clip, 'clip shapes stay visible in every layer copy, so clipped art still paints');
close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
