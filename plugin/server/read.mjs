// Read a live page the way a front-end engineer would before cloning it: load it like a person (scroll it, let it
// settle), then measure everything (stack, tokens, type, every section's structure and exact copy, hover states,
// scroll reveals, the sticky header, keyframes, fonts, breakpoints) and photograph it at desktop, tablet and phone.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { goto, launch, pageSize, scrollThrough, shot, viewport, wait } from './chrome.mjs';
import { absolutise, fetchExternal, mine } from './css.mjs';
import * as inpage from './inpage.mjs';
import { stackOf } from './stack.mjs';

const hex = (c) => {
	const m = String(c ?? '').match(/rgba?\(([^)]+)\)/);
	if (!m) return c;
	const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
	const h = '#' + p.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
	return p.length > 3 && p[3] < 0.99 ? `${h} @${Math.round(p[3] * 100)}%` : h;
};
const tidy = (v) => String(v ?? '').replace(/rgba?\([^)]+\)/g, (m) => hex(m));

export const WIDTHS = { desktop: [1440, 900], tablet: [768, 1024], phone: [390, 844] };

/** Forced :hover on each interactive element (transitions frozen so the end state is read at once). */
async function hoverStates(page) {
	const items = await page.run(inpage.markInteractive);
	if (!items.length) return [];
	await page.eval(`(() => { const s = document.createElement('style'); s.id = 'sp-freeze'; s.textContent = '*,*::before,*::after{transition:none!important}'; document.head.appendChild(s); })()`);
	const { root } = await page.send('DOM.getDocument', { depth: 0 });
	const out = [];
	for (const it of items) {
		const sel = `[data-sp-hover="${it.i}"]`;
		try {
			const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
			if (!nodeId) continue;
			const base = await page.run(inpage.lookOf, sel);
			await page.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] });
			const hov = await page.run(inpage.lookOf, sel);
			await page.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
			const changes = [];
			base?.forEach((b, k) => {
				for (const p of Object.keys(b)) {
					if (hov?.[k] && b[p] !== hov[k][p]) changes.push(`${k === 0 ? '' : `child ${k}: `}${p.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())} ${tidy(b[p])} → ${tidy(hov[k][p])}`);
				}
			});
			if (changes.length) out.push({ el: it.el, text: it.text, transition: it.transition === 'all 0s ease 0s' ? null : it.transition, changes: changes.slice(0, 10) });
		} catch {}
	}
	await page.eval(`document.getElementById('sp-freeze')?.remove()`);
	return out;
}

/** exact.html: the rendered page with the site's own CSS inlined in cascade order. Its own sizes, positions and
 *  breakpoints, so it renders like the original at every width; only what scripts do after load is gone. */
async function exactPage(page, url) {
	const { html, sheets } = await page.run(inpage.exactShell, null, 120_000);
	const fetched = await fetchExternal(sheets.filter((s) => s.text == null && s.href).map((s) => s.href), url);
	const byHref = new Map(fetched.map((f) => [f.href, f.text]));
	return html.replace(/<style data-sp-fill="(\d+)"><\/style>/g, (all, k) => {
		const s = sheets[+k];
		if (!s || s.disabled) return '';
		let text = s.text ?? byHref.get(s.href) ?? '';
		text = absolutise(text, s.href || url).replace(/<\/style/gi, '<\\/style');
		return `<style>${s.media && s.media !== 'all' ? `@media ${s.media}{${text}}` : text}</style>`;
	});
}

/** Each section photographed in place (scrolled into view first, so scroll-driven states are live). */
async function sectionShots(page, sections, dir, pageW) {
	const files = [];
	for (const s of sections) {
		if (s.box.height < 24) continue;
		await page.eval(`window.scrollTo(0, ${Math.max(0, s.box.y - 80)})`);
		await wait(380);
		const scale = Math.min(1, 1100 / Math.max(1, s.box.width));
		const parts = Math.ceil(s.box.height / 2000);
		for (let k = 0; k < Math.min(parts, 4); k++) {
			const y = s.box.y + k * 2000, h = Math.min(2000, s.box.y + s.box.height - y);
			const jpeg = await shot(page, { x: 0, y, width: pageW, height: h, scale, quality: 80 }).catch(() => null);
			if (!jpeg) continue;
			const file = `section-${String(s.n).padStart(2, '0')}${parts > 1 ? `-${k + 1}` : ''}.jpg`;
			writeFileSync(path.join(dir, file), jpeg);
			files.push({ n: s.n, file, jpeg });
		}
	}
	await page.eval('window.scrollTo(0, 0)');
	return files;
}

