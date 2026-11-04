// Place it: after the person adds picks to the project they are building, their own running site opens beside the
// one they picked from, and they click where each pick goes (a line shows above or below what is under the pointer,
// Alt replaces it). The agent then gets the exact spot: the element, its path, and the source file it comes from
// (from React, Vue, Svelte or Astro dev info in the page, else by searching the project for its text and classes).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/** In the page: the placing toolbar. window.__spPlace = { picks: [{ n, label }], project }. */
export function placer() {
	if (window.__spPlacer) return window.__spPlacer.restart?.();
	const start = () => {
		if (!document.documentElement) return setTimeout(start, 30);
		const cfg = window.__spPlace || { picks: [] };
		const host = document.createElement('site-prompt-place');
		host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647';
		const root = host.attachShadow({ mode: 'closed' });
		root.innerHTML = `<style>${window.__spTheme || ''}</style>
		<div class="hl place"></div><div class="line"></div><div class="chip"></div><div class="pins"></div>
		<div class="bar surface busy"><span class="beam"></span><div class="mark">${window.__spIcons?.cursor ?? ''}</div><span class="q"></span><span class="sep"></span><button class="btn" data-a="skip">Skip</button></div>`;
		document.documentElement.appendChild(host);
		const $ = (s) => root.querySelector(s);
		const hl = $('.hl'), line = $('.line'), chip = $('.chip'), pins = $('.pins'), q = $('.q'), bar = $('.bar');
		let i = 0, cur = null, where = 'after', alt = false, done = false;
		const placed = [];
		const ours = (e) => e.composedPath().includes(host);
		const ask = () => {
			const p = cfg.picks[i];
			if (!p) return;
			q.innerHTML = `Where does <b>${p.n}. ${p.label.split(' · ')[0]}</b> go? <span>${cfg.picks.length > 1 ? `${i + 1} of ${cfg.picks.length} · ` : ''}<kbd>⌥</kbd> replaces</span>`;
		};
		const name = (el) => {
			const id = el.id ? `#${el.id}` : '';
			const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
			return (el.tagName.toLowerCase() + id + cls).slice(0, 48);
		};
		const show = () => {
			if (!cur || done) { hl.style.display = line.style.display = chip.style.display = 'none'; return; }
			const r = cur.getBoundingClientRect();
			Object.assign(hl.style, { display: 'block', left: r.left - 2 + 'px', top: r.top - 2 + 'px', width: r.width + 4 + 'px', height: r.height + 4 + 'px' });
			hl.classList.toggle('rep', alt);
			if (alt) line.style.display = 'none';
			else Object.assign(line.style, { display: 'block', left: r.left + 'px', width: Math.max(24, r.width) + 'px', top: (where === 'before' ? r.top - 3 : r.bottom + 1) + 'px' });
			chip.innerHTML = `${alt ? 'Replace' : where === 'before' ? 'Above' : 'Below'}<i>${name(cur)}</i>`;
			// at the right end of the line, sitting on it, so it never covers what is under the line
			const y = alt ? r.top + 8 : (where === 'before' ? r.top - 3 : r.bottom + 1) - 12;
			chip.style.display = 'flex';
			const w = chip.offsetWidth;
			Object.assign(chip.style, { left: Math.max(6, Math.min(innerWidth - w - 6, r.left + Math.max(24, r.width) - w - (alt ? 8 : 0))) + 'px', top: Math.max(6, Math.min(innerHeight - 30, y)) + 'px' });
		};
		const drawPins = () => {
			pins.innerHTML = '';
			for (const p of placed) {
				if (!document.contains(p.el)) continue;
				const r = p.el.getBoundingClientRect();
				const d = document.createElement('div'); d.className = 'pin';
				Object.assign(d.style, { left: r.left + 'px', width: Math.max(24, r.width) + 'px', top: (p.where === 'before' ? r.top - 3 : p.where === 'replace' ? r.top + r.height / 2 : r.bottom + 1) + 'px' });
				d.innerHTML = `<b>${p.n}</b>`;
				pins.append(d);
			}
		};
		const loop = () => { if (host.isConnected) { show(); drawPins(); requestAnimationFrame(loop); } };
		requestAnimationFrame(loop);
		const block = (e) => { if (!done && !ours(e)) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } };
		const types = ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'contextmenu', 'auxclick'];
		for (const t of types) addEventListener(t, block, true);
		const onMove = (e) => {
			if (done || ours(e)) return;
			alt = e.altKey;
			let el = e.composedPath()[0] instanceof Element ? e.composedPath()[0] : e.target;
			const svg = el.closest?.('svg'); if (svg) el = svg;
			if (!el || el === document.documentElement || el === document.body) return;
			cur = el;
			const r = el.getBoundingClientRect();
			where = e.clientY < r.top + r.height / 2 ? 'before' : 'after';
		};
		const finish = () => {
			done = true;
			const out = placed.map((p) => ({ n: p.n, where: p.where, at: p.info }));
			for (const p of placed) p.el.setAttribute('data-sp-place', String(p.n));
			window.__spSend?.(JSON.stringify({ action: 'place', url: location.href, title: document.title, placed: out, skipped: cfg.picks.filter((p) => !placed.some((x) => x.n === p.n)).map((p) => p.n) }));
			q.innerHTML = placed.length ? `<b>Got it.</b> <span>Your agent is building it in</span>` : `<b>Skipped.</b> <span>Your agent will ask where</span>`;
			$('.sep').hidden = true;
			$('[data-a=skip]').hidden = true;
		};
		const onClick = (e) => {
			if (ours(e) || done) return;
			e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
			if (!cur) return;
			const p = cfg.picks[i];
			placed.push({ n: p.n, el: cur, where: e.altKey ? 'replace' : where, info: window.__spWhere(cur) });
			i++;
			if (i >= cfg.picks.length) finish(); else ask();
		};
		const onKey = (e) => { if (e.key === 'Alt') { alt = e.type === 'keydown'; } if (e.type === 'keydown' && e.key === 'Escape' && !done) { e.preventDefault(); i++; if (i >= cfg.picks.length) finish(); else ask(); } };
		addEventListener('mousemove', onMove, true);
		addEventListener('click', onClick, true);
		addEventListener('keydown', onKey, true);
		addEventListener('keyup', onKey, true);
		root.addEventListener('click', (e) => {
			if (e.target.closest('[data-a=skip]')) { i++; if (i >= cfg.picks.length) finish(); else ask(); }
		});
		ask();
		const teardown = () => {
			for (const t of types) removeEventListener(t, block, true);
			removeEventListener('mousemove', onMove, true); removeEventListener('click', onClick, true);
			removeEventListener('keydown', onKey, true); removeEventListener('keyup', onKey, true);
			host.remove();
		};
		window.__spPlacer = { restart: () => { teardown(); window.__spPlacer = null; placer(); }, remove: () => { teardown(); window.__spPlacer = null; } };
		window.__spStatus = (t) => { const ok = /^✓/.test(t || ''); q.innerHTML = `<b>${String(t).replace(/^✓\s*/, '').replace(/</g, '&lt;')}</b>`; bar.style.display = t ? '' : 'none'; bar.classList.toggle('busy', !ok); };
		window.__spHide = (v) => { host.style.display = v ? 'none' : ''; };
		window.__spTest = { place: (sel, how = 'after') => { const el = document.querySelector(sel); placed.push({ n: cfg.picks[i].n, el, where: how, info: window.__spWhere(el) }); i++; if (i >= cfg.picks.length) finish(); else ask(); }, status: () => q.textContent };
	};
	// the spot, described so an agent can find it in the code
	window.__spWhere = (el) => {
		const cssPath = (e) => {
			const parts = [];
			for (let x = e; x && x !== document.body && parts.length < 6; x = x.parentElement) {
				if (x.id) { parts.unshift(`#${CSS.escape(x.id)}`); break; }
				const same = x.parentElement ? [...x.parentElement.children].filter((c) => c.tagName === x.tagName) : [];
				parts.unshift(x.tagName.toLowerCase() + (same.length > 1 ? `:nth-of-type(${same.indexOf(x) + 1})` : ''));
			}
			return parts.join(' > ');
		};
		const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
		const text = (el.innerText || '').trim().replace(/\s+/g, ' ');
		const heading = el.querySelector?.('h1,h2,h3')?.innerText?.trim() || el.closest('section,header,footer,main,nav')?.querySelector('h1,h2,h3')?.innerText?.trim() || '';
		const source = { files: [], components: [] };
		const push = (f, line, via) => { if (f && !source.files.some((x) => x.file === f)) source.files.push({ file: f, line: line ?? null, via }); };
		const fromStack = (stack) => {
			for (const m of String(stack || '').matchAll(/(?:\/\/\/|\/)((?:\(.*?\)\/)?\.?\/?(?:src|app|pages|components|lib|routes)\/[^\s?:)]+\.(?:tsx|jsx|ts|js|vue|svelte|astro|mdx))(?:\?[^\s:)]*)?:(\d+)/g)) {
				if (!/node_modules/.test(m[1])) push(m[1].replace(/^\(.*?\)\//, '').replace(/^\.\//, ''), +m[2], 'react');
			}
		};
		// React: the fiber knows its owner components; React 18 dev has _debugSource, 19 a _debugStack
		const fk = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
		if (fk) {
			for (let f = el[fk], k = 0; f && k < 40; f = f.return, k++) {
				if (f._debugSource) push(f._debugSource.fileName, f._debugSource.lineNumber, 'react');
				if (f._debugStack) fromStack(f._debugStack.stack);
				const t = f.type;
				if (typeof t === 'function' || (t && typeof t === 'object' && (t.render || t.type))) {
					const n = t.displayName || t.name || t.render?.name || t.type?.name;
					if (n && !/^(?:Anonymous|Fragment|Suspense|Provider|Consumer|Router|Layout(?:Router)?|InnerLayoutRouter|RenderFromTemplateContext|ScrollAndFocusHandler|ErrorBoundary.*|RedirectBoundary.*|NotFoundBoundary.*|LoadingBoundary|HotReload|AppRouter|ServerRoot|OuterLayoutRouter|Root)$/.test(n) && !source.components.includes(n)) source.components.push(n);
				}
				if (source.components.length >= 4 && source.files.length >= 2) break;
			}
		}
		// Vue, Svelte, Astro dev info
		for (let x = el, k = 0; x && k < 12; x = x.parentElement, k++) {
			const vc = x.__vueParentComponent;
			if (vc?.type?.__file) push(vc.type.__file, null, 'vue');
			if (vc?.type?.__name && !source.components.includes(vc.type.__name)) source.components.push(vc.type.__name);
			if (x.__svelte_meta?.loc) push(x.__svelte_meta.loc.file, x.__svelte_meta.loc.line, 'svelte');
			const af = x.getAttribute?.('data-astro-source-file');
			if (af) push(af, +(x.getAttribute('data-astro-source-loc') || '').split(':')[0] || null, 'astro');
			if (source.files.length >= 3) break;
		}
		const r = el.getBoundingClientRect();
		return {
			tag: el.tagName.toLowerCase(), id: el.id || null,
			classes: typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 12) : [],
			path: cssPath(el), text: (own || text).slice(0, 140), heading: heading.slice(0, 100),
			html: el.outerHTML.replace(/\s+/g, ' ').slice(0, 500),
			box: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), width: Math.round(r.width), height: Math.round(r.height) },
			page: location.pathname, source,
		};
	};
	start();
}

