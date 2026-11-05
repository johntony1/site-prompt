// Pick mode: the person browses a site and points at what they like (a button, a line of type, an illustration, a
// section, any component); each pick becomes a prompt that builds exactly that thing.
//
// Where it runs, with nothing installed:
//   their own Chrome   when remote debugging is on (chrome://inspect/#remote-debugging, Chrome 144+): their tabs,
//                      their logins; Chrome asks them to allow the session.
//   a Chrome window    otherwise: site-prompt opens one with its own profile (kept, so sign-ins stay).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connectOwn, goto, launch, openTab, ownChrome, shot, viewport, wait } from './chrome.mjs';
import { extract } from './component.mjs';
import { ToolError } from './mcp.mjs';
import { details, overlay } from './overlay.mjs';
import { project } from './project.mjs';
import { placer, tokens } from './place.mjs';
import { ICONS, THEME } from './theme.mjs';
import { motionMarkdown, recordMotion } from './motion.mjs';
import { instant, viewer } from './viewer.mjs';
import { snapshot } from './component.mjs';
import { spKit } from './kit.mjs';
const LOOK = `window.__spTheme = ${JSON.stringify(THEME)}; window.__spIcons = ${JSON.stringify(ICONS)};`;
// what Break it down needs in the page to take a pick apart on the spot
const KIT = `window.__spKit = (${spKit.toString()})(); window.__spSnap = ${snapshot.toString()}; window.__spViewer = ${viewer.toString()}; window.__spInstant = ${instant.toString()};`;

let session = null; // { page, close, own, url, queue, waiter }

export const active = () => !!session;

export async function open(url, { mode = 'auto', log = () => {} } = {}) {
	await stop();
	let conn = null;
	if (mode !== 'window' && ownChrome()) conn = await connectOwn(url, { log });
	if (!conn && mode === 'own') throw new ToolError('Your Chrome is not reachable. Turn on remote debugging at chrome://inspect/#remote-debugging (Chrome 144 or later, Chrome must be open), or use mode "window".');
	// the picker's own window may still be open from before (Chrome then refuses a second one on that profile): use it
	const windowProfile = path.join(os.homedir(), '.site-prompt', 'chrome-profile');
	if (!conn && process.env.SITE_PROMPT_PICK_HEADLESS !== '1') conn = await connectOwn(url, { log, dir: windowProfile }).then((c) => (c ? { ...c, own: false, reused: true } : null)).catch(() => null);
	if (!conn) {
		const headless = process.env.SITE_PROMPT_PICK_HEADLESS === '1';
		const b = await launch({ headless, width: 1440, height: 900, profileDir: headless ? null : path.join(os.homedir(), '.site-prompt', 'chrome-profile') });
		if (url) await goto(b.page, url, { settle: 4000 });
		conn = { page: b.page, close: b.close, own: false, url, endpoint: b.endpoint, headless };
	}
	const s = { ...conn, queue: [], waiter: null };
	await s.page.send('Runtime.addBinding', { name: '__spSend' });
	s.page.on('Runtime.bindingCalled', (e) => {
		if (e.name !== '__spSend') return;
		try { s.queue.push(JSON.parse(e.payload)); } catch { return; }
		s.waiter?.();
	});
	// building a project? the toolbar offers to add picks straight to it
	const proj = project();
	const src = `${LOOK} ${KIT} window.__spProject = ${JSON.stringify(proj ? { name: proj.name } : null)}; (${overlay.toString()})()`;
	await s.page.send('Page.addScriptToEvaluateOnNewDocument', { source: src });
	// a picker from an earlier session may still be in this tab (it cannot be replaced in place: its listeners stay):
	// reload the tab so only this one runs
	const stale = await s.page.eval('!!window.__spOverlay || !!document.querySelector("site-prompt-ui")').catch(() => false);
	if (stale) {
		const loaded = s.page.once('Page.loadEventFired', 30_000).catch(() => null);
		await s.page.send('Page.reload', { ignoreCache: false }).catch(() => {});
		await loaded;
		await wait(600);
	}
	await s.page.eval(src);
	s.page.router?.on?.('close', () => { if (session === s) session = null; });
	session = s;
	return { own: s.own, url: s.url ?? url };
}

