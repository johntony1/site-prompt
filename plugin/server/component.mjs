// One component, cloned exactly: the person hovers the page in a real Chrome window and clicks the part they want
// (or the agent names a selector). site-prompt snapshots that element's whole subtree with every computed style that
// differs from the browser default, its :hover, :focus-visible and :active states, its keyframes and
// fonts, into a standalone component.html that renders like the original. Then it proves it: the snapshot is rendered
// on its own and scored against a screenshot of the original element.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { goto, launch, shot, viewport, wait } from './chrome.mjs';
import { alignedScore } from './compare.mjs';
import { fetchExternal, mine } from './css.mjs';
import { dismissConsent } from './inpage.mjs';
import { ToolError } from './mcp.mjs';

/** In the page: the picker overlay. Hover highlights, click picks, ↑ goes to the parent, Esc gives up. */
function picker() {
	if (window.__spPicker) return;
	window.__spPicker = true;
	const Z = 2147483647;
	const box = document.createElement('div'), tip = document.createElement('div'), bar = document.createElement('div');
	box.style.cssText = `position:fixed;pointer-events:none;z-index:${Z};border:2px solid #3b82f6;background:rgba(59,130,246,.08);border-radius:4px;transition:all 60ms ease-out;display:none`;
	tip.style.cssText = `position:fixed;pointer-events:none;z-index:${Z};font:600 11px/1 ui-sans-serif,system-ui;color:#fff;background:#3b82f6;padding:5px 7px;border-radius:5px;display:none;white-space:nowrap`;
	bar.style.cssText = `position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:${Z};font:500 13px/1 ui-sans-serif,system-ui;color:#fff;background:rgba(17,17,20,.92);backdrop-filter:blur(12px);padding:11px 16px;border-radius:999px;box-shadow:0 8px 30px rgba(0,0,0,.25);pointer-events:none`;
	bar.textContent = 'Click the part you want to clone.  ↑ picks its parent.  Esc stops.';
	document.documentElement.append(box, tip, bar);
	let cur = null;
	const ours = (e) => e === box || e === tip || e === bar;
	const show = () => {
		if (!cur) return;
		const r = cur.getBoundingClientRect();
		Object.assign(box.style, { display: 'block', left: r.left - 2 + 'px', top: r.top - 2 + 'px', width: r.width + 4 + 'px', height: r.height + 4 + 'px' });
		tip.textContent = `${cur.tagName.toLowerCase()}${typeof cur.className === 'string' && cur.className.trim() ? '.' + cur.className.trim().split(/\s+/)[0] : ''}  ${Math.round(r.width)}×${Math.round(r.height)}`;
		Object.assign(tip.style, { display: 'block', left: Math.max(4, r.left) + 'px', top: (r.top > 30 ? r.top - 26 : r.bottom + 6) + 'px' });
	};
	const done = (how) => {
		removeEventListener('mousemove', move, true);
		removeEventListener('click', click, true);
		removeEventListener('keydown', key, true);
		box.remove(); tip.remove(); bar.remove();
		window.__spPick(how);
	};
	const move = (e) => { if (!ours(e.target)) { cur = e.target; show(); } };
	const click = (e) => {
		e.preventDefault(); e.stopPropagation();
		if (!cur) return;
		cur.setAttribute('data-sp-picked', '1');
		done('picked');
	};
	const key = (e) => {
		if (e.key === 'Escape') { e.preventDefault(); done('cancelled'); }
		if (e.key === 'ArrowUp' && cur?.parentElement && cur.parentElement !== document.body) { e.preventDefault(); cur = cur.parentElement; show(); }
	};
	addEventListener('mousemove', move, true);
	addEventListener('click', click, true);
	addEventListener('keydown', key, true);
	for (const t of ['mousedown', 'mouseup', 'pointerdown', 'pointerup']) addEventListener(t, (e) => { if (window.__spPicker && document.contains(bar)) { e.preventDefault(); e.stopPropagation(); } }, true);
}