/** In the page: the design the person's site already has (their fonts, colours, radius, CSS variables). */
export function tokens() {
	const vars = {};
	const scan = (rules, depth = 0) => {
		for (const r of rules) {
			if (r.cssRules && depth < 4) scan(r.cssRules, depth + 1);
			if (!r.style || !/^(?::root|html|:host|\.dark|\[data-theme[^\]]*\]|body)\b/.test(r.selectorText || '')) continue;
			for (const p of r.style) if (p.startsWith('--') && Object.keys(vars).length < 120 && !/^--tw-/.test(p)) vars[p] = vars[p] ?? getComputedStyle(document.documentElement).getPropertyValue(p).trim() ?? r.style.getPropertyValue(p).trim();
		}
	};
	for (const s of document.styleSheets) { try { scan(s.cssRules); } catch {} }
	const cs = (el) => el && getComputedStyle(el);
	const body = cs(document.body);
	const h = document.querySelector('h1') || document.querySelector('h2');
	const btn = [...document.querySelectorAll('button, a')].find((b) => { const c = getComputedStyle(b); return c.backgroundColor !== 'rgba(0, 0, 0, 0)' && b.getBoundingClientRect().height >= 28 && b.getBoundingClientRect().height < 80; });
	const link = [...document.querySelectorAll('a')].find((a) => getComputedStyle(a).backgroundColor === 'rgba(0, 0, 0, 0)' && a.innerText.trim());
	const radii = {};
	for (const el of [...document.querySelectorAll('body *')].slice(0, 3000)) {
		const r = getComputedStyle(el).borderTopLeftRadius;
		if (r && r !== '0px' && !r.includes('%') && parseFloat(r) < 60) radii[r] = (radii[r] || 0) + 1;
	}
	const colors = {};
	for (const el of [...document.querySelectorAll('body *')].slice(0, 3000)) {
		const c = getComputedStyle(el);
		for (const v of [c.color, c.backgroundColor, c.borderTopColor]) if (v && v !== 'rgba(0, 0, 0, 0)') colors[v] = (colors[v] || 0) + 1;
	}
	const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
	return {
		body: body && { font: body.fontFamily, size: body.fontSize, lineHeight: body.lineHeight, color: body.color, background: body.backgroundColor !== 'rgba(0, 0, 0, 0)' ? body.backgroundColor : cs(document.documentElement).backgroundColor },
		heading: h && { font: cs(h).fontFamily, size: cs(h).fontSize, weight: cs(h).fontWeight, letterSpacing: cs(h).letterSpacing, lineHeight: cs(h).lineHeight, color: cs(h).color },
		button: btn && { text: btn.innerText.trim().slice(0, 40), background: cs(btn).backgroundColor, color: cs(btn).color, radius: cs(btn).borderTopLeftRadius, height: Math.round(btn.getBoundingClientRect().height) + 'px', padding: `${cs(btn).paddingTop} ${cs(btn).paddingRight}`, font: `${cs(btn).fontSize} ${cs(btn).fontWeight}`, shadow: cs(btn).boxShadow },
		link: link && { color: cs(link).color, decoration: cs(link).textDecorationLine },
		radii: top(radii, 5), colors: top(colors, 10), vars,
	};
}

