// Break it down: a pick taken apart so the person can learn how it is made, or rebuild it their own way. Works on
// the pick's exact copy (component.html), never on their live page: what each layer paints and how (shadows,
// gradients, masks, pseudo-element layers, tilts, things hidden until hover), each layer photographed on its own,
// an exploded view of the stack, and the build in steps, each with a picture of how far it should look.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { goto, launch, shot, wait } from './chrome.mjs';
import { change, curve, motionMarkdown } from './motion.mjs';
import { spKit } from './kit.mjs';

const K = spKit();
const { nameOf, specsOf, fileName, deg, blurOf, colorOf, slugOf, groupLayers, groupSpecs } = K;

/** In the copy: every element that paints something (the kit is put on the page first). */
function anatomy() {
	return window.__spKit.anatomyOf(document.querySelector('.c0'), (e) => { const m = (e.getAttribute('class') || '').match(/\bc(\d+)\b/); return m ? +m[1] : null; });
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
	let mine = (motion?.motions ?? []).filter((m) => m.node === n.i && m.frames > 1 && m.trigger !== 'leave');
	if (mine.some((m) => m.exact)) mine = mine.filter((m) => m.exact).filter((m, k, a) => a.findIndex((x) => x.exactId === m.exactId) === k); // the page's own animation, once
	const loop = (motion?.loops ?? []).find((l) => l.node === n.i);
	if (n.fx.opacity === '0') {
		const m = mine.find((x) => x.prop === 'opacity') ?? mine[0];
		L.push(m ? `hidden at rest, it comes in ${WHEN[m.trigger] ?? m.trigger}${m.delay > 20 ? ` (${m.delay} ms after)` : ''}, over ${m.exact?.duration ?? m.duration} ms` : hoverKeys.length ? 'hidden at rest, it fades in on hover' : 'hidden at rest (opacity 0): nothing in the recorded session (load, scroll, hover, press) brought it in, so something else does, like a click elsewhere or a state of the page');
	} else if (hoverKeys.length) L.push(`changes on hover: ${hoverKeys.flatMap(([, d]) => d).slice(0, 3).join('; ').slice(0, 160)}`);
	if (loop) L.push(`keeps moving on its own (${loop.css ? `CSS animation "${loop.css.name}", ${Math.round(loop.css.duration)} ms a cycle` : loop.continuous ? 'continuously' : `every ${loop.period} ms`})`);
	else for (const m of mine.filter((x) => x.prop !== 'opacity' || n.fx.opacity !== '0').slice(0, 2)) L.push(`moves ${WHEN[m.trigger] ?? m.trigger}: ${m.prop}${m.spring ? ', on a spring' : m.exact ? `, ${m.exact.duration} ms, ${/^eased per keyframe/.test(m.exact.easing ?? '') ? 'eased per keyframe' : m.exact.easing}` : m.bezier ? `, ${m.duration} ms cubic-bezier(${m.bezier.c.join(', ')})` : ''}`);
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



/** A layer's own CSS under a real name; a group's with everything it holds (named after it, numbered). */
function cssFor(ctx, x) {
	const n = x.n, cls = slugOf(x.name);
	const ids = [n.i, ...(n.sub ? (n.members ?? []).filter((i) => i !== n.i) : [])];
	const out = [];
	for (const id of ids) for (const k of [`${id}`, `${id}::before`, `${id}::after`]) {
		if (!ctx.rules.has(k)) continue;
		const name = id === n.i ? cls : `${cls}-part-${id}`;
		out.push(`.${name}${k.replace(/^\d+/, '')} { ${ctx.rules.get(k).join('; ')} }`);
	}
	return out.join('\n');
}

/** A prompt that builds just this layer: its exact CSS under a real name, how it moves, its art. */
export function layerPrompt(ctx, x, motion) {
	const { n } = x, cls = slugOf(x.name);
	const host = (() => { try { return new URL(ctx.url).host.replace(/^www\./, ''); } catch { return ctx.url; } })();
	const css = cssFor(ctx, x);
	const L = [];
	L.push(`# Build this: ${x.name.replace(/ \(layer-\d+\.\w+\)/, '')}, from ${host}`);
	L.push('');
	L.push(`It is one layer (${x.k} of ${ctx.info.length}, counted from the bottom) of a ${ctx.label} on ${ctx.url}. How it is made:`);
	for (const h of x.how) L.push(`- ${h}`);
	L.push('');
	L.push('## Exact CSS (computed on the live page)');
	L.push('```css');
	L.push(css || `/* no styles of its own */`);
	L.push('```');
	const media = n.paint.find((p) => p.k === 'media');
	if (media) { const f = ctx.files.find((y) => y.src === media.v); L.push(''); L.push(`## The art`); L.push(`Use the file itself: ${f ? `${f.file} (from ${media.v})` : media.v}${/\.svg/i.test(media.v) ? ', and keep it as SVG' : ''}.`); }
	if (motion) {
		let mine = motion.motions.filter((m) => m.node === n.i && m.frames > 2 && m.trigger !== 'leave');
		if (mine.some((m) => m.exact)) mine = mine.filter((m) => m.exact).filter((m, k, a2) => a2.findIndex((y) => y.exactId === m.exactId) === k);
		const calls = (motion.waapi ?? []).filter((w) => w.node === n.i);
		if (mine.length || calls.length) {
			L.push('');
			L.push('## Motion');
			for (const m of mine) L.push(`- ${{ load: 'When the page loads', scroll: 'As it scrolls into view', idle: 'On its own', hover: 'On hover', pointer: 'As the pointer moves over it', press: 'While pressed', click: 'On click' }[m.trigger] ?? m.trigger}: ${change(m)}, ${curve(m)}.`);
			for (const w of calls) L.push(`- Exactly as the page does it: \`el.animate(${JSON.stringify(w.keyframes)}, ${JSON.stringify(w.options)})\``);
		}
	}
	L.push('');
	L.push(`Keep every value as given. Use the class name .${cls} or one that fits your project; it sits inside its parent as the CSS says (position and offsets included).`);
	return L.join('\n');
}

/** What the view on the page needs: each layer's picture, card rows and prompt. motion undefined = still recording. */
export function viewOf(ctx, motion, pics) {
	return {
		size: ctx.size, offset: ctx.offset, clip: ctx.clip,
		frame: ctx.structure.flatMap((n) => howOf({ ...n, paint: [] }, ctx.states, motion ?? null)).slice(0, 4),
		layers: ctx.info.map((x0, k) => { const x = { ...x0, how: howOf(x0.n, ctx.states, motion ?? null) }; return { n: x.k, name: x.name, how: x.how, specs: groupSpecs(x.n, motion), prompt: layerPrompt(ctx, x, motion), css: cssFor(ctx, x), ...(pics ? { png: pics[k].toString('base64') } : {}) }; }),
	};
}


/** LESSON.md: the layers bottom to top, the build in steps, and how it moves. */
export function lessonOf(ctx, motion, note) {
	const { label, url, structure, states, rules } = ctx;
	const layers = ctx.layers;
	const info = ctx.info.map((x) => ({ ...x, how: howOf(x.n, states, motion ?? null) }));
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
	return md;
}

/** Everything for "Break it down": LESSON.md, exploded.png, steps/step-N.png. */
export async function breakdown({ dir, file, css, states, motion = null, files = [], url, label, note, onView = null, given = null }) {
	const { page, close } = await launch({ width: 1600, height: 1200 });
	try {
		await goto(page, pathToFileURL(file).href, { settle: 2500 });
		await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
		await page.eval(`(() => { const s = document.createElement('style'); s.textContent = 'html,body{background:transparent!important} *,*::before,*::after{transition:none!important;animation-play-state:paused!important}'; document.head.appendChild(s); const v = document.createElement('style'); v.id = 'sp-iso'; document.head.appendChild(v); })()`);
		await page.eval(`window.__spKit = (${spKit.toString()})()`);
		const a = await page.run(anatomy);
		if (!a) throw new Error('could not read the copy');
		const painting = a.nodes.filter((n) => n.paint.length || Object.values(n.pseudos).some((p) => p.paint.length));
		const structure = a.nodes.filter((n) => !painting.includes(n) && (n.fx.mask || n.fx.perspective || n.fx.clip || n.fx.transform || n.fx.filter));
		// the layers: as the page grouped them (when it took it apart there), else grouped here
		const byI = new Map(a.nodes.map((x) => [x.i, x]));
		let groups = given?.length ? given.map((g) => ({ ...g, n: byI.get(g.i) })).filter((g) => g.n) : [];
		if (!groups.length) groups = groupLayers(a.nodes, files); // the page's layers did not match this copy: group here
		if (!groups.length) groups = [{ i: a.nodes[0].i, sub: true, members: a.nodes.map((x) => x.i), name: 'The whole thing', n: a.nodes[0] }];
		const layers = groups.map((g) => ({ ...g.n, sub: g.sub, members: g.members, gname: g.name, gbox: g.box }));
		const iso = (vis, force = []) => page.eval(`document.getElementById('sp-iso').textContent = ${JSON.stringify(`*{visibility:hidden!important}${vis.map((n) => `${(n.members ?? [n.i]).map((m) => `.c${m}`).join(',')}{visibility:visible!important}`).join('')}${force.map((i) => `.c${i}{opacity:1!important}`).join('')}`)}`);
		mkdirSync(path.join(dir, 'layers'), { recursive: true });
		mkdirSync(path.join(dir, 'steps'), { recursive: true });
		const pics = [];
		for (const [k, n] of layers.entries()) {
			await iso([n], n.fx.opacity === '0' ? [n.i] : []);
			await wait(60);
			const png = await shot(page, { ...a.clip, format: 'png' });
			writeFileSync(path.join(dir, 'layers', `layer-${k + 1}.png`), png);
			pics.push(png);
		}
		const rules = new Map();
		for (const m of css.matchAll(/^\.c(\d+)(::(?:before|after))?\{([^}]*)\}/gm)) rules.set(`${m[1]}${m[2] ?? ''}`, cleanDecls(m[3]));
		const info = layers.map((n, k) => ({ k: k + 1, n, name: n.gname ?? nameOf(n, files), how: howOf(n, states, motion) }));
		const ctx = { layers, info, rules, files, url, label, states, structure, size: a.size, offset: { x: a.clip.x - a.rootPage.x, y: a.clip.y - a.rootPage.y }, clip: { w: a.clip.width, h: a.clip.height } };
		// the view on the page goes up now; the steps and the pictures below follow while they look at it
		const view = viewOf(ctx, motion, pics);
		if (onView) await onView(view).catch(() => {});
		for (const k of layers.keys()) {
			await iso(layers.slice(0, k + 1));
			await wait(60);
			writeFileSync(path.join(dir, 'steps', `step-${k + 1}.png`), await shot(page, { ...a.clip, format: 'png' }));
		}
		await page.eval(`document.getElementById('sp-iso').textContent = ''`);
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
		const md = lessonOf(ctx, motion, note);
		writeFileSync(path.join(dir, 'LESSON.md'), md);
		return {
			md, exploded: readFileSync(path.join(dir, 'exploded.png')), layers: info.length, steps: info.length,
			view, ctx,
		};
	} finally {
		close();
	}
}