async function fullShot(page, file, maxH = 16000) {
	const { width, height } = await pageSize(page);
	const h = Math.min(height, maxH);
	const jpeg = await shot(page, { width, height: h, scale: Math.min(1, 720 / width), quality: 78 }).catch(() => null);
	if (jpeg) writeFileSync(file, jpeg);
	return { jpeg, width, height, cut: height > maxH };
}

export async function read(url, outDir, { log = () => {} } = {}) {
	const shots = path.join(outDir, 'shots');
	mkdirSync(shots, { recursive: true });
	const [W, H] = WIDTHS.desktop;
	const { page, close } = await launch({ width: W, height: H });
	try {
		log('opening the page');
		const doc = await goto(page, url);
		if (await page.run(inpage.dismissConsent).catch(() => false)) await wait(600);
		const before = await page.run(inpage.beforeScroll);
		log('scrolling it like a person');
		await scrollThrough(page);
		await page.eval('window.scrollTo(0, Math.min(900, document.documentElement.scrollHeight))');
		await wait(600);
		const headerAfter = await page.run(inpage.headerScrolled);
		await page.eval('window.scrollTo(0, 0)');
		await wait(500);
		const reveals = await page.run(inpage.afterScroll, before.reveal);
		log('measuring');
		const data = await page.run(inpage.collect, null, 120_000);
		const hovers = await hoverStates(page);
		const external = await fetchExternal(data.css.external, data.url);
		const css = mine([...data.css.sheets, ...external]);
		const html = await exactPage(page, data.url);
		log('photographing');
		const desktop = await fullShot(page, path.join(shots, 'desktop-full.jpg'));
		const sections = await sectionShots(page, data.sections, shots, desktop.width);
		const views = { desktop: { width: W, pageHeight: desktop.height } };
		for (const name of ['tablet', 'phone']) {
			log(`at ${name} width`);
			const [w, h] = WIDTHS[name];
			await viewport(page, w, h, name === 'phone');
			await goto(page, data.url, { settle: 5000 });
			await page.run(inpage.dismissConsent).catch(() => false);
			await scrollThrough(page, { step: 0.9, pause: 150 });
			views[name] = await page.run(inpage.responsive);
			views[name].shot = (await fullShot(page, path.join(shots, `${name}-full.jpg`))).jpeg ? `shots/${name}-full.jpg` : null;
		}
		views.desktop = { ...views.desktop, ...(await (async () => { await viewport(page, W, H); await goto(page, data.url, { settle: 4000 }); return page.run(inpage.responsive); })()) };

		const headers = doc?.headers ?? {};
		const spec = {
			url: data.url, read: new Date().toISOString(), meta: data.meta,
			stack: stackOf(data.signals, headers), signals: data.signals,
			tokens: data.tokens, container: data.container, fixed: data.fixed,
			css: { families: css.families, fontFaces: css.fontFaces, keyframes: css.keyframes, breakpoints: css.breakpoints, vars: css.vars },
			header: before.header ? { atTop: before.header, scrolled: headerAfter } : null,
			reveals, hovers, views,
			sections: data.sections.map((s) => ({ ...s, shots: sections.filter((f) => f.n === s.n).map((f) => `shots/${f.file}`) })),
			assets: data.assets,
		};
		writeFileSync(path.join(outDir, 'spec.json'), JSON.stringify(spec, null, '\t'));
		writeFileSync(path.join(outDir, 'exact.html'), html);
		mkdirSync(path.join(outDir, 'css'), { recursive: true });
		[...data.css.sheets, ...external].filter((s) => s.text).forEach((s, i) => writeFileSync(path.join(outDir, 'css', `${String(i + 1).padStart(2, '0')}-${(s.href ? new URL(s.href).pathname.split('/').pop() : 'inline').replace(/\.css$/, '').replace(/[^\w.-]/g, '_').slice(0, 60) || 'sheet'}.css`), s.text));
		return { spec, sectionImages: sections, desktopImage: desktop.jpeg };
	} finally {
		close();
	}
}