/** Without their site running: the CSS variables and theme in their stylesheets. */
export function fileTokens(dir) {
	const files = ['src/app/globals.css', 'app/globals.css', 'src/styles/globals.css', 'styles/globals.css', 'src/index.css', 'src/app.css', 'src/styles.css', 'src/global.css', 'src/styles/global.css', 'assets/css/main.css', 'style.css', 'styles.css'];
	const vars = {};
	let fonts = [];
	for (const f of files) {
		const p = path.join(dir, f);
		if (!existsSync(p)) continue;
		const css = readFileSync(p, 'utf8');
		for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;}{]+);/g)) if (!vars[m[1]] && Object.keys(vars).length < 120 && !/^--tw-/.test(m[1])) vars[m[1]] = m[2].trim();
	}
	for (const f of ['src/app/layout.tsx', 'app/layout.tsx', 'src/app/layout.jsx', 'app/layout.jsx', 'src/pages/_app.tsx', 'pages/_app.tsx']) {
		const p = path.join(dir, f);
		if (existsSync(p)) fonts = [...readFileSync(p, 'utf8').matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]next\/font\/(?:google|local)['"]/g)].flatMap((m) => m[1].split(',').map((s) => s.trim().replace(/_/g, ' ')));
		if (fonts.length) break;
	}
	return Object.keys(vars).length || fonts.length ? { vars, fonts } : null;
}

