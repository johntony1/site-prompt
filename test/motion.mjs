// Motion capture against a page with one of each kind of motion, measured where the answer is known.
//   node test/motion.mjs [out-dir]
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordMotion, motionMarkdown } from '../plugin/server/motion.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] ?? path.join(here, 'out', 'motion'));
let failures = 0;
const check = (ok, label, extra) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra !== undefined ? `  ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) failures++; };

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;font-family:Helvetica,Arial,sans-serif;background:#f6f6f3}
.hero{height:900px;display:grid;place-items:center}
.btn{display:inline-block;padding:14px 22px;border-radius:12px;background:#111;color:#fff;transition:transform 250ms cubic-bezier(0.22, 1, 0.36, 1), background-color 250ms ease}
.btn:hover{transform:translateY(-3px);background-color:#333}
.dot{width:12px;height:12px;border-radius:50%;background:#f43;animation:pulse 1200ms ease-in-out infinite}
@keyframes pulse{50%{transform:scale(1.6)}}
.card{width:420px;height:260px;margin:200px auto;border-radius:20px;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.12);opacity:0;transform:translateY(40px);transition:opacity 700ms cubic-bezier(0.23, 1, 0.32, 1), transform 700ms cubic-bezier(0.23, 1, 0.32, 1);display:grid;place-items:center;gap:12px}
.card.in{opacity:1;transform:none}
.tilt{width:300px;height:180px;margin:0 auto;border-radius:16px;background:#2b64f8}
.spring{width:80px;height:80px;border-radius:16px;background:#111}
.pill{padding:8px 14px;border-radius:999px;background:#eee;border:0}
.blank{height:1400px}
</style></head><body>
<section class="hero"><a class="btn" href="/go">Get started</a></section>
<div class="card" id="card"><div class="dot"></div><div class="spring" id="spring"></div><button type="button" class="pill" id="pill">Toggle</button></div>
<div style="height:200px"></div>
<div class="tilt" id="tilt"></div>
<div class="blank"></div>
<script>
// a reveal on scroll
new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('in')), { threshold: 0.3 }).observe(document.getElementById('card'));
// a JS spring on hover (stiffness 300, damping 12)
const s = document.getElementById('spring'); let x = 1, v = 0, target = 1, running = false;
const step = (t, last) => { const dt = Math.min(0.032, (t - last) / 1000); const f = -300 * (x - target) - 12 * v; v += f * dt; x += v * dt; s.style.transform = 'scale(' + x + ')'; if (Math.abs(v) > 0.0005 || Math.abs(x - target) > 0.0005) requestAnimationFrame((n) => step(n, t)); else { x = target; s.style.transform = 'scale(' + x + ')'; running = false; } };
s.parentElement.addEventListener('mouseenter', () => { target = 1.3; if (!running) { running = true; requestAnimationFrame((n) => step(n, n - 16)); } });
// element.animate on click
document.getElementById('pill').addEventListener('click', (e) => e.currentTarget.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.9)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' }));
// pointer-follow tilt
const tilt = document.getElementById('tilt');
tilt.addEventListener('mousemove', (e) => { const r = tilt.getBoundingClientRect(); const nx = (e.clientX - r.left) / r.width * 2 - 1; tilt.style.transform = 'perspective(800px) rotateY(' + (nx * 12) + 'deg)'; });
// a GSAP-like global
window.gsap = { version: '3.12.5', to(t, v) { return { t, v }; }, timeline() { return { to() {} }; } };
gsap.to('.card', { y: 0, opacity: 1, duration: 0.7, ease: 'power3.out', scrollTrigger: { trigger: '.card', start: 'top 80%' } });
</script></body></html>`;
const site = http.createServer((req, res) => (res.writeHead(200, { 'content-type': 'text/html' }), res.end(PAGE)));
await new Promise((r) => site.listen(0, '127.0.0.1', r));
const URL0 = `http://127.0.0.1:${site.address().port}/`;
try {
	const go = async (name, elPath, opts = {}) => { const dir = path.join(out, name); mkdirSync(dir, { recursive: true }); const t = Date.now(); const r = await recordMotion({ url: URL0, elPath, dir, ...opts }); console.log(`      (${name}: ${((Date.now() - t) / 1000).toFixed(1)} s)`); return { r, md: motionMarkdown(r), dir }; };
	// 1. the hover button
	const btn = await go('button', 'section.hero > a');
	const hov = btn.r.motions.find((m) => m.trigger === 'hover' && m.prop === 'transform');
	check(hov?.exact?.duration === 250 && /0\.22, 1, 0\.36, 1/.test(hov.exact.easing), 'hover: the CSS transition is read exactly (250 ms, its curve)', hov?.exact);
	check(/On hover[\s\S]*y 0px → -3px/.test(btn.md), 'hover: it says the button rises 3 px', btn.md.match(/### On hover[\s\S]{0,300}/)?.[0]);
	check(btn.r.motions.some((m) => m.trigger === 'leave' && m.prop === 'transform'), 'leave: it goes back down');
	check(existsSync(path.join(btn.dir, 'motion.png')), 'a filmstrip of the key frames');
	// 2. the card: reveal on scroll, a loop inside, a spring on hover, a click animation, GSAP
	const card = await go('card', '#card', { safeClick: false });
	const rev = card.r.motions.find((m) => m.node === 0 && m.trigger === 'scroll' && m.prop === 'opacity');
	check(rev?.exact?.duration === 700 && /0\.23, 1, 0\.32, 1/.test(rev.exact.easing), 'scroll: the reveal is caught with its exact 700 ms curve', rev?.exact ?? card.r.motions.filter((m) => m.node === 0).map((m) => [m.trigger, m.prop]));
	check(card.r.loops.some((l) => l.node === 1), 'idle: the pulsing dot is a loop', card.r.loops);
	check(/Looping[\s\S]*pulse/.test(card.md), 'the loop is named with its CSS animation', card.md.match(/### Looping[\s\S]{0,200}/)?.[0]);
	const spr = card.r.motions.find((m) => m.node === 2 && m.trigger === 'hover' && m.prop === 'transform');
	check(spr?.spring && spr.spring.stiffness > 200 && spr.spring.stiffness < 420 && spr.overshoot > 5, 'hover: the JS spring is measured as a spring (stiffness near 300)', spr && { spring: spr.spring, overshoot: spr.overshoot });
	check(card.r.gsap.length === 1 && card.r.gsap[0].vars.ease === 'power3.out' && card.r.gsap[0].vars.scrollTrigger?.start === 'top 80%', 'GSAP calls are read with their vars and ScrollTrigger', card.r.gsap[0]?.vars);
	// 3. the toggle: a safe click runs element.animate
	const pill = await go('pill', '#pill', { safeClick: true });
	check(pill.r.waapi.length === 1 && pill.r.waapi[0].options.duration === 300, 'click: element.animate is read exactly (keyframes, 300 ms)', pill.r.waapi[0]);
	// 4. the tilt card follows the pointer
	const tilt = await go('tilt', '#tilt');
	const fol = tilt.r.motions.find((m) => m.follows);
	check(fol && fol.follows.axis === 'x' && Math.abs(fol.follows.atEnd - 12) < 3 && Math.abs(fol.follows.atStart + 12) < 3, 'pointer: the tilt follows the pointer, rotateY -12° to 12°', fol?.follows);
	check(/follows the pointer/.test(tilt.md), 'and says so', tilt.md.match(/### As the pointer[\s\S]{0,200}/)?.[0]);
} finally {
	site.close();
}
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
