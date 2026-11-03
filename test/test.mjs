// site-prompt end to end over stdio, against a local landing page with known answers: a Next.js + Tailwind
// fingerprint, a sticky header that changes on scroll, a button with a hover transition, scroll reveals, a keyframe
// spinner, a gradient card with depth, breakpoints. Then a component clone by selector, and compare (the page against
// itself must pass; a broken copy must not).
//
//   node test/test.mjs [out-dir]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const server = path.resolve(here, '..', 'plugin', 'server', 'server.mjs');
const out = path.resolve(process.argv[2] ?? path.join(here, 'out'));
mkdirSync(out, { recursive: true });
const work = mkdtempSync(path.join(os.tmpdir(), 'site-prompt-test-'));

let failures = 0;
const check = (ok, label, extra) => {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra !== undefined ? `  ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`);
	if (!ok) failures++;
};

const CSS = `
:root { --brand: #5b4cff; --ink: #0d0d12; --radius-card: 20px; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Helvetica, Arial, sans-serif; color: var(--ink); background: #fafaf7; }
.header { position: sticky; top: 0; z-index: 10; height: 72px; display: flex; align-items: center; justify-content: space-between; padding: 0 40px; background: transparent; transition: background-color 300ms ease, box-shadow 300ms ease; }
.header.scrolled { background: #ffffff; box-shadow: 0 1px 0 rgba(0,0,0,0.08); }
.header nav a { margin-left: 28px; color: #3a3a44; text-decoration: none; font-size: 15px; }
.burger { display: none; width: 40px; height: 40px; border: 0; background: none; }
.hero { max-width: 1120px; min-height: 860px; margin: 0 auto; padding: 120px 40px 96px; text-align: center; }
.hero h1 { font-size: 72px; line-height: 1.04; letter-spacing: -0.03em; font-weight: 700; margin: 0 0 24px; }
.hero p { font-size: 20px; line-height: 1.5; color: #5c5c66; margin: 0 auto 40px; max-width: 640px; }
.btn { display: inline-flex; align-items: center; gap: 8px; height: 52px; padding: 0 28px; border-radius: 999px; background: var(--brand); color: #fff; font-size: 16px; font-weight: 600; text-decoration: none; transition: background-color 200ms cubic-bezier(0.2, 0, 0, 1), transform 200ms cubic-bezier(0.2, 0, 0, 1); box-shadow: 0 8px 24px rgba(91, 76, 255, 0.35); }
.btn:hover { background: #4636e6; transform: translateY(-2px); }
.btn .arrow { transition: transform 200ms ease; display: inline-block; }
.btn:hover .arrow { transform: translateX(4px); }
.features { max-width: 1120px; margin: 0 auto; padding: 0 40px 120px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
.card { background: linear-gradient(180deg, #ffffff 0%, #f1efff 100%); border-radius: var(--radius-card); padding: 32px; box-shadow: 0 1px 2px rgba(0,0,0,0.06), 0 12px 32px rgba(17, 12, 60, 0.08); opacity: 0; transform: translateY(32px); transition: opacity 600ms ease, transform 600ms ease; }
.card.in { opacity: 1; transform: none; }
.card h3 { font-size: 22px; margin: 16px 0 8px; }
.card p { font-size: 15px; line-height: 1.6; color: #5c5c66; margin: 0; }
.spinner { width: 28px; height: 28px; border-radius: 50%; border: 3px solid #e4e1ff; border-top-color: var(--brand); animation: spin 900ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.cta { background: #0d0d12; color: #fff; padding: 96px 40px; text-align: center; }
.cta h2 { font-size: 48px; letter-spacing: -0.02em; margin: 0 0 32px; }
.footer { padding: 40px; font-size: 13px; color: #8a8a94; text-align: center; }
@media (max-width: 900px) { .features { grid-template-columns: 1fr; } .hero h1 { font-size: 44px; } .header nav { display: none; } .burger { display: block; } }
@media (max-width: 900px) { .cta h2 { font-size: 32px; } }
@media (min-width: 1400px) { .hero { padding-top: 140px; } }
@media (min-width: 1400px) { .cta { padding: 112px 40px; } }
`;
const page = (broken = false) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Orbit, ship faster</title>
<meta name="description" content="Orbit is the fastest way to ship.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/site.css">
<script src="/_next/static/chunks/main-abc123.js"></script>
</head><body><div id="__next">
<header class="header"><svg width="96" height="24" viewBox="0 0 96 24" aria-label="Orbit"><circle cx="12" cy="12" r="10" fill="#5b4cff"/><text x="28" y="18" font-size="16" font-weight="700">Orbit</text></svg>
<nav><a href="/product">Product</a><a href="/pricing">Pricing</a><a href="/docs">Docs</a></nav><button class="burger" aria-label="Open menu"><svg width="20" height="20"><path d="M2 6h16M2 14h16" stroke="#000"/></svg></button></header>
<main>
<section class="hero"><h1 class="text-center">${broken ? 'Something else entirely' : 'Ship faster with Orbit'}</h1><p class="mx-auto">The planning tool for teams who build products people love. Plan, track and ship in one place.</p>
<a class="btn" href="/start">Start for free <span class="arrow">→</span></a></section>
<section class="features">
<div class="card"><div class="spinner"></div><h3>Plan</h3><p>Roadmaps that stay true to what ships.</p></div>
<div class="card"><div class="spinner"></div><h3>Track</h3><p>Every issue, every owner, one view.</p></div>
<div class="card"><div class="spinner"></div><h3>Ship</h3><p>Releases that write their own notes.</p></div>
</section>
${broken ? '' : '<section class="cta"><h2>Ready when you are</h2><a class="btn" href="/start">Get Orbit <span class="arrow">→</span></a></section>'}
</main>
<footer class="footer">© 2026 Orbit Labs</footer></div>
<script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>
<script>
addEventListener('scroll', () => document.querySelector('.header').classList.toggle('scrolled', scrollY > 40));
const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('in')));
document.querySelectorAll('.card').forEach((c) => io.observe(c));
</script></body></html>`;
const site = http.createServer((req, res) => {
	const u = req.url.split('?')[0];
	if (u === '/site.css') return res.writeHead(200, { 'content-type': 'text/css' }), res.end(CSS);
	if (u.startsWith('/_next/')) return res.writeHead(200, { 'content-type': 'text/javascript' }), res.end('window.next = { version: "15" };');
	if (u === '/broken') return res.writeHead(200, { 'content-type': 'text/html', 'x-vercel-id': 'iad1::abc' }), res.end(page(true));
	res.writeHead(200, { 'content-type': 'text/html', 'x-vercel-id': 'iad1::abc' }), res.end(page(false));
});
await new Promise((r) => site.listen(0, '127.0.0.1', r));
const URL0 = `http://127.0.0.1:${site.address().port}/`;

