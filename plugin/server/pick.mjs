// Pick mode: the person browses a site and points at what they like (a button, a line of type, an illustration, a
// section, any component); each pick becomes a prompt that builds exactly that thing.
//
// Where it runs, with nothing installed:
//   their own Chrome   when remote debugging is on (chrome://inspect/#remote-debugging, Chrome 144+): their tabs,
//                      their logins; Chrome asks them to allow the session.
//   a Chrome window    otherwise: site-prompt opens one with its own profile (kept, so sign-ins stay).
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connectOwn, goto, launch, ownChrome, wait } from './chrome.mjs';
import { extract } from './component.mjs';
import { ToolError } from './mcp.mjs';
import { details, overlay } from './overlay.mjs';

let session = null; // { page, close, own, url, queue, waiter }

export const active = () => !!session;

export async function open(url, { mode = 'auto', log = () => {} } = {}) {
	await stop();
	let conn = null;
	if (mode !== 'window' && ownChrome()) conn = await connectOwn(url, { log });
	if (!conn && mode === 'own') throw new ToolError('Your Chrome is not reachable. Turn on remote debugging at chrome://inspect/#remote-debugging (Chrome 144 or later, Chrome must be open), or use mode "window".');
	if (!conn) {
		const headless = process.env.SITE_PROMPT_PICK_HEADLESS === '1';
		const b = await launch({ headless, width: 1440, height: 900, profileDir: headless ? null : path.join(os.homedir(), '.site-prompt', 'chrome-profile') });
		if (url) await goto(b.page, url, { settle: 4000 });
		conn = { page: b.page, close: b.close, own: false, url };
	}
	const s = { ...conn, queue: [], waiter: null };
	await s.page.send('Runtime.addBinding', { name: '__spSend' });
	s.page.on('Runtime.bindingCalled', (e) => {
		if (e.name !== '__spSend') return;
		try { s.queue.push(JSON.parse(e.payload)); } catch { return; }
		s.waiter?.();
	});
	const src = `(${overlay.toString()})()`;
	await s.page.send('Page.addScriptToEvaluateOnNewDocument', { source: src });
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
	try { await s.page.eval(`document.querySelector('site-prompt-ui')?.remove(); window.__spOverlay = false;`); } catch {}
	s.close();
}

const slug = (t) => String(t ?? '').toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const NAME = { illustration: 'illustration', button: 'button', text: 'text', section: 'section', component: 'component' };

/** Every pick in a batch → its folder, component.html, screenshots and PROMPT.md. */
export async function processBatch(batch, baseDir, { log = () => {} } = {}) {
	const s = session;
	if (!s) throw new ToolError('The picking session closed.');
	const host = new URL(batch.url).host.replace(/^www\./, '').replace(/[^\w.-]+/g, '-');
	const out = [];
	for (const p of batch.picks) {
		const sel = `[data-sp-pick="${p.n}"]`;
		const d = await s.page.run(details, sel).catch(() => null);
		if (!d) { out.push({ ...p, error: 'it was no longer on the page (it changed or you navigated away)' }); continue; }
		const name = `${String(p.n).padStart(2, '0')}-${p.kind}${d.text ? '-' + slug(d.text.split('\n')[0]) : ''}`;
		const dir = path.join(baseDir, host, 'picks', name);
		mkdirSync(dir, { recursive: true });
		await s.page.eval(`window.__spStatus?.(${JSON.stringify(`Reading ${p.n}. ${p.label}…`)})`).catch(() => {});
		try {
			const r = await extract(s.page, sel, dir, batch.url, { own: s.own, log });
			let asset = null;
			if (d.art?.src && /^https?:/.test(d.art.src) && d.art.kind !== 'video') asset = await download(d.art.src, dir, batch.url);
			const md = pickPrompt({ pick: p, d, r, url: batch.url, asset, dir });
			writeFileSync(path.join(dir, 'PROMPT.md'), md);
			out.push({ ...p, dir, md, r, d });
		} catch (e) {
			out.push({ ...p, error: String(e.message ?? e) });
		}
		await s.page.eval(`document.querySelector(${JSON.stringify(sel)})?.removeAttribute('data-sp-pick')`).catch(() => {});
	}
	const ok = out.filter((x) => !x.error).length;
	await s.page.eval(`window.__spStatus?.(${JSON.stringify(ok ? `✓ ${ok} prompt${ok > 1 ? 's' : ''} ready in your agent` : 'Could not read those. Try again.')})`).catch(() => {});
	return out;
}

