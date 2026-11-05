// Break it down: a pick taken apart so the person can learn how it is made, or rebuild it their own way. Works on
// the pick's exact copy (component.html), never on their live page: what each layer paints and how (shadows,
// gradients, masks, pseudo-element layers, tilts, things hidden until hover), each layer photographed on its own,
// an exploded view of the stack, and the build in steps, each with a picture of how far it should look.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { goto, launch, shot, wait } from './chrome.mjs';
import { motionMarkdown } from './motion.mjs';

/** In the copy: every element that paints something, with what it paints and the effects on it. */
function anatomy() {
	const root = document.querySelector('.c0');
	if (!root) return null;
	const R = root.getBoundingClientRect();
	const clear = (c) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
	const shadows = (v) => (v && v !== 'none' ? v.split(/,(?![^(]*\))/).map((s) => s.trim()).filter((s) => !/^rgba\([^)]*,\s*0\)/.test(s)) : []);
	const paintOf = (cs, el, pseudo) => {
		const p = [];
		if (!clear(cs.backgroundColor)) p.push({ k: 'fill', v: cs.backgroundColor });
		if (cs.backgroundImage !== 'none') p.push({ k: /url\(/.test(cs.backgroundImage) ? 'image' : 'gradient', v: cs.backgroundImage });
		const bw = ['Top', 'Right', 'Bottom', 'Left'].map((s) => parseFloat(cs[`border${s}Width`]) || 0);
		if (bw.some((w) => w > 0) && !clear(cs.borderTopColor)) p.push({ k: 'border', v: `${Math.max(...bw)}px ${cs.borderTopStyle} ${cs.borderTopColor}` });
		const sh = shadows(cs.boxShadow);
		if (sh.length) p.push({ k: 'shadow', v: sh });
		if (!pseudo && el) {
			const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
			if (own) p.push({ k: 'text', v: own.slice(0, 80) });
			const t = el.tagName.toLowerCase();
			if (/^(img|svg|video|canvas|picture)$/.test(t)) p.push({ k: 'media', v: t === 'img' ? el.currentSrc || el.src : t });
		}
		if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) p.push({ k: 'outline', v: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}` });
		return p;
	};
	const fxOf = (cs, el, pseudo = false) => {
		const f = {};
		if (cs.opacity !== '1') f.opacity = cs.opacity;
		if (cs.transform !== 'none') f.transform = cs.transform;
		if (cs.maskImage && cs.maskImage !== 'none') f.mask = cs.maskImage;
		if (cs.filter !== 'none') f.filter = cs.filter;
		if (cs.backdropFilter && cs.backdropFilter !== 'none') f.backdrop = cs.backdropFilter;
		if (cs.mixBlendMode !== 'normal') f.blend = cs.mixBlendMode;
		if (cs.perspective !== 'none') f.perspective = cs.perspective;
		if (cs.overflow !== 'visible' && parseFloat(cs.borderTopLeftRadius) > 0) f.clip = cs.borderTopLeftRadius;
		else if (cs.overflow !== 'visible') f.clip = '0px';
		if (parseFloat(cs.borderTopLeftRadius) > 0) f.radius = cs.borderTopLeftRadius;
		if ((cs.position === 'absolute' || cs.position === 'fixed') && pseudo) {
			const bleed = Math.max(...['top', 'right', 'bottom', 'left'].map((k) => -(parseFloat(cs[k]) || 0)));
			if (bleed > 1) f.bleed = Math.round(bleed);
		} else if (cs.position === 'absolute' || cs.position === 'fixed') {
			const r = el.getBoundingClientRect(), pr = el.parentElement.getBoundingClientRect();
			const bleed = Math.max(pr.left - r.left, r.right - pr.right, pr.top - r.top, r.bottom - pr.bottom);
			if (bleed > 1) f.bleed = Math.round(bleed);
		}
		if (cs.transitionDuration && cs.transitionDuration !== '0s') f.transition = { props: cs.transitionProperty, dur: cs.transitionDuration, ease: cs.transitionTimingFunction };
		if (cs.animationName && cs.animationName !== 'none') f.animation = `${cs.animationName} ${cs.animationDuration} ${cs.animationTimingFunction} ${cs.animationIterationCount}`;
		return f;
	};
	const nodes = [root, ...root.querySelectorAll('*')].filter((e) => /\bc\d+\b/.test(e.getAttribute('class') || ''));
	let lo = { x: R.left, y: R.top, r: R.right, b: R.bottom };
	const out = nodes.map((el) => {
		const i = +el.getAttribute('class').match(/\bc(\d+)\b/)[1];
		const cs = getComputedStyle(el), r = el.getBoundingClientRect();
		lo = { x: Math.min(lo.x, r.left), y: Math.min(lo.y, r.top), r: Math.max(lo.r, r.right), b: Math.max(lo.b, r.bottom) };
		const pseudos = {};
		for (const ps of ['::before', '::after']) {
			const pc = getComputedStyle(el, ps);
			if (!pc.content || pc.content === 'none' || pc.content === 'normal') continue;
			pseudos[ps] = { paint: paintOf(pc, null, true), fx: fxOf(pc, el, true) };
		}
		let depth = 0;
		for (let x = el; x !== root; x = x.parentElement) depth++;
		return {
			i, tag: el.tagName.toLowerCase(), depth, alt: el.getAttribute('alt') || '',
			box: { x: Math.round(r.left - R.left), y: Math.round(r.top - R.top), w: Math.round(r.width), h: Math.round(r.height) },
			paint: paintOf(cs, el, false), fx: fxOf(cs, el), pseudos,
		};
	});
	const pad = 48;
	return { nodes: out, rootPage: { x: R.left + scrollX, y: R.top + scrollY }, size: { w: Math.round(R.width), h: Math.round(R.height) }, clip: { x: Math.floor(lo.x) - pad + scrollX, y: Math.floor(lo.y) - pad + scrollY, width: Math.ceil(lo.r - lo.x) + pad * 2, height: Math.ceil(lo.b - lo.y) + pad * 2 } };
}

const fileName = (u) => { try { return decodeURIComponent(new URL(u).pathname.split('/').pop()).replace(/-[0-9a-f]{12,}/i, '').replace(/\.\w+$/, ''); } catch { return ''; } };
const deg = (m) => { const v = m.match(/matrix\(([^)]+)\)/)?.[1].split(',').map(Number); return v ? Math.round(Math.atan2(v[1], v[0]) * 1800 / Math.PI) / 10 : null; };
const blurOf = (s) => { const n = s.replace(/rgba?\([^)]*\)|#\w+/g, '').trim().split(/\s+/).map(parseFloat); return n[2] || 0; };

/** A short name for a layer, from what it paints. */
function nameOf(n, files) {
	const media = n.paint.find((p) => p.k === 'media');
	if (media) {
		const f = files.find((x) => x.src === media.v);
		return `${n.alt || fileName(media.v) || n.tag}${f ? ` (${f.file})` : ''}`;
	}
	const text = n.paint.find((p) => p.k === 'text');
	if (text) return `Text "${text.v.slice(0, 40)}"`;
	const pp = Object.entries(n.pseudos).filter(([, v]) => v.paint.length);
	const all = [...n.paint, ...pp.flatMap(([, v]) => v.paint)];
	const kinds = new Set(all.map((p) => p.k));
	const word = n.fx.opacity === '0' && kinds.has('gradient') ? 'Sheen' : /0\.\d|1\)/.test(n.fx.transform ?? '') && kinds.has('gradient') && n.paint.some((p) => /255, 255, 255/.test(p.v)) ? 'Sheen' : kinds.has('shadow') && n.fx.clip ? 'Clipping frame' : kinds.has('shadow') && kinds.size === 1 ? 'Shadow plate' : kinds.has('gradient') ? 'Gradient surface' : kinds.has('fill') ? 'Surface' : kinds.has('border') ? 'Outline' : 'Layer';
	return `${word}${pp.length && !n.paint.length ? ` (${pp.map(([k]) => k).join(', ')})` : ''}`;
}

/** How a layer is made, in plain words, from its paint and effects. */
function howOf(n, states, motion = null) {
	const L = [];
	const say = (paint, fx, where = '') => {
		for (const p of paint) {
			if (p.k === 'shadow') {
				const inner = p.v.filter((s) => /inset/.test(s)).length, outer = p.v.length - inner;
				const blurs = p.v.filter((s) => !/inset/.test(s)).map(blurOf);
				if (outer > 1) L.push(`${where}${outer} shadows stacked (blur ${blurs.join(', ')}px): the small ones draw the edge, the large ones the soft lift`);
				else if (outer === 1) L.push(`${where}one shadow (blur ${blurs[0]}px) lifts it off the page`);
				if (inner) L.push(`${where}an inset shadow draws a thin ${/rgba\(255,\s*255,\s*255/.test(p.v.find((s) => /inset/.test(s))) ? 'highlight' : 'edge'} inside the shape`);
			}
			if (p.k === 'gradient') L.push(`${where}a gradient fill: ${p.v.slice(0, 140)}`);
			if (p.k === 'fill') L.push(`${where}a solid fill, ${p.v}`);
			if (p.k === 'border') L.push(`${where}a border, ${p.v}`);
			if (p.k === 'media') L.push(/\.svg(\?|$)/i.test(p.v) || p.v === 'svg' ? `${where}a vector drawing (SVG), sharp at any size` : `${where}an image file`);
		}
		if (fx.perspective) L.push(`${where}sets up 3D space (perspective ${fx.perspective}) for what is inside it`);
		if (fx.mask) L.push(`${where}${/rgba\(0,\s*0,\s*0,\s*0\)/.test(fx.mask) && /linear-gradient/.test(fx.mask) ? 'fades out at the edge with a gradient mask' : 'is cut to a shape by a mask'}: ${fx.mask.slice(0, 120)}`);
		if (fx.clip && fx.radius) L.push(`${where}rounded ${fx.radius} and clips what is inside to that shape`);
		else if (fx.radius) L.push(`${where}rounded corners, ${fx.radius}`);
		if (fx.transform) {
			const v = fx.transform.match(/^matrix\(([^)]+)\)/)?.[1].split(',').map(Number);
			const d = deg(fx.transform);
			if (v && v[0] === 1 && v[1] === 0 && v[2] === 0 && v[3] === 1) L.push(`${where}nudged ${[v[4] && `${Math.abs(v[4])}px ${v[4] > 0 ? 'right' : 'left'}`, v[5] && `${Math.abs(v[5])}px ${v[5] > 0 ? 'down' : 'up'}`].filter(Boolean).join(' and ')} with a transform (often where an animation starts or ends)`);
			else L.push(d ? `${where}tilted ${d}°${v && Math.abs(Math.hypot(v[0], v[1]) - 1) > 0.01 ? ` and scaled ${Math.round(Math.hypot(v[0], v[1]) * 100)}%` : ''}` : `${where}transformed: ${fx.transform}`);
		}
		if (fx.bleed) L.push(`${where}reaches ${fx.bleed}px outside its box (positioned absolutely), so it can overlap its neighbours`);
		if (fx.filter) L.push(`${where}filter: ${fx.filter}`);
		if (fx.backdrop) L.push(`${where}frosted glass: backdrop-filter ${fx.backdrop}`);
		if (fx.blend) L.push(`${where}blends with what is under it (${fx.blend})`);
		if (fx.transition) L.push(`${where}animates ${fx.transition.props} over ${fx.transition.dur} (${fx.transition.ease})`);
		if (fx.animation) L.push(`${where}runs an animation: ${fx.animation}`);
	};
	say(n.paint, n.fx);
	for (const [ps, v] of Object.entries(n.pseudos)) {
		if (!v.paint.length && !Object.keys(v.fx).length) continue;
		const before = L.length;
		say(v.paint, v.fx);
		if (L.length > before) L.splice(before, 0, `drawn by its ${ps}: an extra layer CSS adds without any markup`);
	}
	const hoverKeys = Object.values(states ?? {}).flatMap((s) => Object.entries(s.hover ?? {})).filter(([j]) => +String(j).split('::')[0] === n.i);
	const WHEN = { load: 'as the page loads', scroll: 'as it scrolls into view', idle: 'on a timer, on its own', hover: 'on hover', pointer: 'as the pointer moves over it', press: 'when pressed', click: 'on click' };
	const mine = (motion?.motions ?? []).filter((m) => m.node === n.i && m.frames > 1 && m.trigger !== 'leave');
	const loop = (motion?.loops ?? []).find((l) => l.node === n.i);
	if (n.fx.opacity === '0') {
		const m = mine.find((x) => x.prop === 'opacity') ?? mine[0];
		L.push(m ? `hidden at rest, it comes in ${WHEN[m.trigger] ?? m.trigger}${m.delay > 20 ? ` (${m.delay} ms after)` : ''}, over ${m.exact?.duration ?? m.duration} ms` : hoverKeys.length ? 'hidden at rest, it fades in on hover' : 'hidden at rest (opacity 0): nothing in the recorded session (load, scroll, hover, press) brought it in, so something else does, like a click elsewhere or a state of the page');
	} else if (hoverKeys.length) L.push(`changes on hover: ${hoverKeys.flatMap(([, d]) => d).slice(0, 3).join('; ').slice(0, 160)}`);
	if (loop) L.push(`keeps moving on its own (${loop.css ? `CSS animation "${loop.css.name}", ${Math.round(loop.css.duration)} ms a cycle` : loop.continuous ? 'continuously' : `every ${loop.period} ms`})`);
	else for (const m of mine.filter((x) => x.prop !== 'opacity' || n.fx.opacity !== '0').slice(0, 2)) L.push(`moves ${WHEN[m.trigger] ?? m.trigger}: ${m.prop}${m.spring ? ', on a spring' : m.exact ? `, ${m.exact.duration} ms ${m.exact.easing}` : m.bezier ? `, ${m.duration} ms cubic-bezier(${m.bezier.c.join(', ')})` : ''}`);
	return [...new Set(L)];
}

const NOISE = /^(text-size-adjust|tab-size|box-sizing|-webkit-font-smoothing|pointer-events|vertical-align|min-height:auto|min-width:auto|aspect-ratio:auto|isolation|transform-origin)/;
/** The declarations that make a layer look the way it does, without the browser's noise, with shorthands. */
export function cleanDecls(rule) {
	let d = rule.split(';').map((x) => x.trim()).filter(Boolean);
	const get = (p) => d.find((x) => x.startsWith(p + ':'))?.slice(p.length + 1);
	const widths = ['top', 'right', 'bottom', 'left'].map((s) => get(`border-${s}-width`));
	if (widths.every((w) => !w || w === '0px')) d = d.filter((x) => !/^border-(top|right|bottom|left)-(width|style|color):/.test(x));
	const four = (pre, post, short) => {
		const v = ['top', 'right', 'bottom', 'left'].map((s) => get(`${pre}${s}${post}`));
		if (v.every((x) => x && x === v[0])) { d = d.filter((x) => !new RegExp(`^${pre}(top|right|bottom|left)${post}:`).test(x)); d.push(`${short}:${v[0]}`); }
	};
	const radii = ['top-left', 'top-right', 'bottom-right', 'bottom-left'].map((s) => get(`border-${s}-radius`));
	if (radii.every((x) => x && x === radii[0])) { d = d.filter((x) => !/^border-(top|bottom)-(left|right)-radius:/.test(x)); d.push(`border-radius:${radii[0]}`); }
	four('padding-', '', 'padding');
	four('margin-', '', 'margin');
	if (get('overflow-x') && get('overflow-x') === get('overflow-y')) { const v = get('overflow-x'); d = d.filter((x) => !/^overflow-[xy]:/.test(x)); d.push(`overflow:${v}`); }
	return d.filter((x) => !NOISE.test(x));
}

/** Everything for "Break it down": LESSON.md, exploded.png, steps/step-N.png. */
export async function breakdown({ dir, file, css, states, motion = null, files = [], url, label, note }) {
	const { page, close } = await launch({ width: 1600, height: 1200 });
	try {
		await goto(page, pathToFileURL(file).href, { settle: 2500 });
		await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
		await page.eval(`(() => { const s = document.createElement('style'); s.textContent = 'html,body{background:transparent!important} *,*::before,*::after{transition:none!important;animation-play-state:paused!important}'; document.head.appendChild(s); const v = document.createElement('style'); v.id = 'sp-iso'; document.head.appendChild(v); })()`);
		const a = await page.run(anatomy);
		if (!a) throw new Error('could not read the copy');
		const painting = a.nodes.filter((n) => n.paint.length || Object.values(n.pseudos).some((p) => p.paint.length));
		const structure = a.nodes.filter((n) => !painting.includes(n) && (n.fx.mask || n.fx.perspective || n.fx.clip || n.fx.transform || n.fx.filter));
		const layers = painting.slice(0, 14);
		const iso = (vis, force = []) => page.eval(`document.getElementById('sp-iso').textContent = ${JSON.stringify(`*{visibility:hidden!important}${vis.map((i) => `.c${i}{visibility:visible!important}`).join('')}${force.map((i) => `.c${i}{opacity:1!important}`).join('')}`)}`);
		mkdirSync(path.join(dir, 'layers'), { recursive: true });
		mkdirSync(path.join(dir, 'steps'), { recursive: true });
		const pics = [];
		for (const [k, n] of layers.entries()) {
			await iso([n.i], n.fx.opacity === '0' ? [n.i] : []);
			await wait(60);
			const png = await shot(page, { ...a.clip, format: 'png' });
			writeFileSync(path.join(dir, 'layers', `layer-${k + 1}.png`), png);
			pics.push(png);
		}
		for (const k of layers.keys()) {
			await iso(layers.slice(0, k + 1).map((n) => n.i));
			await wait(60);
			writeFileSync(path.join(dir, 'steps', `step-${k + 1}.png`), await shot(page, { ...a.clip, format: 'png' }));
		}
		await page.eval(`document.getElementById('sp-iso').textContent = ''`);
		const rules = new Map();
		for (const m of css.matchAll(/^\.c(\d+)(::(?:before|after))?\{([^}]*)\}/gm)) rules.set(`${m[1]}${m[2] ?? ''}`, cleanDecls(m[3]));
		const info = layers.map((n, k) => ({ k: k + 1, n, name: nameOf(n, files), how: howOf(n, states, motion) }));
		// the exploded view: the layer pictures stacked apart in 3D, numbered, with a legend
		const ex = await launch({ width: 1600, height: 1200 });
		try {
			const W = a.clip.width, H = a.clip.height, gap = Math.max(56, Math.min(110, 640 / Math.max(1, layers.length)));
			const html = `<!doctype html><html><head><meta charset="utf-8"><style>
				*{box-sizing:border-box;margin:0}
				body{background:#fafafa;font-family:-apple-system,"SF Pro Text","Inter",system-ui,sans-serif;-webkit-font-smoothing:antialiased;color:#18181b}
				.wrap{position:relative}
				.stage{position:absolute;left:0;top:0;perspective:3000px}
				.stack{position:relative;width:${W}px;height:${H}px;transform-style:preserve-3d;transform:rotateX(56deg) rotateZ(-38deg)}
				.plane{position:absolute;inset:0;transform-style:preserve-3d;border-radius:14px;background:rgba(255,255,255,.18);box-shadow:0 0 0 1px rgba(43,100,248,.22)}
				.plane img{position:absolute;inset:0;width:100%;height:100%}
				.plane b{position:absolute;left:-14px;top:-14px;width:28px;height:28px;border-radius:8px;background:#2b64f8;color:#fff;font:600 14px/28px -apple-system,system-ui,sans-serif;text-align:center;box-shadow:0 0 0 2px #fff}
				.legend{position:absolute;width:400px}
				.legend h1{font-size:20px;font-weight:650;letter-spacing:-.01em;margin-bottom:4px}
				.legend p.sub{color:#71717a;font-size:13px;margin-bottom:22px}
				.legend li{list-style:none;display:grid;grid-template-columns:28px 1fr;gap:12px;padding:11px 0;border-top:1px solid #ececef}
				.legend li i{font-style:normal;width:22px;height:22px;border-radius:6px;background:#2b64f8;color:#fff;font:600 12px/22px -apple-system,system-ui,sans-serif;text-align:center}
				.legend li b{display:block;font-size:14px;font-weight:600;margin-bottom:2px}
				.legend li span{display:block;font-size:12.5px;line-height:1.45;color:#52525b}
			</style></head><body><div class="wrap">
				<div class="stage"><div class="stack">${pics.map((p, k) => `<div class="plane" style="transform:translateZ(${k * gap}px)"><img src="data:image/png;base64,${p.toString('base64')}"><b>${k + 1}</b></div>`).join('')}</div></div>
				<div class="legend"><h1>${label.replace(/</g, '&lt;')}</h1><p class="sub">${layers.length} layers, bottom to top</p><ul>${info.map((x) => `<li><i>${x.k}</i><div><b>${x.name.replace(/</g, '&lt;')}</b><span>${(x.how.find((h) => !/^drawn by/.test(h)) ?? x.how[0] ?? '').replace(/</g, '&lt;')}</span></div></li>`).join('')}</ul></div>
			</div></body></html>`;
			const exFile = path.join(dir, 'exploded.html');
			writeFileSync(exFile, html);
			await ex.page.send('Emulation.setDeviceMetricsOverride', { width: 2400, height: 2000, deviceScaleFactor: 1.5, mobile: false });
			await goto(ex.page, pathToFileURL(exFile).href, { settle: 1500 });
			const b = await ex.page.eval(`(() => {
				const M = 56, stage = document.querySelector('.stage'), legend = document.querySelector('.legend');
				let u = null;
				for (const p of document.querySelectorAll('.plane')) { const q = p.getBoundingClientRect(); u = u ? { l: Math.min(u.l, q.left), t: Math.min(u.t, q.top), r: Math.max(u.r, q.right), b: Math.max(u.b, q.bottom) } : { l: q.left, t: q.top, r: q.right, b: q.bottom }; }
				stage.style.transform = 'translate(' + (M - u.l) + 'px,' + (M - u.t) + 'px)';
				const w = u.r - u.l, h = u.b - u.t, lh = legend.getBoundingClientRect().height;
				legend.style.left = (M + w + 64) + 'px';
				legend.style.top = (M + Math.max(0, (h - lh) / 2)) + 'px';
				return { x: 0, y: 0, width: M + w + 64 + 400 + M, height: M * 2 + Math.max(h, lh) };
			})()`);
			await wait(100);
			writeFileSync(path.join(dir, 'exploded.png'), await shot(ex.page, { ...b, format: 'png' }));
		} finally {
			ex.close();
		}
		// the lesson
		const L = [];
		L.push(`# How it is made: ${label}`);
		L.push('');
		if (note) { L.push(`**What you wanted to know:** ${note}`); L.push(''); }
		L.push(`From ${url}. ${layers.length} layers, painted bottom to top. exploded.png shows them pulled apart; layers/ has each one on its own; steps/ shows how far the build should look after each step.`);
		L.push('');
		L.push('![exploded](exploded.png)');
		L.push('');
		if (structure.length) {
			L.push('## The frame around it');
			for (const n of structure) {
				const how = howOf({ ...n, paint: [] }, states, motion);
				if (how.length) L.push(`- .c${n.i} (${n.tag}): ${how.join('; ')}`);
			}
			L.push('');
		}
		L.push('## The layers');
		for (const x of info) {
			L.push(`### ${x.k}. ${x.name}`);
			for (const h of x.how) L.push(`- ${h}`);
			L.push(`- picture: layers/layer-${x.k}.png`);
			L.push('');
		}
		L.push('## Build it in steps');
		L.push('Each step adds one layer. After each, compare yours with the step picture before moving on.');
		L.push('');
		for (const x of info) {
			const own = [`${x.n.i}`, `${x.n.i}::before`, `${x.n.i}::after`].filter((k) => rules.has(k));
			L.push(`### Step ${x.k}: ${x.name}`);
			L.push(`Should look like steps/step-${x.k}.png.`);
			L.push('```css');
			for (const k of own) L.push(`.c${k} { ${rules.get(k).join('; ')} }`);
			L.push('```');
			L.push('');
		}
		if (motion) { L.push(motionMarkdown(motion, { short: true }).replace('## Motion and interaction', '## How it moves')); L.push(''); }
		L.push('## Make it yours');
		L.push('Keep the technique, change the values: the colours of the fills and gradients, the corner radius, how deep the shadows go, the tilt, and the art itself. The structure (what sits on what, what clips what, what fades in) is what makes it work.');
		L.push('');
		L.push(`_Taken apart from ${url} to learn from. If you ship something made this way, use your own art, copy and colours._`);
		const md = L.join('\n');
		writeFileSync(path.join(dir, 'LESSON.md'), md);
		return {
			md, exploded: readFileSync(path.join(dir, 'exploded.png')), layers: info.length, steps: info.length,
			// for the view on the page itself: each layer's picture and where it sits against the element
			view: {
				size: a.size, offset: { x: a.clip.x - a.rootPage.x, y: a.clip.y - a.rootPage.y }, clip: { w: a.clip.width, h: a.clip.height },
				frame: structure.map((n) => howOf({ ...n, paint: [] }, states, motion)).flat().slice(0, 4),
				layers: info.map((x, k) => ({ n: x.k, name: x.name, how: x.how, png: pics[k].toString('base64') })),
			},
		};
	} finally {
		close();
	}
}
