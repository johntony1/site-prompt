// Pick mode end to end, as the person uses it in their own Chrome: a Chrome with remote debugging on (as
// chrome://inspect/#remote-debugging leaves it) is the "own" browser; site_pick attaches to it and puts the picker on
// the page; the test moves the mouse and clicks like a person (a button, a headline, part of an svg drawing), types a
// note, presses Get prompts, and checks each prompt that comes back.
//
//   node test/pick.mjs [out-dir]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome } from '../plugin/server/chrome.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const server = path.resolve(here, '..', 'plugin', 'server', 'server.mjs');
const out = path.resolve(process.argv[2] ?? path.join(here, 'out', 'pick'));
mkdirSync(out, { recursive: true });
const work = mkdtempSync(path.join(os.tmpdir(), 'site-prompt-pick-'));
const profile = mkdtempSync(path.join(os.tmpdir(), 'site-prompt-own-'));

let failures = 0;
const check = (ok, label, extra) => {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra !== undefined ? `  ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`);
	if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Halo</title><style>
body { margin: 0; font-family: Helvetica, Arial, sans-serif; background: #f7f7f4; color: #111; }
.hero { padding: 120px 80px; display: flex; align-items: center; justify-content: space-between; }
h1 { font-size: 64px; line-height: 1.05; letter-spacing: -0.02em; font-weight: 700; margin: 0 0 28px; max-width: 620px; }
.cta { display: inline-flex; align-items: center; height: 48px; padding: 0 22px; border-radius: 12px; background: #111; color: #fff; text-decoration: none; font-size: 15px; font-weight: 600; transition: background-color 180ms ease, box-shadow 180ms ease; box-shadow: 0 1px 0 rgba(255,255,255,.2) inset, 0 6px 16px rgba(0,0,0,.18); }
.cta:hover { background: #2a2a2a; box-shadow: 0 1px 0 rgba(255,255,255,.2) inset, 0 10px 24px rgba(0,0,0,.24); }
.art { width: 320px; height: 320px; }
@media (max-width: 600px) { .hero { flex-direction: column; padding: 48px 20px; } h1 { font-size: 40px; } .art { display: none; } }
</style></head><body>
<section class="hero"><div><h1>Halo keeps your team in orbit</h1><a class="cta" href="/go">Try Halo free</a></div>
<svg class="art" viewBox="0 0 320 320"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb36b"/><stop offset="1" stop-color="#ff5f8a"/></linearGradient></defs>
<circle cx="160" cy="160" r="120" fill="url(#g)"/><circle cx="160" cy="160" r="150" fill="none" stroke="#111" stroke-width="2" stroke-dasharray="6 10"/><circle cx="270" cy="96" r="14" fill="#111"/></svg></section>
</body></html>`;
const site = http.createServer((req, res) => (res.writeHead(200, { 'content-type': 'text/html' }), res.end(PAGE)));
await new Promise((r) => site.listen(0, '127.0.0.1', r));
const URL0 = `http://127.0.0.1:${site.address().port}/`;

// the person's own site, running in dev
const DEV = `<!doctype html><html><head><meta charset="utf-8"><title>My launch</title><style>
:root { --brand: #6d28d9; --radius: 10px; --font-sans: Georgia, serif; }
body { margin: 0; font-family: var(--font-sans); color: #1c1917; background: #fafaf9; }
.hero { padding: 80px; } .hero h1 { font-size: 48px; margin: 0 0 16px; } .btn { background: var(--brand); color: #fff; border-radius: var(--radius); padding: 10px 18px; display: inline-block; }
.features { padding: 60px 80px; background: #fff; }
</style></head><body><section class="hero"><h1>Ship faster with Orbit</h1><a class="btn" href="#">Start</a></section><section class="features"><h2>Everything you need</h2></section></body></html>`;
const devSite = http.createServer((req, res) => (res.writeHead(200, { 'content-type': 'text/html' }), res.end(DEV)));
await new Promise((r) => devSite.listen(0, '127.0.0.1', r));
const DEV_URL = `http://127.0.0.1:${devSite.address().port}/`;

// "their" Chrome, remote debugging on
const chrome = spawn(findChrome(), ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--window-size=1440,900', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
for (let k = 0; k < 300 && !existsSync(path.join(profile, 'DevToolsActivePort')); k++) await sleep(100);
check(existsSync(path.join(profile, 'DevToolsActivePort')), 'the own Chrome is listening (DevToolsActivePort)');

// the person is building a Next.js + Tailwind site
const proj = mkdtempSync(path.join(os.tmpdir(), 'site-prompt-proj-'));
writeFileSync(path.join(proj, 'package.json'), JSON.stringify({ name: 'my-launch', scripts: { dev: 'next dev' }, dependencies: { next: '15.2.0', react: '19.0.0' }, devDependencies: { tailwindcss: '4.1.0' } }));
writeFileSync(path.join(proj, 'tsconfig.json'), '{}');
mkdirSync(path.join(proj, 'src', 'components'), { recursive: true });
mkdirSync(path.join(proj, 'src', 'app'), { recursive: true });
writeFileSync(path.join(proj, 'src', 'app', 'page.tsx'), `export default function Page() {\n  return (\n    <main>\n      <section className="hero">\n        <h1>Ship faster with Orbit</h1>\n      </section>\n      <section className="features"><h2>Everything you need</h2></section>\n    </main>\n  );\n}\n`);
writeFileSync(path.join(proj, 'src', 'app', 'globals.css'), ':root { --brand: #6d28d9; --radius: 10px; }');
const proc = spawn('node', [server], { cwd: proj, env: { ...process.env, SITE_PROMPT_OUT: work, SITE_PROMPT_CHROME_DIR: profile, SITE_PROMPT_NO_CLIPBOARD: '1', SITE_PROMPT_DEV_URL: DEV_URL }, stdio: ['pipe', 'pipe', 'inherit'] });
let buf = '', seq = 0;
const waiting = new Map();
proc.stdout.on('data', (d) => {
	buf += d;
	let nl;
	while ((nl = buf.indexOf('\n')) >= 0) {
		const m = JSON.parse(buf.slice(0, nl));
		buf = buf.slice(nl + 1);
		if (m.id !== undefined) waiting.get(m.id)?.(m);
	}
});
const rpc = (method, params) => new Promise((resolve) => {
	const id = ++seq;
	waiting.set(id, resolve);
	proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
let shotN = 0;
const call = async (name, args = {}) => {
	const m = await rpc('tools/call', { name, arguments: args });
	const content = m.result?.content ?? [];
	for (const c of content.filter((c) => c.type === 'image')) writeFileSync(path.join(out, `${String(++shotN).padStart(2, '0')}.png`), Buffer.from(c.data, 'base64'));
	return { words: content.filter((c) => c.type === 'text').map((c) => c.text).join('\n'), texts: content.filter((c) => c.type === 'text').map((c) => c.text), images: content.filter((c) => c.type === 'image').length, error: !!m.result?.isError };
};

// the person's hand: its own connection to the same Chrome
const [port, wsPath] = readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').trim().split('\n');
const hand = new WebSocket(`ws://127.0.0.1:${port}${wsPath}`);
await new Promise((r) => hand.addEventListener('open', r, { once: true }));
let hseq = 0;
const hw = new Map();
hand.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && hw.has(m.id)) { hw.get(m.id)(m); hw.delete(m.id); } });
const hsend = (method, params = {}, sessionId) => new Promise((r) => { const id = ++hseq; hw.set(id, r); hand.send(JSON.stringify({ id, method, params, sessionId })); });

try {
	await rpc('initialize', { protocolVersion: '2025-06-18', clientInfo: { name: 'claude-code' }, capabilities: {} });
	// one call opens the picker and waits for the picks
	const pickCall = call('site_pick', { url: URL0, wait: 120 });
	let tabInfo = null;
	for (let k = 0; k < 100 && !tabInfo; k++) { tabInfo = (await hsend('Target.getTargets')).result.targetInfos.find((t) => t.type === 'page' && t.url.startsWith(URL0)); if (!tabInfo) await sleep(100); }
	const { targetInfos } = (await hsend('Target.getTargets')).result;
	const tab = targetInfos.find((t) => t.type === 'page' && t.url.startsWith(URL0));
	check(!!tab, 'the site is open in a tab of that Chrome', tab?.url);
	const sid = (await hsend('Target.attachToTarget', { targetId: tab.targetId, flatten: true })).result.sessionId;
	await hsend('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sid);
	const ev = async (expr) => (await hsend('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sid)).result?.result?.value;
	for (let k = 0; k < 300 && !(await ev(`!!document.querySelector("site-prompt-ui") && !!window.__spTest`)); k++) await sleep(100);
	check(await ev('!!document.querySelector("site-prompt-ui")'), 'the picker toolbar is on the page');
	const center = (sel) => ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
	const move = async (p) => { await hsend('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }, sid); await sleep(120); };
	const click = async (p) => { await move(p); for (const type of ['mousePressed', 'mouseReleased']) await hsend('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 }, sid); await sleep(150); };
	const ui = (sel) => ev(`window.__spTest.rect(${JSON.stringify(sel)})`);

	// 0. deselecting: click a pick again; Clear all
	const picked = () => ev('document.querySelectorAll("[data-sp-pick]").length');
	await click(await center('.cta'));
	await ev('window.__spTest.keep()');
	await click(await center('.cta'));
	check(await picked() === 0, 'clicking a pick again deselects it');
	await click(await center('.cta')); await ev('window.__spTest.keep()');
	await click(await center('h1')); await ev('window.__spTest.keep()');
	check(await picked() === 2 && /Clear all/.test(await ev('window.__spTest.clear()')), 'two picks: the toolbar offers Clear all');
	await click(await ui('[data-a=clear]'));
	check(await picked() === 0 && await ev('window.__spTest.clear()') === '', 'Clear all deselects everything');
	// 1. the button, with a note
	await click(await center('.cta'));
	check(await ev('location.href') === URL0, 'clicking a link while picking does not follow it');
	await ev('window.__spTest.note("the soft inner highlight and the shadow")');
	await ev('window.__spTest.keep()');
	// 2. the headline
	await click(await center('h1'));
	await ev('window.__spTest.keep()');
	// 3. a part of the drawing (the small dot): the whole svg is picked
	await click(await ev(`(() => { const r = document.querySelectorAll('svg circle')[2].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
	await ev('window.__spTest.keep()');
	const marked = await ev('[...document.querySelectorAll("[data-sp-pick]")].map((e) => e.tagName.toLowerCase())');
	check(JSON.stringify(marked) === JSON.stringify(['h1', 'a', 'svg']), 'three picks: the headline, the button, the whole svg', marked);

	await click(await ui('.bar [data-a=send]'));
	const r = await pickCall;
	check(/your own Chrome/.test(r.words), 'it opened in the own Chrome, in the same call', r.words.split('\n')[0]);
	writeFileSync(path.join(out, 'result.txt'), r.words);
	check(!r.error && /3 prompts from/.test(r.words), 'Get prompts: three prompts come back from that one call', r.words.split('\n')[0]);
	const md = (kind) => r.texts.find((t) => t.startsWith(`# Build this ${kind}`)) ?? '';
	const btn = md('button'), txt = md('text'), art = md('illustration');
	check(/What I want from it:\*\* the soft inner highlight/.test(btn), 'the button prompt carries the note');
	check(/```html[\s\S]*Try Halo free[\s\S]*```css[\s\S]*border-top-left-radius:12px/.test(btn) && /\.c0:hover\{[^}]*background-color/.test(btn), 'the button prompt has its exact code and hover state');
	check(/## Type[\s\S]*64px \/ line height 67.2px, weight 700, letter spacing -1.28px/.test(txt) && txt.includes('"Halo keeps your team in orbit"'), 'the text prompt has the full type spec and the copy', txt.match(/## Type[\s\S]{0,200}/)?.[0]);
	check(/## Motion and interaction[\s\S]*### On hover[\s\S]*180 ms, ease \(exact, from the page's CSS transition\)/.test(btn), 'the button prompt has its hover motion, exactly (180 ms ease)', btn.match(/### On hover[\s\S]{0,240}/)?.[0]);
	check(/- 1 line at this width/.test(btn), 'a one-line button is one line', btn.match(/- \d+ lines? at this width/)?.[0]);
	check(/## On phones \(390 px wide\)[\s\S]*font-size 64px → 40px/.test(txt), 'the headline prompt says how it changes on phones', txt.match(/## On phones[\s\S]{0,160}/)?.[0]);
	check(/## On phones[\s\S]*hidden on phones|The original hides it/.test(art), 'the drawing prompt says it is hidden on phones', art.match(/## On phones[\s\S]{0,120}/)?.[0]);
	check(/inline SVG/.test(art) && /<circle[^>]*r="14"/.test(art) && /linearGradient/.test(art), 'the illustration prompt has the drawing itself');
	check((r.words.match(/matches the original/g) ?? []).length === 3, 'every copy matches its original', r.words.match(/Copy check: .*/g));
	const saved = r.words.match(/Saved: (~[^\s]+|\/[^\s]+)/g) ?? [];
	check(saved.length === 3 && existsSync(path.join(work, '127.0.0.1-' + site.address().port, 'picks')), 'saved under <site>/picks', saved);
	check(r.images >= 4, 'with screenshots (and the hover state)', r.images);
	check(/3 prompts ready in your agent/.test(await ev('window.__spTest.status()')), 'the toolbar says the prompts are ready', await ev('window.__spTest.status()'));
	check(!(await ev('document.querySelectorAll("[data-sp-pick],[data-sp-n]").length')), 'the page is left clean');
	// 3b. one pick, a note, Get prompt in the card: it goes at once, no trip to the toolbar
	const quickCall = call('site_pick', { wait: 120 });
	await sleep(200);
	await click(await center('h1'));
	await ev('window.__spTest.note("just the type")');
	await click(await ui('.pop [data-a=send]'));
	const quick = await quickCall;
	check(/1 prompt from/.test(quick.words) && /just the type/.test(quick.words), 'Get prompt in the note card sends it straight away', quick.words.split('\n')[0]);
	// 3c. Break it down: a lesson with the exploded view instead of a copy prompt
	const learnCall = call('site_pick', { wait: 120 });
	const tLearn = Date.now();
	let tView = null;
	const watchView = (async () => { for (let k = 0; k < 600 && !tView; k++) { if (await ev('!!document.querySelector("site-prompt-view")')) tView = Date.now(); else await sleep(100); } })();
	await sleep(200);
	await click(await center('.cta'));
	await click(await ui('.pop [data-a=learn]'));
	const learn = await learnCall;
	await watchView;
	console.log(`      (Break it down: the 3D view was up after ${((tView - tLearn) / 1000).toFixed(1)} s; everything done after ${((Date.now() - tLearn) / 1000).toFixed(1)} s)`);
	check(await ev(`(() => { const r = document.querySelector('site-prompt-view').shadowRoot; return r.querySelector('.vb.on')?.dataset.v === 'specs' && r.querySelectorAll('.callout').length >= 1; })()`), 'a flat pick opens in Specs, with callouts');
	await ev(`document.querySelector('site-prompt-view').shadowRoot.querySelector('.callout')?.click()`);
	await sleep(500);
	check(await ev(`(() => { const r = document.querySelector('site-prompt-view').shadowRoot; return !!r.querySelector('.spec [data-c=prompt]') && /Copy whole thing/.test(r.textContent); })()`), 'the view has a spec card with Copy prompt, and Copy whole thing');
	check(await ev(`(() => { const r = document.querySelector('site-prompt-view').shadowRoot; return /Moves on hover|Motion/.test(r.querySelector('.spec').textContent) && !/recording/.test(r.querySelector('.spec').textContent); })()`), 'the motion arrives in the card when it is recorded');
	writeFileSync(path.join(out, 'learn.txt'), learn.words);
	check(/BREAK IT DOWN/.test(learn.words) && /# How it is made/.test(learn.words) && /## Build it in steps/.test(learn.words), 'Break it down: a lesson comes back, not a copy prompt', learn.words.split('\n')[0]);
	check(/2 shadows stacked|one shadow/.test(learn.words) && /inset shadow draws a thin highlight/.test(learn.words), 'it says how the depth is made (shadows, the inner highlight)', learn.words.match(/.*shadow.*/g)?.slice(0, 2));
	check(learn.images >= 1 && existsSync(path.join(learn.words.match(/Lesson: (\S+)/)[1].replace(/^~/, os.homedir()), '..', 'exploded.png')), 'with the exploded view, saved beside LESSON.md');
	check(await ev('!!document.querySelector("site-prompt-view")') && /taken apart on the page/i.test(learn.words), 'and it is taken apart on the page itself, in 3D');
	await hsend('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sid);
	await sleep(1500);
	check(!(await ev('!!document.querySelector("site-prompt-view")')) && await ev('getComputedStyle(document.querySelector(".cta")).visibility') === 'visible', 'Esc puts it back (the element is visible again)');
	// 3d. Area: drag a rectangle around the button and the headline, then break it down
	const areaCall = call('site_pick', { wait: 120 });
	await sleep(200);
	await click(await ui('[data-a=area]'));
	const hb = await ev(`(() => { const a = document.querySelector('h1').getBoundingClientRect(), b = document.querySelector('.cta').getBoundingClientRect(); return { x0: Math.min(a.left, b.left) - 6, y0: a.top - 6, x1: Math.max(a.right, b.right) + 6, y1: b.bottom + 6 }; })()`);
	await hsend('Input.dispatchMouseEvent', { type: 'mousePressed', x: hb.x0, y: hb.y0, button: 'left', clickCount: 1 }, sid);
	for (let k = 1; k <= 8; k++) await hsend('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hb.x0 + (hb.x1 - hb.x0) * k / 8, y: hb.y0 + (hb.y1 - hb.y0) * k / 8, button: 'left', buttons: 1 }, sid);
	await hsend('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hb.x1, y: hb.y1, button: 'left', clickCount: 1 }, sid);
	await sleep(300);
	check(await ev('document.querySelectorAll("[data-sp-pick]").length') === 1, 'Area: dragging a rectangle makes one pick');
	await click(await ui('.pop [data-a=learn]'));
	const areaRes = await areaCall;
	for (let k = 0; k < 50 && !(await ev('!!document.querySelector("site-prompt-view")')); k++) await sleep(100);
	const areaLayers = await ev(`(() => { const r = document.querySelector('site-prompt-view'); return r ? [...r.shadowRoot.querySelectorAll('.label')].map((l) => l.textContent.replace(/^\\d+\\s*/, '')) : null; })()`);
	check(areaLayers && areaLayers.some((l) => /halo keeps/i.test(l)) && areaLayers.some((l) => /try halo/i.test(l)) && !areaLayers.some((l) => /svg|illustration/i.test(l)), 'Break it down on the area: the headline and the button, not the drawing outside it', areaLayers);
	check(/BREAK IT DOWN/.test(areaRes.words), 'and the lesson comes back for the area');
	await hsend('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sid);
	await sleep(1500);
	console.log('      after area:', await ev(`JSON.stringify({ view: !!document.querySelector('site-prompt-view'), open: window.__spViewerOpen, picked: document.querySelectorAll('[data-sp-pick]').length, cur: window.__spTest.cur() })`));
	// 4. building: the toolbar offers Add to my-launch; the agent is told to build it into the project
	check(await ev(`(() => { const r = window.__spTest.rect('.bar [data-a=add]'); return r.x > 0; })()`), 'the toolbar offers Add to the project');
	check(await ev(`(() => { const r = window.__spTest.rect('.seg'); return r.x > 0; })()`), 'the toolbar offers Exact | My style');
	await ev('window.__spTest.style("mine")');
	const addCall = call('site_pick', { wait: 120 });
	await sleep(200);
	await click(await center('.cta'));
	await ev('window.__spTest.note("put it in the hero of my landing page")');
	await ev('window.__spTest.keep()');
	await click(await ui('.bar [data-a=add]'));
	// their site opens in a new tab with the placer: they show where it goes
	let devTab = null;
	for (let k = 0; k < 600 && !devTab; k++) { devTab = (await hsend('Target.getTargets')).result.targetInfos.find((t) => t.type === 'page' && t.url.startsWith(DEV_URL)); if (!devTab) await sleep(100); }
	check(!!devTab, 'Add opens their running site in a new tab', devTab?.url);
	const dsid = (await hsend('Target.attachToTarget', { targetId: devTab.targetId, flatten: true })).result.sessionId;
	const dev = async (expr) => (await hsend('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, dsid)).result?.result?.value;
	for (let k = 0; k < 300 && !(await dev('!!window.__spTest && !!document.querySelector("site-prompt-place")')); k++) await sleep(100);
	check(/Where does \d+\. Button go\?/.test(await dev('window.__spTest.status()')), 'the placer asks where it goes', await dev('window.__spTest.status()'));
	await dev(`window.__spTest.place('.hero h1', 'after')`);
	const add = await addCall;
	writeFileSync(path.join(out, 'add.txt'), add.words);
	check(/ADD TO THE PROJECT/.test(add.words) && /my-launch/.test(add.words) && /Next\.js \(App Router\), Tailwind 4, TypeScript/.test(add.words) && /src\/components/.test(add.words), 'Add: the agent is told to build it into the project, in its stack', add.words.split('\n')[0]);
	check(/Goes: BELOW <h1> on \/ \(text: "Ship faster with Orbit"\)/.test(add.words), 'it knows the spot: below the headline', add.words.match(/Goes: .*/)?.[0]);
	check(/Source: src\/app\/page\.tsx:5/.test(add.words), 'and the source file and line it is in', add.words.match(/Source: .*/)?.[0]);
	check(/STYLE: MY STYLE/.test(add.words) && /THEIR DESIGN/.test(add.words) && /--brand/.test(add.words) && /Georgia/.test(add.words), 'My style: their design comes with it (variables, fonts)');
	check(/phones: /.test(add.words) && /note: "put it in the hero/.test(add.words) && !/# Build this/.test(add.words), 'with the phone layout and the note, and no prompt dump');
	check(add.images >= 2, 'with the pick and their page with the spot marked', add.images);
	const said = await call('site_pick', { say: '✓ Added to page.tsx, 99% match', wait: 0 });
	check(/Shown/.test(said.words) && /Added to page\.tsx/.test(await ev('window.__spTest.status()')), 'the agent can answer in the toolbar', await ev('window.__spTest.status()'));

	// 5. site_match: the person's build in their running app against the original
	const folder = add.words.match(/Folder: (.+)/)[1].trim();
	const comp = readFileSync(path.join(folder, 'component.html'), 'utf8');
	const app = http.createServer((req, res) => {
		res.writeHead(200, { 'content-type': 'text/html' });
		res.end(req.url === '/bad' ? comp.replace('</style>', '.c0{border-radius:0!important;padding:0 40px!important}</style>') : comp);
	});
	await new Promise((r) => app.listen(0, '127.0.0.1', r));
	const local = `http://127.0.0.1:${app.address().port}`;
	const good = await call('site_match', { pick: folder, url: local + '/good', selector: '.c0' });
	check(/^It matches the original/.test(good.words), 'site_match: a faithful build matches', good.words.split('\n')[0]);
	const bad = await call('site_match', { pick: folder, url: local + '/bad', selector: '.c0' });
	check(/^Not there yet/.test(bad.words) && bad.images === 1, 'site_match: a build that is off is flagged, with a sheet', bad.words.split('\n')[0]);
	app.close();

	const stopped = await call('site_pick', { stop: true });
	check(/Closed/.test(stopped.words) && !(await ev('!!document.querySelector("site-prompt-ui")')), 'stop removes the picker and leaves their Chrome open');
	check(!(await hsend('Target.getTargets')).result.targetInfos.some((t) => t.type === 'page' && t.url.startsWith(DEV_URL)), 'and closes the dev tab it opened');
} finally {
	proc.kill();
	hand.close();
	chrome.kill('SIGKILL');
	site.close();
	devSite.close();
}
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