async function download(src, dir, referer) {
	try {
		const r = await fetch(src, { headers: { referer, 'user-agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36' }, signal: AbortSignal.timeout(30_000) });
		if (!r.ok) return null;
		const type = r.headers.get('content-type') ?? '';
		const ext = /svg/.test(type) ? 'svg' : /png/.test(type) ? 'png' : /webp/.test(type) ? 'webp' : /avif/.test(type) ? 'avif' : /gif/.test(type) ? 'gif' : /json/.test(type) ? 'json' : /jpe?g/.test(type) ? 'jpg' : (new URL(src).pathname.split('.').pop() || 'bin').slice(0, 5);
		const buf = Buffer.from(await r.arrayBuffer());
		if (buf.length > 25_000_000) return null;
		const file = `asset.${ext}`;
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
	L.push(`It is a ${size} ${kind} on ${url}${d.text && pick.kind !== 'section' ? ` ("${d.text.split('\n')[0].slice(0, 80)}")` : ''}. Build it so it looks exactly the same: same size, spacing, type, colours, radius, shadows, states and motion, nothing moved, nothing restyled.`);
	L.push('');
	L.push(`The code below is its exact markup and every style the browser computed for it on the live page. On its own it renders like the original (checked against a screenshot: ${(r.diff * 100).toFixed(1)}% pixel difference). Keep every value as given. Rename the positional classes (c0, c1…) to meaningful ones and write it in this project's stack (React + Tailwind if there is none), without changing how it looks.`);
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
			L.push(`- ${state} on .c${i}: ${Object.entries(diff).map(([j, decls]) => `${+j === +i ? '' : `.c${j} `}${decls.slice(0, 5).map(px).join('; ')}`).join(' | ')}`);
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
	if (d.art) {
		const a = d.art;
		L.push('## The artwork');
		if (a.kind === 'svg') L.push(`It is an inline SVG: the exact drawing is in the markup above. Keep it as SVG, path for path.`);
		else if (a.kind === 'image' || a.kind === 'background') L.push(`It is a raster image (${a.natural ?? 'unknown size'} natural, shown at ${d.box.width}×${d.box.height}${a.fit && a.fit !== 'fill' ? `, object-fit ${a.fit}` : ''}). Words cannot redraw a picture exactly: use the file itself${asset ? ` (${asset.file} in the folder below, from ${a.src})` : ` (${a.src})`}. To make your own in the same style, describe it to an image model from original.png and keep the same size and crop.`);
		else if (a.kind === 'canvas') L.push(`It is drawn by script on a ${a.webgl ? 'WebGL ' : ''}canvas at runtime, so there is no markup or file to copy. original.png is the reference frame; rebuild it with ${a.webgl ? 'WebGL (three.js or a shader)' : 'canvas 2D'} to match.`);
		else if (a.kind === 'video') L.push(`It is a video (${a.src}). Use your own footage at the same size and crop; the frame in original.png is the reference.`);
		else L.push(`It is a ${a.kind} animation${a.src ? ` (${a.src})` : ''}; use the same file or player.`);
		L.push('');
	}
	if (r.code.fonts.length) {
		L.push('## Fonts');
		for (const f of r.code.fonts) L.push(`- ${f.family}: weights ${f.weights.join(', ') || '?'}; ${f.sources[0] ?? 'system font'}. Use the same font where the licence allows, or the closest free match with the same metrics.`);
		L.push('');
	}
	L.push('## Check');
	L.push(`Render yours next to the screenshot of the original at the same size (original.png${r.states && Object.keys(r.states).length ? ' and original-hover.png' : ''} in ${dir.replace(os.homedir(), '~')}), including the hover state; they must match pixel for pixel.`);
	L.push('');
	L.push(`_From ${url}. For learning, a redesign, or your own product: if you ship it, make the copy and any logo your own._`);
	return L.join('\n');
}

export { wait };