/** The next batch of picks, waiting up to `seconds`. */
export async function next(seconds) {
	if (!session) return null;
	const s = session;
	if (!s.queue.length) await new Promise((res) => { s.waiter = res; setTimeout(res, seconds * 1000); });
	s.waiter = null;
	return s.queue.shift() ?? null;
}

export async function stop() {
	if (!session) return;
	const s = session;
	session = null;
	if (s.dev) { try { await s.dev.page.eval('window.__spPlacer?.remove()'); } catch {} if (s.dev.opened) await s.dev.close(); }
	try { await s.page.eval(`document.querySelector('site-prompt-ui')?.remove(); window.__spOverlay = false;`); } catch {}
	s.close();
}

const slug = (t) => String(t ?? '').toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const NAME = { illustration: 'illustration', button: 'button', text: 'text', section: 'section', component: 'component' };

/** Every pick in a batch → its folder, component.html, screenshots and PROMPT.md. */
/** In a copy of the page: wait until the element's own animations have finished (an entrance would be caught half way). */
async function settled(page, sel) {
	for (let t0 = Date.now(); Date.now() - t0 < 6000; await wait(150)) {
		const busy = await page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return 0; return e.getAnimations({ subtree: true }).filter((a) => a.playState === 'running' && a.effect?.getComputedTiming?.().endTime !== Infinity).length; })()`).catch(() => 0);
		if (!busy) return;
	}
}

/** The same element at 390 px wide, in the copy (never the person's page). */
async function phoneIn(page, sel, dir, vw, vh) {
	const wide = await page.run(layoutOf, { sel, props: LAYOUT });
	if (!wide) return null;
	await viewport(page, 390, 844, false);
	try {
		await wait(500);
		const box = await page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; })()`);
		await wait(250);
		const narrow = await page.run(layoutOf, { sel, props: LAYOUT });
		if (!box || !narrow) return null;
		const hidden = narrow[0].hidden;
		if (!hidden && box.width >= 1 && box.height >= 1) {
			const pad = 12;
			writeFileSync(path.join(dir, 'original-mobile.png'), await shot(page, { beyond: true, x: Math.max(0, Math.floor(box.x) - pad), y: Math.max(0, Math.floor(box.y) - pad), width: Math.min(390, Math.ceil(box.width) + pad * 2), height: Math.ceil(box.height) + pad * 2, format: 'png' }));
		}
		const changes = [];
		for (let i = 0; i < Math.min(wide.length, narrow.length) && changes.length < 40; i++) {
			const a = wide[i], b = narrow[i];
			if (a.hidden !== b.hidden) { changes.push(`.c${i}: ${b.hidden ? 'hidden on phones' : 'only shown on phones'}`); continue; }
			if (b.hidden) continue;
			const d = LAYOUT.filter((k) => a[k] !== b[k]).map((k) => `${kebab(k)} ${a[k]} → ${b[k]}`);
			if (d.length) changes.push(`.c${i}: ${d.join('; ')}`);
		}
		return { hidden, size: [Math.round(box.width), Math.round(box.height)], changes, shot: hidden ? null : 'original-mobile.png' };
	} finally {
		await viewport(page, vw, vh);
		await wait(200);
	}
}

/**
 * Every pick in a batch → its folder, component.html, screenshots, motion and PROMPT.md. All the work that changes a
 * page (forcing hover and press, freezing animations, resizing, scrolling) happens in a copy of the page in a Chrome
 * of its own; the person's page is only read. Only when the pick is not in a fresh copy (behind their login, a pop-up
 * they opened) is it read on their page.
 */