/** In the page: snapshot the subtree of [data-sp-picked] (computed styles minus defaults), remember the base look. */
function snapshot(sel) {
	const root = document.querySelector(sel || '[data-sp-picked]');
	if (!root) return null;
	const frame = document.createElement('iframe');
	frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
	document.body.appendChild(frame);
	const fd = frame.contentDocument;
	fd.open(); fd.write('<!doctype html><html><head></head><body></body></html>'); fd.close();
	const defaults = new Map();
	const SVG = 'http://www.w3.org/2000/svg';
	const defOf = (el, pseudo) => {
		const key = (el.namespaceURI === SVG ? 'svg:' : '') + el.localName + (pseudo ?? '') + (el.localName === 'a' && el.hasAttribute('href') ? '[href]' : '') + (el.localName === 'input' ? `[${el.getAttribute('type') || 'text'}]` : '');
		if (defaults.has(key)) return defaults.get(key);
		let d;
		if (el.namespaceURI === SVG) { const s = fd.createElementNS(SVG, 'svg'); const c = el.localName === 'svg' ? s : fd.createElementNS(SVG, el.localName); if (c !== s) s.appendChild(c); fd.body.appendChild(s); d = fd.defaultView.getComputedStyle(c); }
		else {
			const c = fd.createElement(pseudo ? 'span' : el.localName);
			// a link's defaults are a link's (underline, link colour), and an input's are its type's
			if (!pseudo && el.localName === 'a' && el.hasAttribute('href')) c.setAttribute('href', '#');
			if (!pseudo && el.localName === 'input') c.setAttribute('type', el.getAttribute('type') || 'text');
			fd.body.appendChild(c);
			d = fd.defaultView.getComputedStyle(c);
		}
		const o = {};
		for (let i = 0; i < d.length; i++) o[d[i]] = d.getPropertyValue(d[i]);
		defaults.set(key, o);
		return o;
	};
	const INHERITED = new Set(['color', 'font-family', 'font-size', 'font-style', 'font-weight', 'font-variant', 'font-stretch', 'font-feature-settings', 'font-variation-settings', 'font-optical-sizing', 'font-kerning', 'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-transform', 'text-indent', 'text-shadow', 'white-space', 'white-space-collapse', 'text-wrap', 'text-wrap-mode', 'text-wrap-style', 'visibility', 'cursor', 'list-style-type', 'list-style-position', 'list-style-image', 'direction', '-webkit-font-smoothing', 'text-rendering', 'quotes', 'tab-size', 'word-break', 'overflow-wrap', 'hyphens', 'caret-color', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'stroke-dasharray', 'border-collapse', 'border-spacing', 'writing-mode', '-webkit-text-fill-color', '-webkit-text-stroke-color', '-webkit-text-stroke-width', 'paint-order', 'color-scheme', 'font-synthesis-weight', 'font-synthesis-style', 'font-synthesis-small-caps', 'text-underline-position', 'text-decoration-skip-ink']);
	const CURRENT = new Set(['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-color', 'column-rule-color', 'row-rule-color', 'text-decoration-color', 'text-emphasis-color', 'caret-color', '-webkit-text-fill-color', '-webkit-text-stroke-color']);
	const KEEP_WEBKIT = /^-webkit-(text-fill-color|background-clip|line-clamp|box-orient|text-stroke|font-smoothing|mask)/;
	const LOGICAL = /(^|-)(block|inline)(-|$)|^inset-(block|inline)|^(min-|max-)?(block|inline)-size$|-start|-end(?!$)|^border-(start|end)-/;
	const SKIP = new Set(['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'perspective-origin', 'transform-origin', 'inset', 'view-transition-name', 'anchor-name', 'interpolate-size', 'app-region', 'field-sizing', 'speak', 'zoom']);
	const nodes = [root, ...root.querySelectorAll('*')].filter((e) => !['SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'STYLE'].includes(e.tagName)).slice(0, 900);
	const index = new Map(nodes.map((n, i) => [n, i]));
	window.__spBase = [];
	const rules = [];
	const decls = (cs, def, parentCs, isRoot) => {
		const out = [];
		for (let i = 0; i < cs.length; i++) {
			const p = cs[i];
			if (SKIP.has(p) || p.startsWith('--') || LOGICAL.test(p) || (p.startsWith('-webkit-') && !KEEP_WEBKIT.test(p))) continue;
			const v = cs.getPropertyValue(p);
			if (CURRENT.has(p) && v === cs.color) continue; // currentColor, follows color
			if (INHERITED.has(p) && !isRoot && parentCs && parentCs.getPropertyValue(p) === v) continue;
			if (!(INHERITED.has(p) && isRoot) && def[p] === v) continue;
			if (INHERITED.has(p) && isRoot && def[p] === v) continue;
			out.push(`${p}:${v}`);
		}
		if (cs.transform !== 'none' || cs.perspective !== 'none' || cs.rotate !== 'none' || cs.scale !== 'none') out.push(`transform-origin:${cs.transformOrigin}`);
		// a border style without its width falls back to "medium" (3px): a solid 0px border must say 0px
		for (const side of ['top', 'right', 'bottom', 'left']) {
			if (out.some((x) => x.startsWith(`border-${side}-style:`)) && !out.some((x) => x.startsWith(`border-${side}-width:`))) out.push(`border-${side}-width:${cs.getPropertyValue(`border-${side}-width`)}`);
		}
		if (out.some((x) => x.startsWith('outline-style:')) && !out.some((x) => x.startsWith('outline-width:'))) out.push(`outline-width:${cs.outlineWidth}`);
		return out;
	};
	nodes.forEach((n, i) => {
		const cs = getComputedStyle(n), parent = n === root ? null : getComputedStyle(n.parentElement);
		const base = {};
		for (let k = 0; k < cs.length; k++) base[cs[k]] = cs.getPropertyValue(cs[k]);
		window.__spBase[i] = base;
		for (const ps of ['::before', '::after']) { const pc = getComputedStyle(n, ps); if (pc.content && pc.content !== 'none' && pc.content !== 'normal') { const b = {}; for (let k = 0; k < pc.length; k++) b[pc[k]] = pc.getPropertyValue(pc[k]); window.__spBase[i + ps] = b; } }
		n.setAttribute('data-sp-n', String(i));
		let d = decls(cs, defOf(n), parent, n === root);
		if (n === root) d = d.filter((x) => !/^(margin|position|top|left|right|bottom|z-index|grid-area|grid-row|grid-column|order|flex-grow|flex-shrink|flex-basis|align-self|justify-self)(-|:)/.test(x)).concat(cs.position === 'fixed' || cs.position === 'absolute' || cs.position === 'sticky' ? ['position:relative'] : cs.position === 'relative' ? ['position:relative'] : []);
		rules.push(`.c${i}{${d.join(';')}}`);
		for (const ps of ['::before', '::after']) {
			const pc = getComputedStyle(n, ps);
			if (!pc.content || pc.content === 'none' || pc.content === 'normal') continue;
			const pd = decls(pc, defOf(n, ps), cs, false);
			rules.push(`.c${i}${ps}{content:${pc.content};${pd.filter((x) => !x.startsWith('content:')).join(';')}}`);
		}
	});
	// the markup: classes become c<i>, behaviour and noise stripped, URLs made absolute
	const abs = (u) => { try { return new URL(u, location.href).href; } catch { return u; } };
	const clone = root.cloneNode(true);
	const cl = [clone, ...clone.querySelectorAll('*')];
	const orig = [root, ...root.querySelectorAll('*')];
	for (let k = cl.length - 1; k >= 0; k--) {
		const c = cl[k], o = orig[k], i = index.get(o);
		if (i === undefined) { c.remove(); continue; }
		for (const a of [...c.attributes]) {
			const n = a.name;
			if (n === 'style' || n === 'class' || (n === 'id' && o.namespaceURI !== SVG) || n.startsWith('on') || n.startsWith('data-') || n === 'srcset' || n === 'sizes' || n === 'loading' || n === 'decoding' || n === 'fetchpriority' || n === 'nonce' || n === 'jsaction' || n === 'tabindex' && c.tagName !== 'BUTTON') c.removeAttribute(n);
		}
		c.setAttribute('class', `c${i}`);
		if (o.tagName === 'IMG') c.setAttribute('src', abs(o.currentSrc || o.src));
		if (o.tagName === 'A' && o.getAttribute('href')) c.setAttribute('href', abs(o.getAttribute('href')));
		if (o.tagName === 'VIDEO') { const s = o.currentSrc || o.querySelector('source')?.src; if (s) c.setAttribute('src', abs(s)); if (o.poster) c.setAttribute('poster', abs(o.poster)); }
		if (o.tagName === 'SOURCE' && o.getAttribute('srcset')) c.remove();
		if (o.tagName === 'USE') { const h = o.getAttribute('href') || o.getAttribute('xlink:href'); const ref = h && h.startsWith('#') && document.querySelector(h); if (ref) { const g = document.createElementNS(SVG, 'g'); g.innerHTML = ref.innerHTML; c.replaceWith(g); } }
	}
	const r = root.getBoundingClientRect();
	let bgEl = root.parentElement, bg = 'transparent';
	while (bgEl) { const b = getComputedStyle(bgEl).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) { bg = b; break; } bgEl = bgEl.parentElement; }
	if (bg === 'transparent') bg = '#ffffff';
	const families = [...new Set(nodes.map((n) => getComputedStyle(n).fontFamily.split(',')[0].replace(/["']/g, '').trim()))];
	const anims = [...new Set(nodes.flatMap((n) => getComputedStyle(n).animationName.split(',').map((s) => s.trim())).filter((a) => a && a !== 'none'))];
	const interactive = nodes.map((n, i) => ({ n, i })).filter(({ n, i }) => i === 0 || n.matches('a,button,input,select,textarea,summary,[role=button],[tabindex]') || getComputedStyle(n).cursor === 'pointer').slice(0, 12).map(({ i }) => i);
	const sheets = [], external = [];
	for (const s of document.styleSheets) { try { sheets.push({ href: s.href, text: [...s.cssRules].map((x) => x.cssText).join('\n') }); } catch { if (s.href) external.push(s.href); } }
	frame.remove();
	return {
		html: clone.outerHTML, rules, bg, families, anims, interactive, sheets, external,
		box: { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height },
		tag: root.tagName.toLowerCase(), text: (root.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 200),
		nodes: nodes.length,
		fits: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth,
		pinned: (() => { for (let x = root; x && x !== document.documentElement; x = x.parentElement) if (/fixed|sticky/.test(getComputedStyle(x).position)) return true; return false; })(),
		styles: [...new Set(nodes.map((n) => getComputedStyle(n).fontStyle))],
		latin: !/[^\u0000-\u024f\u2000-\u206f\u20ac\u2122]/.test(root.innerText || ''),
	};
}

/** In the page: what changed (against the base look) on node i and everything inside it, under the forced state. */
function stateDiff(i) {
	const root = document.querySelector(`[data-sp-n="${i}"]`);
	if (!root) return {};
	const out = {};
	const IGNORE = /^(--|-webkit-(?!text-fill|background-clip|text-stroke))|^(transition|animation)/;
	for (const n of [root, ...root.querySelectorAll('[data-sp-n]')]) {
		const j = +n.getAttribute('data-sp-n'), base = window.__spBase[j], cs = getComputedStyle(n), d = [];
		for (let k = 0; k < cs.length; k++) { const p = cs[k]; if (IGNORE.test(p)) continue; const v = cs.getPropertyValue(p); if (base[p] !== v) d.push(`${p}:${v}`); }
		if (d.length) out[j] = d;
		for (const ps of ['::before', '::after']) {
			const pb = window.__spBase[j + ps];
			if (!pb) continue;
			const pc = getComputedStyle(n, ps), pd = [];
			for (let k = 0; k < pc.length; k++) { const p = pc[k]; if (IGNORE.test(p)) continue; const v = pc.getPropertyValue(p); if (pb[p] !== v) pd.push(`${p}:${v}`); }
			if (pd.length) out[j + ps] = pd;
		}
	}
	return out;
}

async function embedFonts(faces, referer) {
	let budget = 8_000_000;
	const out = [];
	for (const f of faces.slice(0, 8)) {
		let face = f;
		for (const m of [...f.matchAll(/url\("?([^")]+)"?\)(\s*format\("?([\w-]+)"?\))?/g)]) {
			const u = m[1];
			if (u.startsWith('data:')) continue;
			try {
				const r = await fetch(u, { headers: { referer, origin: new URL(referer).origin, 'user-agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36' }, signal: AbortSignal.timeout(20_000) });
				if (!r.ok) continue;
				const buf = Buffer.from(await r.arrayBuffer());
				if (buf.length > budget) continue;
				budget -= buf.length;
				const type = /woff2/.test(m[4] ?? u) ? 'font/woff2' : /woff/.test(m[4] ?? u) ? 'font/woff' : /otf|opentype/.test(m[4] ?? u) ? 'font/otf' : 'font/ttf';
				face = face.replace(m[0], `url("data:${type};base64,${buf.toString('base64')}")${m[2] ?? ''}`);
				break; // one file per face is enough (the first is the best format)
			} catch {}
		}
		// drop the sources that were not embedded once one was
		if (face.includes('data:font')) face = face.replace(/src:\s*([^;]+);/, (all, list) => `src: ${list.split(/,(?=\s*url\()/).filter((x) => x.includes('data:font')).join(',')};`);
		out.push(face);
	}
	return out;
}

const STATES = [['hover', ['hover']], ['focus-visible', ['focus', 'focus-visible']], ['active', ['hover', 'active']]];

export async function clone(url, outDir, { selector, wait: waitS = 180, log = () => {} } = {}) {
	mkdirSync(outDir, { recursive: true });
	const headless = !!selector;
	const { page, close } = await launch({ headless, width: 1440, height: 900 });
	try {
		log('opening the page');
		await goto(page, url);
		if (await page.run(dismissConsent).catch(() => false)) await wait(500);
		if (selector) {
			const ok = await page.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return false; e.setAttribute('data-sp-picked', '1'); e.scrollIntoView({ block: 'center' }); return true; })()`);
			if (!ok) throw new ToolError(`Nothing on the page matches the selector ${selector}.`);
			await wait(500);
		} else {
			log('waiting for the click');
			await page.send('Runtime.addBinding', { name: '__spPick' });
			const picked = page.once('Runtime.bindingCalled', waitS * 1000).catch(() => null);
			await page.run(picker);
			await page.send('Page.bringToFront').catch(() => {});
			const ev = await picked;
			if (!ev) throw new ToolError(`Nothing was picked in ${waitS} s. Call site_component again when you're ready to click.`);
			if (ev.payload !== 'picked') throw new ToolError('Picking was cancelled (Esc).');
			await wait(200);
		}
		return await extract(page, '[data-sp-picked]', outDir, url, { log });
	} finally {
		close();
	}
}

/** Snapshot the element at `sel` on an open page (any tab, the person's own included), with its states, fonts and
 *  keyframes, into outDir/component.html; then render that alone and score it against the original. */
export async function extract(page, sel, outDir, url, { log = () => {}, own = false, check = true } = {}) {
	mkdirSync(outDir, { recursive: true });
	{
		await page.eval(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({ block: 'nearest', inline: 'nearest' })`).catch(() => {});
		await wait(250);
		log('snapshotting');
		const snap = await page.run(snapshot, sel, 120_000);
		if (!snap) throw new ToolError('Lost the picked element (the page changed under it). Try again.');
		// the original, at rest and in each state
		const clip = { x: Math.floor(snap.box.x), y: Math.floor(snap.box.y), width: Math.ceil(snap.box.width), height: Math.ceil(snap.box.height) };
		const pad = 24;
		const padded = { x: Math.max(0, clip.x - pad), y: Math.max(0, clip.y - pad), width: clip.width + pad * 2, height: clip.height + pad * 2 };
		await page.eval(`(() => { const s = document.createElement('style'); s.id = 'sp-freeze'; s.textContent = '*,*::before,*::after{transition:none!important;animation-play-state:paused!important}'; document.head.appendChild(s); })()`);
		await wait(80);
		const beyond = !own && !snap.pinned && !snap.fits;
		const restPng = await shot(page, { beyond, ...clip, format: 'png' });
		writeFileSync(path.join(outDir, 'original.png'), await shot(page, { beyond, ...padded, format: 'png' }));
		writeFileSync(path.join(outDir, 'original-tight.png'), restPng); // the element alone: what site_match compares a rebuild with
		writeFileSync(path.join(outDir, 'pick.json'), JSON.stringify({ url, box: snap.box, tag: snap.tag, text: snap.text }));
		const { root } = await page.send('DOM.getDocument', { depth: 0 });
		const states = {}, stateRules = [];
		for (const i of snap.interactive) {
			const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-sp-n="${i}"]` });
			if (!nodeId) continue;
			for (const [name, forced] of STATES) {
				await page.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: forced });
				await wait(40);
				const diff = await page.run(stateDiff, i);
				for (const [j, d] of Object.entries(diff)) {
					let keep = d;
					if (d.some((x) => x === 'outline-style:auto')) keep = keep.filter((x) => !/^outline-|^outline:/.test(x)); // the browser's own focus ring
					if (name === 'active') keep = keep.filter((x) => !states[i]?.hover?.[j]?.includes(x));
					if (keep.length) diff[j] = keep; else delete diff[j];
				}
				if (Object.keys(diff).length) {
					(states[i] ??= {})[name] = diff;
					for (const [j, d] of Object.entries(diff)) { const [jn, ps] = j.split('::'); stateRules.push(`.c${i}:${name}${+jn === i ? '' : ` .c${jn}`}${ps ? '::' + ps : ''}{${d.map((x) => x + ' !important').join(';')}}`); }
					if (name === 'hover' && i === snap.interactive[0]) writeFileSync(path.join(outDir, 'original-hover.png'), await shot(page, { beyond, ...padded, format: 'png' }));
				}
				await page.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
			}
		}
		await page.eval(`document.getElementById('sp-freeze')?.remove()`);
		// fonts and keyframes it uses, verbatim
		const css = mine([...snap.sheets, ...(await fetchExternal(snap.external, url))]);
		// the font files go inside component.html: a font server rarely lets another origin (or a file) load them
		const LATIN = /U\+0-|U\+100-|U\+0000-/i;
		const remoteFaces = [...new Set(css.fontFaces)].filter((f) => snap.families.some((fam) => f.includes(fam)))
			.filter((f) => { const st = f.match(/font-style:\s*(\w+)/)?.[1] ?? 'normal'; return snap.styles.includes(st === 'oblique' ? 'italic' : st); })
			.filter((f) => !snap.latin || !/unicode-range/.test(f) || LATIN.test(f))
			.filter(() => !!snap.text); // a picture with no words needs no fonts
		const faces = await embedFonts(remoteFaces, url);
		const frames = snap.anims.map((a) => css.keyframes[a]).filter(Boolean);
		const bg = snap.bg;
		const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${snap.tag} from ${new URL(url).host}</title>
<!-- Cloned by site-prompt from ${url}: every computed style that differs from the browser default, with its states. -->
<style>
${faces.join('\n')}
${frames.join('\n')}
html,body{margin:0}
body{min-height:100vh;display:grid;place-items:center;background:${bg};padding:24px;box-sizing:border-box}
${snap.rules.join('\n')}
${stateRules.join('\n')}
</style></head>
<body>
${snap.html}
</body></html>
`;
		const file = path.join(outDir, 'component.html');
		writeFileSync(file, html);
		await page.eval(`(() => { document.querySelectorAll('[data-sp-n]').forEach((e) => e.removeAttribute('data-sp-n')); delete window.__spBase; })()`).catch(() => {});
		const code = { html: snap.html, css: [...remoteFaces, ...frames, ...snap.rules, ...stateRules].join('\n'), fonts: css.families.filter((f) => snap.families.includes(f.family)).map((f) => ({ ...f, sources: [...new Set(remoteFaces.filter((x) => x.includes(f.family)).sort((a, b) => /U\+0-/i.test(b) - /U\+0-/i.test(a)).flatMap((x) => [...x.matchAll(/url\("?([^")]+)"?\)/g)].map((m) => m[1])))].concat(f.sources).filter((u, k, a) => a.indexOf(u) === k) })) };
		if (!check) return { file, outDir, snap, states, stateRules, code, faces: faces.length, keyframes: frames.length, ssim: null, diff: null, size: { original: [clip.width, clip.height], clone: [clip.width, clip.height], ok: true }, sheet: null, offset: null, unchecked: true };
		// proof: render the snapshot alone and score it against the original element
		log('checking the clone');
		const chk = await launch({ width: Math.max(400, clip.width + 96), height: Math.max(300, clip.height + 96) });
		try {
			await goto(chk.page, pathToFileURL(file).href, { settle: 3000 });
			// text anti-aliasing follows the sub-pixel position, which a standalone component does not carry: render it at
			// the original's fraction and a few others, and keep the best
			const fx = snap.box.x - Math.floor(snap.box.x), fy = snap.box.y - Math.floor(snap.box.y);
			await chk.page.eval(`(() => { const s = document.createElement('style'); s.id = 'sp-check'; document.head.appendChild(s); })()`);
			const P = 3, tries = [];
			const xs = [...new Set([fx, 0, 0.25, 0.5, 0.75].map((v) => Math.round(v * 100) / 100))], ys = [...new Set([fy, 0, 0.5].map((v) => Math.round(v * 100) / 100))];
			let b;
			for (const ox of xs) for (const oy of ys) {
				await chk.page.eval(`document.getElementById('sp-check').textContent = '*,*::before,*::after{transition:none!important;animation-play-state:paused!important} body{display:block!important;padding:0!important} .c0{margin:${48 + oy}px 0 0 ${48 + ox}px!important}'`);
				await wait(60);
				b = await chk.page.eval(`(() => { const r = document.querySelector('.c0').getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; })()`);
				tries.push(await shot(chk.page, { x: Math.floor(b.x) - P, y: Math.floor(b.y) - P, width: clip.width + P * 2, height: clip.height + P * 2, format: 'png' }));
			}
			writeFileSync(path.join(outDir, 'clone.png'), await shot(chk.page, { x: Math.max(0, Math.floor(b.x) - pad), y: Math.max(0, Math.floor(b.y) - pad), width: clip.width + pad * 2, height: clip.height + pad * 2, format: 'png' }));
			let score = null;
			for (const t of tries) { const sc = await alignedScore(chk.page, restPng, t, P); if (!score || sc.diff < score.diff) score = sc; }
			const ssim = score.ssim;
			const sizeOk = Math.abs(b.width - clip.width) <= 2 && Math.abs(b.height - clip.height) <= 2;
			return { file, outDir, snap, states, stateRules, code, faces: faces.length, keyframes: frames.length, ssim, diff: score.diff, size: { original: [clip.width, clip.height], clone: [Math.round(b.width), Math.round(b.height)], ok: sizeOk }, sheet: Buffer.from(score.sheet.split(',')[1], 'base64'), offset: score.offset };
		} finally {
			chk.close();
		}
	}
}