const proc = spawn('node', [server], { cwd: work, env: { ...process.env, SITE_PROMPT_OUT: work }, stdio: ['pipe', 'pipe', 'inherit'] });
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
	const t0 = Date.now();
	const m = await rpc('tools/call', { name, arguments: args });
	const content = m.result?.content ?? [];
	const words = content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
	for (const c of content.filter((c) => c.type === 'image')) writeFileSync(path.join(out, `${String(++shotN).padStart(2, '0')}-${name}.${c.mimeType === 'image/png' ? 'png' : 'jpg'}`), Buffer.from(c.data, 'base64'));
	return { words, images: content.filter((c) => c.type === 'image').length, error: !!m.result?.isError, ms: Date.now() - t0 };
};

try {
	await rpc('initialize', { protocolVersion: '2025-06-18', clientInfo: { name: 'claude-code' }, capabilities: {} });
	const names = (await rpc('tools/list', {})).result.tools.map((t) => t.name);
	check(['site_read', 'site_prompt', 'site_component', 'site_compare'].every((n) => names.includes(n)), 'four tools', names);

	// 1. read
	const r = await call('site_read', { url: URL0 });
	writeFileSync(path.join(out, 'read.txt'), r.words);
	check(!r.error, `site_read (${Math.round(r.ms / 1000)} s)`, r.error ? r.words.slice(0, 400) : undefined);
	check(/THE PROMPT IS READY/.test(r.words) && r.words.includes('# Rebuild 127.0.0.1') && r.words.includes('Ship faster with Orbit'), 'site_read returns the finished prompt in the same step');
	const dir = path.join(work, '127.0.0.1-' + site.address().port);
	const spec = JSON.parse(readFileSync(path.join(dir, 'spec.json'), 'utf8'));
	check(/Next\.js/.test(spec.stack.framework ?? '') && spec.stack.hosting === 'Vercel', 'stack: Next.js on Vercel', { framework: spec.stack.framework, hosting: spec.stack.hosting });
	check(spec.sections.length >= 4 && spec.sections.length <= 6, 'sections: header, hero, features, cta, footer', spec.sections.map((s) => s.selector));
	check(spec.tokens.background.some((c) => c.colour === '#0d0d12') && spec.tokens.text.some((c) => c.colour === '#5c5c66'), 'colours measured', { bg: spec.tokens.background.map((c) => c.colour), text: spec.tokens.text.map((c) => c.colour) });
	const h1 = spec.tokens.type.find((t) => t.tags.includes('h1'));
	check(h1 && h1.size === '72px' && h1.weight === '700' && /-2\.16px/.test(h1.letterSpacing), 'h1 type: 72px, 700, tracking -0.03em', h1);
	check(spec.tokens.shadows.some((s) => s.includes('12px 32px')) && spec.tokens.gradients.some((g) => g.includes('linear-gradient')), 'depth: the card shadow and gradient');
	const btn = spec.hovers.find((h) => /btn/.test(h.el));
	check(btn && btn.changes.some((c) => /background-color #5b4cff → #4636e6/.test(c)) && btn.changes.some((c) => /child 1: transform/.test(c)), 'hover: the button darkens and its arrow moves', btn?.changes);
	check(btn && /200ms|0\.2s/.test(btn.transition) && /cubic-bezier\(0\.2, 0, 0, 1\)/.test(btn.transition), 'with its own transition', btn?.transition);
	check(spec.header?.scrolled && spec.header.atTop.bg !== spec.header.scrolled.bg, 'the header changes on scroll', spec.header);
	check(spec.reveals.filter((x) => /card/.test(x.el)).length >= 2, 'scroll reveals: the cards fade up', spec.reveals.map((x) => x.el));
	check(spec.css.keyframes.spin && spec.tokens.animations.some((a) => a.startsWith('spin')), 'keyframes: spin, verbatim');
	check(spec.css.breakpoints.some((b) => b.px === 900) && spec.css.breakpoints.some((b) => b.px === 1400), 'breakpoints 900 and 1400', spec.css.breakpoints);
	check(spec.views.phone.menuButton && spec.views.phone.headerLinks === 0 && spec.views.desktop.headerLinks === 3, 'phone: menu button instead of links', { phone: spec.views.phone, desktop: spec.views.desktop.headerLinks });
	check(spec.views.phone.h1?.size === '44px', 'phone: the h1 drops to 44px', spec.views.phone.h1);
	check(spec.css.vars['--brand'] === '#5b4cff', 'css variables kept', spec.css.vars['--brand']);
	check(spec.assets.svgs.length >= 1 && spec.assets.svgs[0].markup.includes('<circle'), 'the svg logo markup kept');
	check(r.images >= 4 && ['desktop-full.jpg', 'phone-full.jpg', 'tablet-full.jpg'].every((f) => existsSync(path.join(dir, 'shots', f))), 'section shots returned, full pages saved', r.images);
	const exact = existsSync(path.join(dir, 'exact.html')) ? readFileSync(path.join(dir, 'exact.html'), 'utf8') : '';
	check(exact.includes('Ship faster with Orbit') && !exact.includes('IntersectionObserver') && exact.includes('@keyframes spin') && exact.includes('<base href='), 'exact.html: rendered markup, the site CSS inlined, no scripts');
	check(spec.exact?.length === 2 && spec.exact.every((x) => x.mean >= 0.98 && x.heights.clone === x.heights.original), 'exact.html matches the live page at 1440 and 390', spec.exact);
	let md = readFileSync(path.join(dir, 'PROMPT.md'), 'utf8');
	check(/Next\.js/.test(md) && md.includes('Ship faster with Orbit') && md.includes('#4636e6') && md.includes('@keyframes spin'), 'PROMPT.md carries the stack, the copy, the hover and the keyframes');
	check(!/[–—]/.test(md.replace(/"[^"]*"/g, '')), 'no dashes in the prompt\'s own words');

	// 2. finish the prompt
	const fin = await call('site_prompt', { url: URL0, overall: 'Airy, light, one violet accent.', notes: { 2: 'A centred headline with lots of air; a violet pill button with a soft glow under it.' } });
	md = readFileSync(path.join(dir, 'PROMPT.md'), 'utf8');
	check(!fin.error && md.includes('Airy, light, one violet accent.') && md.includes('soft glow under it'), 'site_prompt adds the notes', fin.words.slice(0, 120));
	check(fin.words.includes(md.trim()) && /Link: file:\/\//.test(fin.words), 'site_prompt returns the whole prompt and a link to the file');

	// 3. a component by selector
	const c = await call('site_component', { url: URL0, selector: '.hero .btn', name: 'hero button' });
	writeFileSync(path.join(out, 'component.txt'), c.words);
	check(!c.error, `site_component (${Math.round(c.ms / 1000)} s)`, c.error ? c.words.slice(0, 400) : c.words.split('\n')[2]);
	const cdir = path.join(dir, 'components', 'hero-button');
	const html = existsSync(path.join(cdir, 'component.html')) ? readFileSync(path.join(cdir, 'component.html'), 'utf8') : '';
	check(/matches the original: same size/.test(c.words), 'the clone matches the original element', c.words.match(/The clone[^\n]*/)?.[0]);
	check(/\.c0:hover\{[^}]*background-color:\s*rgb\(70, 54, 230\)/.test(html) && /\.c0:hover \.c1\{[^}]*transform/.test(html), 'component.html has the hover state, the arrow included');
	check(/transition[^;]*cubic-bezier\(0\.2, 0, 0, 1\)/.test(html) && /border-top-left-radius:999px/.test(html.replace(/\s/g, '')), 'and its transition and shape');
	check(existsSync(path.join(cdir, 'COMPONENT.md')) && existsSync(path.join(cdir, 'original-hover.png')), 'COMPONENT.md and the hover shot');

	// 4. compare: the page with itself passes; a copy missing a section does not
	const same = await call('site_compare', { original: URL0, clone: URL0, widths: [1440] });
	check(/It passes/.test(same.words), `the page against itself passes (${Math.round(same.ms / 1000)} s)`, same.words.split('\n')[0]);
	const bad = await call('site_compare', { original: URL0, clone: URL0 + 'broken', widths: [1440] });
	check(/Not there yet/.test(bad.words) && bad.images >= 1, 'a broken copy is caught, with sheets', bad.words.split('\n')[0]);
} finally {
	proc.kill();
	site.close();
}
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
