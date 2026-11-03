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
</style></head><body>
<section class="hero"><div><h1>Halo keeps your team in orbit</h1><a class="cta" href="/go">Try Halo free</a></div>
<svg class="art" viewBox="0 0 320 320"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb36b"/><stop offset="1" stop-color="#ff5f8a"/></linearGradient></defs>
<circle cx="160" cy="160" r="120" fill="url(#g)"/><circle cx="160" cy="160" r="150" fill="none" stroke="#111" stroke-width="2" stroke-dasharray="6 10"/><circle cx="270" cy="96" r="14" fill="#111"/></svg></section>
</body></html>`;
const site = http.createServer((req, res) => (res.writeHead(200, { 'content-type': 'text/html' }), res.end(PAGE)));
await new Promise((r) => site.listen(0, '127.0.0.1', r));
const URL0 = `http://127.0.0.1:${site.address().port}/`;

// "their" Chrome, remote debugging on
const chrome = spawn(findChrome(), ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--window-size=1440,900', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
for (let k = 0; k < 100 && !existsSync(path.join(profile, 'DevToolsActivePort')); k++) await sleep(100);
check(existsSync(path.join(profile, 'DevToolsActivePort')), 'the own Chrome is listening (DevToolsActivePort)');

const proc = spawn('node', [server], { env: { ...process.env, SITE_PROMPT_OUT: work, SITE_PROMPT_CHROME_DIR: profile, SITE_PROMPT_NO_CLIPBOARD: '1' }, stdio: ['pipe', 'pipe', 'inherit'] });
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

	// 1. the button, with a note
	await click(await center('.cta'));
	check(await ev('location.href') === URL0, 'clicking a link while picking does not follow it');
	await ev('window.__spTest.note("the soft inner highlight and the shadow")');
	await click(await ui('[data-a=done]'));
	// 2. the headline
	await click(await center('h1'));
	await click(await ui('[data-a=done]'));
	// 3. a part of the drawing (the small dot): the whole svg is picked
	await click(await ev(`(() => { const r = document.querySelectorAll('svg circle')[2].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
	await click(await ui('[data-a=done]'));
	const marked = await ev('[...document.querySelectorAll("[data-sp-pick]")].map((e) => e.tagName.toLowerCase())');
	check(JSON.stringify(marked) === JSON.stringify(['h1', 'a', 'svg']), 'three picks: the headline, the button, the whole svg', marked);

	await click(await ui('[data-a=send]'));
	const r = await pickCall;
	check(/your own Chrome/.test(r.words), 'it opened in the own Chrome, in the same call', r.words.split('\n')[0]);
	writeFileSync(path.join(out, 'result.txt'), r.words);
	check(!r.error && /3 prompts from/.test(r.words), 'Get prompts: three prompts come back from that one call', r.words.split('\n')[0]);
	const md = (kind) => r.texts.find((t) => t.startsWith(`# Build this ${kind}`)) ?? '';
	const btn = md('button'), txt = md('text'), art = md('illustration');
	check(/What I want from it:\*\* the soft inner highlight/.test(btn), 'the button prompt carries the note');
	check(/```html[\s\S]*Try Halo free[\s\S]*```css[\s\S]*border-top-left-radius:12px/.test(btn) && /\.c0:hover\{[^}]*background-color/.test(btn), 'the button prompt has its exact code and hover state');
	check(/## Type[\s\S]*64px \/ line height 67.2px, weight 700, letter spacing -1.28px/.test(txt) && txt.includes('"Halo keeps your team in orbit"'), 'the text prompt has the full type spec and the copy', txt.match(/## Type[\s\S]{0,200}/)?.[0]);
	check(/inline SVG/.test(art) && /<circle[^>]*r="14"/.test(art) && /linearGradient/.test(art), 'the illustration prompt has the drawing itself');
	check((r.words.match(/matches the original/g) ?? []).length === 3, 'every copy matches its original', r.words.match(/Copy check: .*/g));
	const saved = r.words.match(/Saved: (~[^\s]+|\/[^\s]+)/g) ?? [];
	check(saved.length === 3 && existsSync(path.join(work, '127.0.0.1-' + site.address().port, 'picks')), 'saved under <site>/picks', saved);
	check(r.images >= 4, 'with screenshots (and the hover state)', r.images);
	check(/3 prompts ready in your agent/.test(await ev('window.__spTest.status()')), 'the toolbar says the prompts are ready', await ev('window.__spTest.status()'));
	check(!(await ev('document.querySelectorAll("[data-sp-pick],[data-sp-n]").length')), 'the page is left clean');
	const stopped = await call('site_pick', { stop: true });
	check(/Closed/.test(stopped.words) && !(await ev('!!document.querySelector("site-prompt-ui")')), 'stop removes the picker and leaves their Chrome open');
} finally {
	proc.kill();
	hand.close();
	chrome.kill('SIGKILL');
	site.close();
}
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