export async function processBatch(batch, baseDir, { log = () => {} } = {}) {
	// taking it apart: get to the picture fast; the phone check and the copy check are skipped, the motion follows later
	const quick = batch.action === 'learn';
	const s = session;
	if (!s) throw new ToolError('The picking session closed.');
	const host = new URL(batch.url).host.replace(/^www\./, '').replace(/[^\w.-]+/g, '-');
	const out = [];
	const vp = await s.page.eval('({ w: innerWidth, h: innerHeight })').catch(() => ({ w: 1440, h: 900 }));
	let copy = null;
	const copyPage = async () => {
		if (copy) return copy;
		copy = await launch({ width: vp.w, height: vp.h });
		await goto(copy.page, batch.url, { settle: quick ? 2000 : 4000 });
		return copy;
	};
	try {
		for (const p of batch.picks) {
			const sel = `[data-sp-pick="${p.n}"]`;
			const d = await s.page.run(details, sel).catch(() => null);
			if (!d) { out.push({ ...p, error: 'it was no longer on the page (it changed or you navigated away)' }); continue; }
			const name = `${String(p.n).padStart(2, '0')}-${p.kind}${d.text ? '-' + slug(d.text.split('\n')[0]) : ''}`;
			const dir = path.join(baseDir, host, 'picks', name);
			rmSync(dir, { recursive: true, force: true }); // a new pick under an old name starts clean (no stale pictures)
			mkdirSync(dir, { recursive: true });
			await s.page.eval(`window.__spStatus?.(${JSON.stringify(`Reading ${p.n}. ${p.label}…`)})`).catch(() => {});
			const elPath = await s.page.run(pathTo, sel).catch(() => null);
			const safeClick = await s.page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; if (e.closest('a[href]') || e.closest('form')) return false; return e.matches('button[type=button], summary, [aria-expanded], [role=tab], [role=switch], [role=button]') || !!e.querySelector(':scope > summary'); })()`).catch(() => false);
			// how it moves: recorded in another Chrome of its own, at the same time
			const motionRun = elPath ? recordMotion({ url: batch.url, elPath, dir, safeClick, log }).catch(() => null) : Promise.resolve(null);
			try {
				let r = null;
				const inst = quick && batch.instant && batch.instant.n === p.n ? batch.instant : null;
				if (inst) {
					// taken apart in the page already: the copy is that snapshot, exactly what they saw
					const file = path.join(dir, 'component.html');
					writeFileSync(file, `<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${p.kind} from ${host}</title>\n<!-- Taken by site-prompt from ${batch.url} as it was on screen: every computed style that differs from the browser default. -->\n<style>\n${inst.fonts.join('\n')}\nhtml,body{margin:0}\nbody{min-height:100vh;display:grid;place-items:center;background:${inst.bg};padding:24px;box-sizing:border-box}\n${inst.rules.join('\n')}\n</style></head>\n<body>\n${inst.html}\n</body></html>\n`);
					writeFileSync(path.join(dir, 'instant.json'), JSON.stringify({ size: inst.size, bg: inst.bg, why: inst.why, layers: inst.layers }, null, 1));
					const W = Math.round(inst.size.w), H = Math.round(inst.size.h);
					r = { file, outDir: dir, where: 'page', snap: { nodes: (inst.html.match(/class="c\d+/g) ?? []).length, tag: d.tag, text: d.text }, states: {}, stateRules: [], code: { html: inst.html, css: [...inst.fonts, ...inst.rules].join('\n'), fonts: [] }, faces: inst.fonts.length, keyframes: 0, ssim: null, diff: null, size: { original: [W, H], clone: [W, H], ok: true }, sheet: null, unchecked: true, mobile: null };
				}
				const c = !r && elPath ? await copyPage().catch(() => null) : null;
				const inCopy = !r && c && await c.page.eval(`(() => { const e = document.querySelector(${JSON.stringify(elPath)}); if (!e) return false; const r = e.getBoundingClientRect(); if (!r.width || !r.height) return false; document.querySelectorAll('[data-sp-copy]').forEach((x) => x.removeAttribute('data-sp-copy')); e.setAttribute('data-sp-copy', '1'); e.scrollIntoView({ block: 'center' }); return true; })()`).catch(() => false);
				if (r) {
					// done above
				} else if (inCopy) {
					await wait(400);
					await settled(c.page, '[data-sp-copy]');
					r = await extract(c.page, '[data-sp-copy]', dir, batch.url, { own: false, log, check: !quick });
					await s.page.eval(`window.__spStatus?.(${JSON.stringify(`Checking ${p.n} at phone width…`)})`).catch(() => {});
					r.mobile = quick ? null : await phoneIn(c.page, '[data-sp-copy]', dir, vp.w, vp.h).catch(() => null);
					r.where = 'copy';
				} else {
					// only on their page: read it there, keeping the picker out of the pictures
					await s.page.eval(`window.__spHide?.(true, ${JSON.stringify(sel)})`).catch(() => {});
					r = await extract(s.page, sel, dir, batch.url, { own: s.own, log, check: !quick }).finally(() => s.page.eval('window.__spHide?.(false)').catch(() => {}));
					r.mobile = quick ? null : await atPhoneWidth(s, sel, dir, batch.url).catch(() => null);
					r.where = 'page';
				}
				let asset = null;
				const files = (d.layers ?? []).filter((l) => l.src && /^https?:/.test(l.src) && l.tag !== 'video');
				if (files.length > 1) {
					asset = [];
					for (const [k, l] of files.entries()) { const got = await download(l.src, dir, batch.url, `layer-${k + 1}`); if (got) asset.push({ ...got, layer: l }); }
					if (!asset.length) asset = null;
				} else if (d.art?.src && /^https?:/.test(d.art.src) && d.art.kind !== 'video') asset = await download(d.art.src, dir, batch.url);
				if (quick) {
					// the motion arrives later; the prompt is written again when it does
					r.motion = null;
					const item = { ...p, dir, r, d, asset, elPath, motionRun };
					item.finish = async () => { r.motion = await motionRun; item.md = pickPrompt({ pick: p, d, r, url: batch.url, asset, dir }); writeFileSync(path.join(dir, 'PROMPT.md'), item.md); return r.motion; };
					item.md = pickPrompt({ pick: p, d, r, url: batch.url, asset, dir });
					writeFileSync(path.join(dir, 'PROMPT.md'), item.md);
					out.push(item);
				} else {
					await s.page.eval(`window.__spStatus?.(${JSON.stringify(`Recording how ${p.n} moves…`)})`).catch(() => {});
					r.motion = await motionRun;
					const md = pickPrompt({ pick: p, d, r, url: batch.url, asset, dir });
					writeFileSync(path.join(dir, 'PROMPT.md'), md);
					out.push({ ...p, dir, md, r, d, asset, elPath });
				}
			} catch (e) {
				await motionRun;
				out.push({ ...p, error: String(e.message ?? e) });
			}
			await s.page.eval(`document.querySelector(${JSON.stringify(sel)})?.removeAttribute('data-sp-pick')`).catch(() => {});
		}
	} finally {
		copy?.close();
	}
	const ok = out.filter((x) => !x.error).length;
	const done = !ok ? 'Could not read those. Try again.' : batch.action === 'learn' ? `Taking it apart…` : batch.action === 'add' ? `✓ Your agent is adding ${ok === 1 ? 'it' : `all ${ok}`} to your project` : `✓ ${ok} prompt${ok > 1 ? 's' : ''} ready in your agent`;
	await s.page.eval(`window.__spStatus?.(${JSON.stringify(done)})`).catch(() => {});
	return out;
}

async function download(src, dir, referer, base = 'asset') {
	try {
		const r = await fetch(src, { headers: { referer, 'user-agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36' }, signal: AbortSignal.timeout(30_000) });
		if (!r.ok) return null;
		const type = r.headers.get('content-type') ?? '';
		const ext = /svg/.test(type) ? 'svg' : /png/.test(type) ? 'png' : /webp/.test(type) ? 'webp' : /avif/.test(type) ? 'avif' : /gif/.test(type) ? 'gif' : /json/.test(type) ? 'json' : /jpe?g/.test(type) ? 'jpg' : (new URL(src).pathname.split('.').pop() || 'bin').slice(0, 5);
		const buf = Buffer.from(await r.arrayBuffer());
		if (buf.length > 25_000_000) return null;
		const file = `${base}.${ext}`;
		writeFileSync(path.join(dir, file), buf);
		return { file, src, bytes: buf.length };
	} catch {
		return null;
	}
}

const px = (v) => String(v).replace(/(\d+\.\d{3,})px/g, (m, n) => `${Math.round(+n * 100) / 100}px`);

/** The prompt for one pick: what it is, the exact code, and what its kind needs (type spec, the artwork). */
export function pickPrompt({ pick, d, r, url, asset, dir }) {
	const host = new URL(url).host.replace(/^www\./, '');
	const kind = NAME[pick.kind] ?? 'component';
	const size = `${r.size.original.join('×')} px`;
	const L = [];
	L.push(`# Build this ${kind} from ${host}, exactly`);
	L.push('');
	if (pick.note) { L.push(`**What I want from it:** ${pick.note}`); L.push(''); }
	if (pick.area) { L.push(`**Only the area I drew:** ${pick.area.w}×${pick.area.h} px, starting ${pick.area.x} px from its left and ${pick.area.y} px from its top. Build what is inside that area; the rest of the code below is the context it sits in.`); L.push(''); }
	L.push(`It is a ${size} ${kind} on ${url}${d.text && pick.kind !== 'section' ? ` ("${d.text.split('\n')[0].slice(0, 80)}")` : ''}. Build it so it looks exactly the same: same size, spacing, type, colours, radius, shadows, states and motion, nothing moved, nothing restyled.`);
	L.push('');
	L.push(`The code below is its exact markup and every style the browser computed for it on the live page. On its own it renders like the original${r.diff == null ? '' : ` (checked against a screenshot: ${(r.diff * 100).toFixed(1)}% pixel difference)`}. Keep every value as given. Rename the positional classes (c0, c1…) to meaningful ones and write it in this project's stack (React + Tailwind if there is none), without changing how it looks.`);
	L.push('');
	const code = r.code.html.length + r.code.css.length < 60_000;
	L.push('## Exact code');
	L.push('```html');
	L.push(r.code.html.length < 40_000 ? r.code.html : r.code.html.slice(0, 40_000) + '\n<!-- cut here: the full markup is in component.html -->');
	L.push('```');
	L.push('```css');
	L.push(code ? px(r.code.css) : px(r.code.css).slice(0, Math.max(8000, 60_000 - r.code.html.length)) + '\n/* cut here: the full styles are in component.html */');
	L.push('```');
	L.push('');
	if (r.stateRules.length) {
		L.push('## States (forced in Chrome, already in the CSS above)');
		for (const [i, st] of Object.entries(r.states)) for (const [state, diff] of Object.entries(st)) {
			L.push(`- ${state} on .c${i}: ${Object.entries(diff).map(([j, decls]) => { const [jn, ps] = j.split('::'); return `${+jn === +i ? (ps ? `its ::${ps} ` : '') : `.c${jn}${ps ? '::' + ps : ''} `}${decls.slice(0, 5).map(px).join('; ')}`; }).join(' | ')}`);
		}
		L.push('');
	}
	if (r.mobile) {
		const m = r.mobile;
		L.push('## On phones (390 px wide)');
		if (m.hidden) L.push('The original hides it at this width. Hide it on phones too, or ask.');
		else {
			L.push(`It is ${m.size.join('×')} px there${m.shot ? ' (original-mobile.png)' : ''}. ${m.changes.length ? 'What the original changes at that width; do the same with a breakpoint:' : 'Its layout does not change; only the width follows its container.'}`);
			for (const c of m.changes) L.push(`- ${px(c)}`);
		}
		L.push('');
	}
	if (pick.kind === 'text' || pick.kind === 'button') {
		const t = d.type;
		L.push('## Type');
		L.push(`- Font: ${t.family}`);
		L.push(`- ${t.size} / line height ${t.lineHeight}, weight ${t.weight}${t.style !== 'normal' ? `, ${t.style}` : ''}, letter spacing ${t.letterSpacing}${t.wordSpacing !== '0px' ? `, word spacing ${t.wordSpacing}` : ''}${t.transform !== 'none' ? `, ${t.transform}` : ''}, aligned ${t.align}`);
		L.push(`- Colour ${t.color}${t.background && /text/.test(t.clip ?? '') ? `; the fill is a background clipped to the text: ${t.background}` : ''}${t.shadow !== 'none' ? `; text shadow ${t.shadow}` : ''}`);
		if (t.features !== 'normal' || t.variation !== 'normal') L.push(`- OpenType features ${t.features}; variable axes ${t.variation}`);
		L.push(`- ${t.lines} line${t.lines > 1 ? 's' : ''} at this width; the copy, exactly: "${d.text.slice(0, 600)}"`);
		L.push('');
	}
	if (Array.isArray(asset) && asset.length) {
		const vec = asset.every((x) => x.layer.vector);
		L.push('## The artwork');
		L.push(`It is ${asset.length} ${vec ? 'SVG (vector) files' : 'image files'} stacked on top of each other, positioned exactly as in the code above. Use the files themselves (saved in the folder below), keep their stacking order and positions${vec ? ', and keep them as SVG so they stay sharp at any size' : ''}:`);
		for (const [k, x] of asset.entries()) L.push(`- ${x.file}: layer ${k + 1}${x.layer.vector ? ', vector' : x.layer.natural ? `, ${x.layer.natural} natural` : ''}, shown at ${x.layer.shown} (${x.src})`);
		L.push('');
	} else if (d.art) {
		const a = d.art;
		L.push('## The artwork');
		if (a.kind === 'svg') L.push(`It is an inline SVG: the exact drawing is in the markup above. Keep it as SVG, path for path.`);
		else if ((a.kind === 'image' || a.kind === 'background') && /\.svg(\?|#|$)/i.test(a.src ?? '')) L.push(`It is an SVG (vector) file shown at ${d.box.width}×${d.box.height}: use the file itself${asset ? ` (${asset.file} in the folder below, from ${a.src})` : ` (${a.src})`} and keep it as SVG.`);
		else if (a.kind === 'image' || a.kind === 'background') L.push(`It is a raster image (${a.natural ?? 'unknown size'} natural, shown at ${d.box.width}×${d.box.height}${a.fit && a.fit !== 'fill' ? `, object-fit ${a.fit}` : ''}). Words cannot redraw a picture exactly: use the file itself${asset ? ` (${asset.file} in the folder below, from ${a.src})` : ` (${a.src})`}. To make your own in the same style, describe it to an image model from original.png and keep the same size and crop.`);
		else if (a.kind === 'canvas') L.push(`It is drawn by script on a ${a.webgl ? 'WebGL ' : ''}canvas at runtime, so there is no markup or file to copy. original.png is the reference frame; rebuild it with ${a.webgl ? 'WebGL (three.js or a shader)' : 'canvas 2D'} to match.`);
		else if (a.kind === 'video') L.push(`It is a video (${a.src}). Use your own footage at the same size and crop; the frame in original.png is the reference.`);
		else L.push(`It is a ${a.kind} animation${a.src ? ` (${a.src})` : ''}; use the same file or player.`);
		L.push('');
	}
	if (r.motion) L.push(motionMarkdown(r.motion));
	else { L.push('## Motion and interaction'); L.push('Not recorded: the pick could not be found in a fresh copy of the page (a login, a pop-up or content that changes each visit). Watch it on the page and describe what moves.'); L.push(''); }
	if (r.code.fonts.length && d.text) {
		L.push('## Fonts');
		for (const f of r.code.fonts) L.push(`- ${f.family}: weights ${f.weights.join(', ') || '?'}; ${f.sources[0] ?? 'system font'}. Use the same font where the licence allows, or the closest free match with the same metrics.`);
		L.push('');
	}
	L.push('## Check');
	L.push(`Render yours next to the screenshot of the original at the same size (original.png${r.states && Object.keys(r.states).length ? ' and original-hover.png' : ''} in ${dir.replace(os.homedir(), '~')}), including the hover state; they must match pixel for pixel.${r.motion?.filmstrip ? ' Then play your motion against motion.png (key frames of the original, left to right in time).' : ''}`);
	L.push('');
	L.push(`_From ${url}. For learning, a redesign, or your own product: if you ship it, make the copy and any logo your own._`);
	return L.join('\n');
}

const LAYOUT = ['display', 'flexDirection', 'flexWrap', 'gridTemplateColumns', 'fontSize', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginBottom', 'rowGap', 'columnGap', 'textAlign', 'justifyContent', 'alignItems', 'position', 'order'];
function layoutOf({ sel, props }) {
	const root = document.querySelector(sel);
	if (!root) return null;
	const nodes = [root, ...root.querySelectorAll('*')].filter((e) => !['SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'STYLE'].includes(e.tagName)).slice(0, 300);
	return nodes.map((n) => {
		const cs = getComputedStyle(n), r = n.getBoundingClientRect();
		const o = { w: Math.round(r.width), h: Math.round(r.height), hidden: cs.display === 'none' || cs.visibility === 'hidden' || (!r.width && !r.height) };
		for (const p of props) o[p] = p === 'gridTemplateColumns' ? (cs[p] === 'none' ? 'none' : `${cs[p].split(/\s+(?![^(]*\))/).length} columns`) : cs[p];
		return o;
	});
}
const kebab = (p) => p.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

/** In the page: a path to the element that also finds it in a fresh copy of the page. */
function pathTo(sel) {
	const el = document.querySelector(sel);
	if (!el) return null;
	const parts = [];
	for (let x = el; x && x !== document.documentElement; x = x.parentElement) {
		if (x.id && !/\d{3,}|:/.test(x.id)) { parts.unshift(`#${CSS.escape(x.id)}`); break; }
		const same = x.parentElement ? [...x.parentElement.children].filter((c) => c.tagName === x.tagName) : [];
		parts.unshift(x.tagName.toLowerCase() + (same.length > 1 ? `:nth-of-type(${same.indexOf(x) + 1})` : ''));
	}
	return parts.join(' > ');
}

/**
 * The same pick at 390 px wide: a screenshot and what its layout does there (it has to work on phones in their site
 * too). Done in a background tab of the same browser (same sign-ins), so the page the person is looking at never moves.
 */
async function atPhoneWidth(s, sel, dir, url) {
	const wide = await s.page.run(layoutOf, { sel, props: LAYOUT });
	const where = await s.page.run(pathTo, sel);
	if (!wide || !where) return null;
	const tab = await openTab(s, url, { background: true, width: 390, height: 844 });
	try {
		const p = tab.page;
		await p.eval('document.fonts ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]).then(() => true) : true').catch(() => {});
		await wait(600);
		const mark = `(() => { const e = document.querySelector(${JSON.stringify(where)}); if (!e) return false; e.setAttribute('data-sp-phone', '1'); return true; })()`;
		if (!(await p.eval(mark).catch(() => false))) return null;
		const psel = '[data-sp-phone]';
		const box = await p.eval(`(() => { const e = document.querySelector('${psel}'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; })()`);
		await wait(250);
		const narrow = await p.run(layoutOf, { sel: psel, props: LAYOUT });
		if (!box || !narrow) return null;
		const hidden = narrow[0].hidden;
		if (!hidden && box.width >= 1 && box.height >= 1) {
			const pad = 12;
			writeFileSync(path.join(dir, 'original-mobile.png'), await shot(p, { beyond: true, x: Math.max(0, Math.floor(box.x) - pad), y: Math.max(0, Math.floor(box.y) - pad), width: Math.min(390, Math.ceil(box.width) + pad * 2), height: Math.ceil(box.height) + pad * 2, format: 'png' }));
		}
		const changes = [];
		for (let i = 0; i < Math.min(wide.length, narrow.length) && changes.length < 40; i++) {
			const a = wide[i], b = narrow[i];
			if (a.hidden !== b.hidden) { changes.push(`.c${i}: ${b.hidden ? 'hidden on phones' : 'only shown on phones'}`); continue; }
			if (b.hidden) continue;
			const d = LAYOUT.filter((k) => a[k] !== b[k]).map((k) => `${kebab(k)} ${a[k]} → ${b[k]}`);
			if (d.length) changes.push(`.c${i}: ${d.join('; ')}`);
		}
		return { hidden, size: [Math.round(box.width), Math.round(box.height)], changes, shot: hidden ? null : 'original-mobile.png' };
	} finally {
		await tab.close();
	}
}

/** Say something in the toolbar(s): the agent reports back where the person is looking. */
export async function say(t) {
	if (!session) return false;
	for (const p of [session.page, session.dev?.page].filter(Boolean)) await p.eval(`window.__spStatus?.(${JSON.stringify(String(t).slice(0, 140))})`).catch(() => {});
	return true;
}

/**
 * Their running site beside the one they pick from: they click where each pick goes. Returns the placements (or null
 * when they did not place within `seconds`), a screenshot of the spot, and their site's design tokens.
 */
export async function place(devUrl, picks, { seconds = 300, wantTokens = false } = {}) {
	const s = session;
	if (!s) return null;
	const want = new URL(devUrl);
	if (s.dev) {
		const href = await s.dev.page.eval('location.href').catch(() => null);
		if (!href) s.dev = null;
	}
	if (!s.dev) {
		const t = await openTab(s, want.href);
		s.dev = { ...t, opened: true, queue: [], waiter: null };
		const d = s.dev;
		await d.page.send('Runtime.addBinding', { name: '__spSend' });
		d.page.on('Runtime.bindingCalled', (e) => {
			if (e.name !== '__spSend') return;
			try { d.queue.push(JSON.parse(e.payload)); } catch { return; }
			d.waiter?.();
		});
		// a hot reload while they place puts the placer back
		d.page.on('Page.loadEventFired', () => { if (d.placing) d.page.eval(d.src).catch(() => {}); });
		if (s.headless) await viewport(d.page, 1440, 900);
	} else {
		await s.dev.page.send('Page.bringToFront').catch(() => {});
	}
	const d = s.dev;
	d.queue.length = 0;
	d.src = `${LOOK} window.__spPlace = ${JSON.stringify({ picks: picks.map((p) => ({ n: p.n, label: p.label })) })}; (${placer.toString()})()`;
	d.placing = true;
	await d.page.eval(d.src);
	const got = d.queue.length ? d.queue.shift() : await new Promise((res) => {
		const t = setTimeout(() => res(null), seconds * 1000);
		d.waiter = () => { clearTimeout(t); res(d.queue.shift() ?? null); };
	});
	d.waiter = null;
	d.placing = false;
	let snapshot = null, design = null;
	if (got?.placed?.length) {
		// the page with the spot marked, as the person saw it
		const first = got.placed[0];
		await d.page.eval(`document.querySelector('[data-sp-place="${first.n}"]')?.scrollIntoView({ block: 'center' })`).catch(() => {});
		await wait(250);
		const vp = await d.page.eval('({ x: scrollX, y: scrollY, w: innerWidth, h: innerHeight })').catch(() => ({ x: 0, y: 0, w: 1440, h: 900 }));
		snapshot = await shot(d.page, { beyond: false, x: vp.x, y: vp.y, width: vp.w, height: vp.h, format: 'jpeg', quality: 80 }).catch(() => null);
		await d.page.eval(`document.querySelectorAll('[data-sp-place]').forEach((e) => e.removeAttribute('data-sp-place'))`).catch(() => {});
	}
	if (wantTokens) design = await d.page.run(tokens).catch(() => null);
	return { ...(got ?? { placed: [], skipped: picks.map((p) => p.n) }), timedOut: !got, snapshot, design };
}

/** Their design tokens from the running site, without placing anything. */
export async function devTokens(devUrl) {
	const s = session;
	if (!s) return null;
	if (!s.dev) {
		const t = await openTab(s, new URL(devUrl).href);
		s.dev = { ...t, opened: true, queue: [], waiter: null };
	}
	return s.dev.page.run(tokens).catch(() => null);
}

/** Break it down on the page itself: the pick lifts off and splits into its layers in 3D, with a labelled panel. */
export async function showView(elPath, view, title, all = null) {
	if (!session) return false;
	const data = { ...view, path: elPath, title, all };
	await session.page.send('Page.bringToFront').catch(() => {});
	await session.page.eval(`${LOOK} window.__spView = ${JSON.stringify(data)}; (${viewer.toString()})()`, 60_000);
	return true;
}

/** New card rows and prompts for the open view (the motion arrived). */
export async function updateView(patch) {
	if (!session) return false;
	await session.page.eval(`window.__spViewUpdate?.(${JSON.stringify(patch)})`, 30_000);
	return true;
}

export const SIZES = [{ id: 'phone', name: 'Phone', w: 390, h: 844 }, { id: 'tablet', name: 'Tablet', w: 834, h: 1112 }, { id: 'laptop', name: 'Laptop', w: 1440, h: 900 }, { id: 'big', name: 'Big screen', w: 1920, h: 1080 }];

/** The pick taken apart at each screen size (in a Chrome of its own), sent into the open view as each is ready. */
export async function viewsAtSizes(url, elPath, title, { log = () => {} } = {}) {
	if (!session || !elPath) return;
	const { page, close } = await launch({ width: 1440, height: 900 });
	try {
		await goto(page, url, { settle: 3000 });
		await page.eval(`${LOOK} ${KIT}`);
		for (const z of SIZES) {
			await viewport(page, z.w, z.h);
			await wait(700);
			const data = await page.eval(`(async () => { const e = document.querySelector(${JSON.stringify(elPath)}); if (!e) return null; const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return { hidden: true }; e.scrollIntoView({ block: 'center' }); await new Promise((res) => setTimeout(res, 250)); return window.__spInstant(e, ${JSON.stringify(title)}, null, false); })()`, 60_000).catch(() => null);
			await updateView({ size: { ...z, data: data ?? { missing: true } } }).catch(() => {});
		}
	} finally {
		close();
	}
}

export { wait };