const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'out', '.svelte-kit', '.nuxt', '.output', '.vercel', '.turbo', 'coverage', '.astro', 'public']);
const EXT = /\.(tsx|jsx|ts|js|vue|svelte|astro|html|mdx)$/;

/** The project files most likely to hold the spot: dev info first, then a search for its text, classes and component names. */
export function findSource(dir, at) {
	const out = [];
	for (const f of at.source?.files ?? []) {
		const rel = f.file.startsWith(dir) ? path.relative(dir, f.file) : f.file.replace(/^\/+/, '');
		if (existsSync(path.join(dir, rel))) out.push({ file: rel, line: f.line, why: `${f.via} dev info` });
	}
	const files = [];
	const walk = (d, depth = 0) => {
		if (depth > 8 || files.length > 4000) return;
		let names = [];
		try { names = readdirSync(d); } catch { return; }
		for (const n of names) {
			if (SKIP.has(n) || n.startsWith('.')) continue;
			const p = path.join(d, n);
			let st; try { st = statSync(p); } catch { continue; }
			if (st.isDirectory()) walk(p, depth + 1);
			else if (EXT.test(n) && st.size < 400_000 && !/\.(test|spec|d)\.[jt]sx?$/.test(n)) files.push(p);
		}
	};
	walk(dir);
	const phrases = [at.text, at.heading].map((t) => (t || '').trim().slice(0, 48)).filter((t) => t.length >= 4);
	const classes = (at.classes ?? []).filter((c) => c.length > 2 && !/^(?:flex|grid|block|hidden|relative|absolute|w-|h-|p[xytblr]?-|m[xytblr]?-|text-|bg-|gap-)/.test(c)).slice(0, 6);
	const comps = at.source?.components ?? [];
	const scored = [];
	for (const p of files) {
		let src;
		try { src = readFileSync(p, 'utf8'); } catch { continue; }
		let score = 0, line = null;
		const hit = (needle, w) => { const i = src.indexOf(needle); if (i < 0) return; score += w; if (line == null) line = src.slice(0, i).split('\n').length; };
		for (const t of phrases) hit(t, 6);
		if (at.id) hit(`id="${at.id}"`, 4);
		for (const c of classes) hit(c, 1);
		for (const c of comps.slice(0, 3)) { if (new RegExp(`(?:function|const|class)\\s+${c}\\b`).test(src)) { score += 5; const i = src.search(new RegExp(`(?:function|const|class)\\s+${c}\\b`)); if (line == null) line = src.slice(0, i).split('\n').length; } }
		if (score) scored.push({ file: path.relative(dir, p), line, score });
	}
	scored.sort((a, b) => b.score - a.score);
	for (const s of scored.slice(0, 3)) if (!out.some((o) => o.file === s.file)) out.push({ file: s.file, line: s.line, why: 'its text, classes or component name' });
	return out.slice(0, 4);
}
