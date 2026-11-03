// Functions that run inside the page (Page.run serialises them, so each is self-contained: no outer variables).

/** Before scrolling: the opacity and transform of everything below the fold, and the header's look at the top. */
export function beforeScroll() {
	const els = [...document.querySelectorAll('h1,h2,h3,h4,p,img,picture,video,svg,li,a,button,section > *,article,[class*=card],[class*=Card],[class*=feature],[class*=item]')];
	const out = [];
	let i = 0;
	for (const el of els) {
		const r = el.getBoundingClientRect();
		if (r.top < innerHeight || r.width < 8 || r.height < 8) continue;
		const cs = getComputedStyle(el);
		el.setAttribute('data-sp-r', String(i));
		out.push({ i, opacity: +cs.opacity, transform: cs.transform, filter: cs.filter, clip: cs.clipPath });
		if (++i >= 300) break;
	}
	const header = [...document.querySelectorAll('header, nav, [class*=header], [class*=navbar]')].find((h) => {
		const cs = getComputedStyle(h);
		return (cs.position === 'fixed' || cs.position === 'sticky') && h.getBoundingClientRect().top <= 1;
	});
	if (header) header.setAttribute('data-sp-header', '1');
	const look = (h) => { const cs = getComputedStyle(h), r = h.getBoundingClientRect(); return { bg: cs.backgroundColor, shadow: cs.boxShadow, blur: cs.backdropFilter, height: Math.round(r.height), border: cs.borderBottom, color: cs.color, top: Math.round(r.top) }; };
	return { reveal: out, header: header ? look(header) : null };
}

/** The header's look once scrolled. */
export function headerScrolled() {
	const h = document.querySelector('[data-sp-header]');
	if (!h) return null;
	const cs = getComputedStyle(h), r = h.getBoundingClientRect();
	return { bg: cs.backgroundColor, shadow: cs.boxShadow, blur: cs.backdropFilter, height: Math.round(r.height), border: cs.borderBottom, color: cs.color, top: Math.round(r.top) };
}

/** After the scroll pass: what changed on the elements recorded before (scroll reveals). */
export function afterScroll(before) {
	const out = [];
	for (const b of before) {
		const el = document.querySelector(`[data-sp-r="${b.i}"]`);
		if (!el) continue;
		const cs = getComputedStyle(el);
		const now = { opacity: +cs.opacity, transform: cs.transform, filter: cs.filter, clip: cs.clipPath };
		const changed = Math.abs(now.opacity - b.opacity) > 0.2 || now.transform !== b.transform || now.filter !== b.filter || now.clip !== b.clip;
		if (!changed) continue;
		out.push({
			el: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
			from: b, to: now, transition: cs.transition, animation: cs.animationName !== 'none' ? `${cs.animationName} ${cs.animationDuration} ${cs.animationTimingFunction}` : null,
		});
	}
	return out;
}

/** Everything about the page that the build needs: stack fingerprints, tokens, sections, assets, CSS. */
export function collect() {
	const W = innerWidth;
	const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META', 'HEAD', 'TITLE', 'BR', 'WBR']);
	const hexOf = (c) => {
		const m = String(c).match(/rgba?\(([^)]+)\)/);
		if (!m) return null;
		const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
		const a = p.length > 3 ? p[3] : 1;
		if (a < 0.02) return null;
		const h = '#' + p.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
		return a < 0.99 ? `${h} @${Math.round(a * 100)}%` : h;
	};
	const visible = (el, cs, r) => r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.01;
	const bump = (map, key, n, extra) => {
		if (!key) return;
		const v = map.get(key) ?? { n: 0, ...extra };
		v.n += n;
		map.set(key, v);
	};
	const colours = { text: new Map(), bg: new Map(), border: new Map() };
	const type = new Map(), radii = new Map(), shadows = new Map(), gradients = new Map(), spacing = new Map(), blurs = new Map(), transitions = new Map(), animations = new Map(), fontsUsed = new Map();
	const all = [...document.body.querySelectorAll('*')].filter((e) => !SKIP.has(e.tagName));
	const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
	for (const el of all) {
		const cs = getComputedStyle(el), r = el.getBoundingClientRect();
		if (!visible(el, cs, r)) continue;
		const area = Math.min(r.width * r.height, W * 2000);
		bump(colours.bg, hexOf(cs.backgroundColor), area);
		if (cs.borderTopWidth !== '0px' && cs.borderTopStyle !== 'none') bump(colours.border, hexOf(cs.borderTopColor), 1);
		if (cs.backgroundImage.includes('gradient')) bump(gradients, cs.backgroundImage.slice(0, 300), 1);
		if (cs.borderRadius !== '0px') bump(radii, cs.borderRadius, 1);
		if (cs.boxShadow !== 'none') bump(shadows, cs.boxShadow.slice(0, 240), 1);
		if (cs.backdropFilter && cs.backdropFilter !== 'none') bump(blurs, `backdrop-filter: ${cs.backdropFilter}`, 1);
		if (cs.filter !== 'none') bump(blurs, `filter: ${cs.filter}`, 1);
		if (cs.transitionDuration !== '0s' && cs.transitionProperty !== 'none') bump(transitions, `${cs.transitionProperty} ${cs.transitionDuration} ${cs.transitionTimingFunction}`.slice(0, 200), 1);
		if (cs.animationName !== 'none') bump(animations, `${cs.animationName} ${cs.animationDuration} ${cs.animationTimingFunction} ${cs.animationIterationCount}`, 1);
		for (const p of ['paddingTop', 'paddingLeft', 'marginTop', 'marginBottom', 'rowGap', 'columnGap']) {
			const v = parseFloat(cs[p]);
			if (v > 0 && v < 400) bump(spacing, Math.round(v), 1);
		}
		const t = ownText(el);
		if (t) {
			bump(colours.text, hexOf(cs.color), t.length);
			const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
			bump(fontsUsed, fam, t.length);
			const key = `${fam}|${cs.fontSize}|${cs.fontWeight}|${cs.lineHeight}|${cs.letterSpacing}|${cs.textTransform}|${cs.fontStyle}`;
			const v = type.get(key) ?? { n: 0, tags: new Set(), sample: t.slice(0, 60), colour: hexOf(cs.color) };
			v.n += t.length;
			v.tags.add(el.tagName.toLowerCase());
			type.set(key, v);
		}
	}
	const top = (map, k = 12) => [...map.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, k);

	// ── stack fingerprints ──
	const html = document.documentElement;
	const scripts = [...document.scripts].map((s) => s.src).filter(Boolean);
	const has = (sel) => !!document.querySelector(sel);
	const classes = all.slice(0, 4000).flatMap((e) => (typeof e.className === 'string' ? e.className.split(/\s+/) : [])).filter(Boolean);
	const twLike = classes.filter((c) => /^(?:[a-z]+:)*-?(?:p|px|py|pt|pb|m|mx|my|mt|mb|gap|w|h|text|bg|rounded|flex|grid|items|justify|font|leading|tracking|border|shadow|max-w|min-h|space-[xy]|col-span|inset|top|left|z|opacity|translate|scale)-[\w./[\]#%-]+$/.test(c)).length;
	const signals = {
		generator: document.querySelector('meta[name=generator]')?.content ?? null,
		next: !!window.__NEXT_DATA__ || has('#__next') || scripts.some((s) => s.includes('/_next/')) || !!window.next,
		nextApp: !!window.__next_f || scripts.some((s) => /\/_next\/static\/chunks\/app\//.test(s)),
		nuxt: !!window.__NUXT__ || has('#__nuxt') || scripts.some((s) => s.includes('/_nuxt/')),
		gatsby: !!window.___gatsby || has('#___gatsby'),
		astro: has('astro-island') || has('[data-astro-cid]') || [...document.querySelectorAll('*')].slice(0, 2000).some((e) => [...e.attributes].some((a) => a.name.startsWith('data-astro-cid'))),
		sveltekit: !!window.__sveltekit || has('[data-sveltekit-preload-data]') || scripts.some((s) => s.includes('/_app/immutable/')),
		svelte: classes.some((c) => /^svelte-[a-z0-9]+$/.test(c)),
		remix: !!window.__remixContext || !!window.__reactRouterContext,
		react: !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers?.size || has('[data-reactroot]') || [...document.querySelectorAll('body *')].slice(0, 300).some((e) => Object.keys(e).some((k) => k.startsWith('__react'))),
		vue: !!window.__VUE__ || has('[data-v-app]') || [...document.querySelectorAll('*')].slice(0, 1500).some((e) => [...e.attributes].some((a) => a.name.startsWith('data-v-'))),
		angular: has('[ng-version]'),
		angularVersion: document.querySelector('[ng-version]')?.getAttribute('ng-version') ?? null,
		solid: !!window._$HY,
		qwik: has('[q\\:container]'),
		webflow: has('html[data-wf-site]') || has('[data-wf-page]'),
		framer: has('[data-framer-name]') || has('[data-framer-component-type]') || scripts.some((s) => s.includes('framerusercontent.com')),
		wix: !!window.wixBiSession || scripts.some((s) => s.includes('parastorage.com')),
		squarespace: !!window.Static?.SQUARESPACE_CONTEXT,
		shopify: !!window.Shopify,
		wordpress: scripts.some((s) => s.includes('/wp-content/') || s.includes('/wp-includes/')) || has('link[href*="/wp-content/"]'),
		hugoJekyll: /hugo|jekyll|eleventy/i.test(document.querySelector('meta[name=generator]')?.content ?? ''),
		alpine: has('[x-data]'), htmx: has('[hx-get],[hx-post]'), jquery: !!window.jQuery,
		tailwind: twLike > 40 || [...document.styleSheets].some((s) => { try { return [...s.cssRules].slice(0, 400).some((r) => r.cssText.includes('--tw-')); } catch { return false; } }),
		tailwindHits: twLike,
		styledComponents: has('style[data-styled]') || classes.some((c) => /^sc-[a-zA-Z]+$/.test(c)),
		emotion: has('style[data-emotion]'),
		cssModules: classes.filter((c) => /^[A-Za-z][\w-]*_[\w-]+__[A-Za-z0-9_-]{5}$/.test(c)).length > 5,
		bootstrap: classes.includes('container') && classes.some((c) => /^col-(sm|md|lg)-\d+$/.test(c)),
		chakra: classes.some((c) => c.startsWith('chakra-')), mui: classes.some((c) => c.startsWith('Mui')),
		radix: has('[data-radix-collection-item]') || has('[data-state][data-radix-popper-content-wrapper]'),
		shadcn: has('[data-slot]') || classes.some((c) => c === 'ring-offset-background'),
		gsap: !!window.gsap || !!window.TweenMax, scrollTrigger: !!window.ScrollTrigger,
		framerMotion: has('[data-projection-id]') || scripts.some((s) => /framer-motion|motion\.dev/.test(s)),
		lenis: html.classList.contains('lenis') || !!window.lenis || !!window.Lenis,
		locomotive: html.classList.contains('has-scroll-smooth') || has('[data-scroll-container]'),
		lottie: has('lottie-player') || has('dotlottie-player') || !!window.lottie || !!window.bodymovin,
		three: !!window.THREE || !!window.__THREE__,
		webgl: [...document.querySelectorAll('canvas')].some((c) => { try { return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }),
		spline: has('spline-viewer') || scripts.some((s) => s.includes('spline')),
		rive: scripts.some((s) => s.includes('rive')),
		swiper: has('.swiper'), splide: has('.splide'),
		typekit: has('link[href*="use.typekit.net"]'), googleFonts: has('link[href*="fonts.googleapis.com"]') || has('link[href*="fonts.gstatic.com"]'),
		vercelAnalytics: scripts.some((s) => s.includes('/_vercel/insights')),
		scripts: scripts.slice(0, 40).map((s) => s.slice(0, 160)),
	};

	// ── CSS the page holds (CSS-in-JS included: rules inserted with insertRule have no text anywhere else) ──
	const sheets = [], external = [];
	for (const s of document.styleSheets) {
		try {
			const text = [...s.cssRules].map((r) => r.cssText).join('\n');
			sheets.push({ href: s.href, text: text.slice(0, 1_500_000) });
		} catch {
			if (s.href) external.push(s.href);
		}
	}
	const rootVars = [];
	const rcs = getComputedStyle(html);
	for (let i = 0; i < rcs.length; i++) if (rcs[i].startsWith('--')) rootVars.push([rcs[i], rcs.getPropertyValue(rcs[i]).trim()]);

	// ── sections, top to bottom ──
	const big = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return visible(el, cs, r) && r.height >= 24; };
	let root = document.body;
	for (let k = 0; k < 8; k++) {
		const kids = [...root.children].filter((c) => !SKIP.has(c.tagName) && big(c));
		const rh = root.getBoundingClientRect().height || 1;
		if (kids.length === 1 && kids[0].getBoundingClientRect().height > rh * 0.6) root = kids[0];
		else break;
	}
	// a block much taller than the screen is a wrapper: split it into its children (they stack and fill most of it)
	const split = (b, depth) => {
		const r = b.getBoundingClientRect();
		if (depth > 6 || (r.height <= innerHeight * 1.4 && b.tagName !== 'MAIN')) return [b];
		const kids = [...b.children].filter((c) => !SKIP.has(c.tagName) && big(c));
		if (kids.length === 1) return kids[0].getBoundingClientRect().height > r.height * 0.5 ? split(kids[0], depth + 1) : [b];
		if (kids.length < 2) return [b];
		const stacked = kids.reduce((a, c) => a + c.getBoundingClientRect().height, 0);
		const side = kids.some((c, k) => k && Math.abs(c.getBoundingClientRect().top - kids[k - 1].getBoundingClientRect().top) < 4);
		return stacked > r.height * 0.6 && !side ? kids.flatMap((c) => split(c, depth + 1)) : [b];
	};
	const blocks = [...root.children].filter((c) => !SKIP.has(c.tagName) && big(c)).flatMap((b) => split(b, 0)).slice(0, 40);
	// a fixed or sticky bar across the top (the nav) is a section of its own, first, even when it lives elsewhere in the DOM
	const bar = all.find((e) => { const cs = getComputedStyle(e), r = e.getBoundingClientRect(); return (cs.position === 'fixed' || cs.position === 'sticky') && r.top <= 1 && r.width >= W * 0.9 && r.height >= 30 && r.height <= 200; });
	if (bar && !blocks.some((b) => b === bar || b.contains(bar) || bar.contains(b))) blocks.unshift(bar);
	const sy = scrollY;
	const sel = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '');

	// compact outline: tag.class [key styles] "text"
	const outline = (el, depth, budget) => {
		const lines = [];
		const walk = (e, d, parentCs) => {
			if (budget.n <= 0 || d > depth) return;
			const cs = getComputedStyle(e), r = e.getBoundingClientRect();
			if (!visible(e, cs, r) && e.tagName !== 'svg') return;
			const st = [];
			const tag = e.tagName.toLowerCase();
			if (cs.display.includes('flex')) st.push(`flex ${cs.flexDirection}${cs.flexWrap === 'wrap' ? ' wrap' : ''}${cs.justifyContent !== 'normal' && cs.justifyContent !== 'flex-start' ? ' justify-' + cs.justifyContent : ''}${cs.alignItems !== 'normal' && cs.alignItems !== 'stretch' ? ' items-' + cs.alignItems : ''}${cs.gap !== 'normal' ? ' gap ' + cs.gap : ''}`);
			if (cs.display.includes('grid')) st.push(`grid cols(${cs.gridTemplateColumns.split(' ').length}: ${cs.gridTemplateColumns.slice(0, 60)})${cs.gap !== 'normal' ? ' gap ' + cs.gap : ''}`);
			if (cs.position !== 'static') st.push(cs.position);
			st.push(`${Math.round(r.width)}×${Math.round(r.height)}`);
			if (cs.maxWidth !== 'none') st.push(`max-w ${cs.maxWidth}`);
			const pad = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft];
			if (pad.some((p) => p !== '0px')) st.push(`p ${pad.join(' ')}`);
			const bg = hexOf(cs.backgroundColor);
			if (bg && bg !== hexOf(parentCs?.backgroundColor)) st.push(`bg ${bg}`);
			if (cs.backgroundImage !== 'none') st.push(`bg-image ${cs.backgroundImage.slice(0, 120)}`);
			if (cs.borderTopWidth !== '0px' && cs.borderTopStyle !== 'none') st.push(`border ${cs.borderTopWidth} ${hexOf(cs.borderTopColor)}`);
			if (cs.borderRadius !== '0px') st.push(`radius ${cs.borderRadius}`);
			if (cs.boxShadow !== 'none') st.push(`shadow ${cs.boxShadow.slice(0, 90)}`);
			if (cs.backdropFilter && cs.backdropFilter !== 'none') st.push(`backdrop ${cs.backdropFilter}`);
			if (cs.opacity !== '1') st.push(`opacity ${cs.opacity}`);
			if (cs.transform !== 'none') st.push(`transform ${cs.transform.slice(0, 60)}`);
			if (cs.overflow !== 'visible') st.push(`overflow ${cs.overflow}`);
			const t = ownText(e);
			const font = `${cs.fontFamily.split(',')[0].replace(/["']/g, '')} ${cs.fontSize}/${cs.lineHeight} ${cs.fontWeight}${cs.letterSpacing !== 'normal' ? ' ls ' + cs.letterSpacing : ''}${cs.textTransform !== 'none' ? ' ' + cs.textTransform : ''}`;
			if (t && (!parentCs || font !== parentCs.__font)) st.push(`font ${font}`);
			const col = hexOf(cs.color);
			if (t && col !== hexOf(parentCs?.color)) st.push(`color ${col}`);
			let label = tag + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
			if (tag === 'img') label += ` src=${(e.currentSrc || e.src).slice(0, 120)} alt="${(e.alt || '').slice(0, 60)}"`;
			if (tag === 'a' && e.getAttribute('href')) label += ` href=${e.getAttribute('href').slice(0, 80)}`;
			if (tag === 'video') label += ` src=${(e.currentSrc || e.querySelector('source')?.src || '').slice(0, 120)}${e.autoplay ? ' autoplay' : ''}${e.loop ? ' loop' : ''}${e.muted ? ' muted' : ''}`;
			lines.push(`${'  '.repeat(d)}${label} [${st.join('; ')}]${t ? ` "${t.slice(0, 140)}"` : ''}`);
			budget.n--;
			if (tag === 'svg') return;
			cs.__font = font;
			const kids = [...e.children].filter((c) => !SKIP.has(c.tagName));
			// runs of siblings with the same signature: show two, count the rest
			let k = 0;
			while (k < kids.length) {
				const sig = (c) => c.tagName + '|' + (typeof c.className === 'string' ? c.className : '');
				let j = k + 1;
				while (j < kids.length && sig(kids[j]) === sig(kids[k])) j++;
				const run = j - k;
				walk(kids[k], d + 1, cs);
				if (run > 1) walk(kids[k + 1], d + 1, cs);
				if (run > 2) lines.push(`${'  '.repeat(d + 1)}… ×${run - 2} more like it`);
				k = j;
			}
		};
		walk(el, 0, null);
		return lines.join('\n');
	};

	const sections = blocks.map((b, i) => {
		const r = b.getBoundingClientRect(), cs = getComputedStyle(b);
		b.setAttribute('data-sp-section', String(i + 1));
		return {
			n: i + 1, selector: sel(b), tag: b.tagName.toLowerCase(),
			box: { x: Math.round(r.left), y: Math.round(r.top + sy), width: Math.round(r.width), height: Math.round(r.height) },
			background: hexOf(cs.backgroundColor), backgroundImage: cs.backgroundImage !== 'none' ? cs.backgroundImage.slice(0, 300) : null,
			headings: [...b.querySelectorAll('h1,h2,h3')].slice(0, 6).map((h) => h.innerText.trim().replace(/\s+/g, ' ').slice(0, 140)),
			text: (b.innerText || '').trim().replace(/\n{2,}/g, '\n').slice(0, 1500),
			outline: outline(b, 9, { n: 140 }),
		};
	});

	// ── assets ──
	const abs = (u) => { try { return new URL(u, location.href).href; } catch { return u; } };
	const images = [...document.images].filter((im) => im.getBoundingClientRect().width > 0).slice(0, 80).map((im) => ({ src: abs(im.currentSrc || im.src), alt: im.alt || '', width: Math.round(im.getBoundingClientRect().width), height: Math.round(im.getBoundingClientRect().height), natural: `${im.naturalWidth}×${im.naturalHeight}` }));
	const bgImages = [...new Set(all.map((e) => getComputedStyle(e).backgroundImage).filter((b) => b.includes('url(')).flatMap((b) => [...b.matchAll(/url\("?([^")]+)"?\)/g)].map((m) => m[1])))].slice(0, 40);
	const svgs = [...document.querySelectorAll('svg')].filter((s) => s.getBoundingClientRect().width > 0).slice(0, 60).map((s) => ({ size: `${Math.round(s.getBoundingClientRect().width)}×${Math.round(s.getBoundingClientRect().height)}`, markup: s.outerHTML.length < 6000 ? s.outerHTML : s.outerHTML.slice(0, 6000) + '<!-- cut -->' }));
	const videos = [...document.querySelectorAll('video')].map((v) => ({ src: abs(v.currentSrc || v.querySelector('source')?.src || ''), poster: v.poster ? abs(v.poster) : null, autoplay: v.autoplay, loop: v.loop, muted: v.muted }));
	const icons = [...document.querySelectorAll('link[rel*=icon]')].map((l) => abs(l.href));
	const meta = {
		title: document.title, lang: html.lang || null,
		description: document.querySelector('meta[name=description]')?.content ?? null,
		ogImage: document.querySelector('meta[property="og:image"]')?.content ?? null,
		themeColor: document.querySelector('meta[name=theme-color]')?.content ?? null,
		colorScheme: getComputedStyle(html).colorScheme,
		smoothScroll: getComputedStyle(html).scrollBehavior,
		pageBackground: hexOf(getComputedStyle(document.body).backgroundColor) ?? hexOf(getComputedStyle(html).backgroundColor) ?? '#ffffff',
		bodyFont: getComputedStyle(document.body).fontFamily,
	};
	const fixed = all.filter((e) => { const cs = getComputedStyle(e); return (cs.position === 'fixed' || cs.position === 'sticky') && e.getBoundingClientRect().height > 0; }).slice(0, 10).map((e) => ({ el: sel(e), position: getComputedStyle(e).position, z: getComputedStyle(e).zIndex, box: (() => { const r = e.getBoundingClientRect(); return `${Math.round(r.width)}×${Math.round(r.height)} at ${Math.round(r.left)},${Math.round(r.top)}`; })() }));
	const container = (() => {
		const widths = new Map();
		for (const e of all) { const cs = getComputedStyle(e); if (cs.maxWidth !== 'none' && cs.maxWidth.endsWith('px') && cs.marginLeft === cs.marginRight && parseFloat(cs.marginLeft) > 0) bump(widths, cs.maxWidth, 1); }
		return top(widths, 3).map(([w, v]) => `${w} (×${v.n})`);
	})();

	return {
		url: location.href, viewport: W, meta, signals, sections, container, fixed,
		tokens: {
			text: top(colours.text, 10).map(([c, v]) => ({ colour: c, weight: Math.round(v.n) })),
			background: top(colours.bg, 10).map(([c, v]) => ({ colour: c, weight: Math.round(v.n) })),
			border: top(colours.border, 6).map(([c, v]) => ({ colour: c, count: v.n })),
			type: top(type, 16).map(([k, v]) => { const [family, size, weight, lineHeight, letterSpacing, transform, style] = k.split('|'); return { family, size, weight, lineHeight, letterSpacing, transform, style, tags: [...v.tags].join(','), sample: v.sample, colour: v.colour, chars: v.n }; }),
			fonts: top(fontsUsed, 6).map(([f, v]) => ({ family: f, chars: v.n })),
			radii: top(radii, 8).map(([r, v]) => `${r} (×${v.n})`),
			shadows: top(shadows, 8).map(([s, v]) => `${s} (×${v.n})`),
			gradients: top(gradients, 8).map(([g, v]) => `${g} (×${v.n})`),
			blurs: top(blurs, 6).map(([b, v]) => `${b} (×${v.n})`),
			spacing: top(spacing, 14).map(([s, v]) => s).sort((a, b) => a - b),
			transitions: top(transitions, 10).map(([t, v]) => `${t} (×${v.n})`),
			animations: top(animations, 10).map(([a, v]) => `${a} (×${v.n})`),
			rootVars: rootVars.slice(0, 200),
		},
		assets: { images, bgImages: bgImages.map(abs), svgs, videos, icons },
		css: { sheets, external },
	};
}

/** Interactive elements: mark them and return their resting look (for hover diffs). */
export function markInteractive() {
	const els = [...document.querySelectorAll('a, button, [role=button], input[type=submit], [class*=btn], [class*=Button], [class*=card], [class*=Card]')]
		.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 16 && r.height > 12 && r.top + scrollY < 12000; });
	const seen = new Set(), out = [];
	for (const e of els) {
		const sig = e.tagName + '|' + (typeof e.className === 'string' ? e.className : '') + '|' + (e.innerText || '').trim().slice(0, 20);
		if (seen.has(sig)) continue;
		seen.add(sig);
		e.setAttribute('data-sp-hover', String(out.length));
		out.push({ i: out.length, el: e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''), text: (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50), transition: getComputedStyle(e).transition });
		if (out.length >= 36) break;
	}
	return out;
}

/** The look of an element and its first descendants (the properties hover usually changes). */
export function lookOf(sel) {
	const P = ['color', 'backgroundColor', 'backgroundImage', 'borderColor', 'boxShadow', 'transform', 'opacity', 'textDecorationLine', 'filter', 'scale', 'translate', 'rotate', 'outlineColor', 'outlineWidth', 'width', 'letterSpacing', 'gap', 'paddingLeft', 'fill', 'stroke'];
	const el = document.querySelector(sel);
	if (!el) return null;
	const nodes = [el, ...[...el.querySelectorAll('*')].slice(0, 14)];
	return nodes.map((n) => { const cs = getComputedStyle(n); const o = {}; for (const p of P) o[p] = cs[p]; return o; });
}

/** How the page changes at a narrower width: the headline size, the menu, the grids. */
export function responsive() {
	const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.01; };
	const h1 = [...document.querySelectorAll('h1')].find(vis);
	const header = document.querySelector('header') || document.querySelector('nav');
	const links = header ? [...header.querySelectorAll('a')].filter(vis).length : 0;
	const burger = header ? [...header.querySelectorAll('button, [role=button]')].find((b) => vis(b) && (/menu|nav|open/i.test((b.getAttribute('aria-label') || '') + (b.className || '')) || (!b.innerText.trim() && b.querySelector('svg,span,div')))) : null;
	const grids = [...document.querySelectorAll('*')].filter((e) => vis(e) && getComputedStyle(e).display.includes('grid')).map((e) => getComputedStyle(e).gridTemplateColumns.split(' ').length);
	const flexRows = [...document.querySelectorAll('*')].filter((e) => vis(e) && getComputedStyle(e).display.includes('flex') && getComputedStyle(e).flexDirection === 'row' && e.children.length >= 3).length;
	return {
		width: innerWidth,
		pageHeight: document.documentElement.scrollHeight,
		h1: h1 ? { size: getComputedStyle(h1).fontSize, lineHeight: getComputedStyle(h1).lineHeight } : null,
		body: getComputedStyle(document.body).fontSize,
		headerLinks: links,
		menuButton: !!burger,
		maxGridColumns: grids.length ? Math.max(...grids) : 0,
		flexRows,
	};
}

/** Click away cookie and consent banners so they don't sit on every screenshot. */
export function dismissConsent() {
	const words = /^(accept( all)?( cookies)?|allow( all)?( cookies)?|agree|i agree|got it|ok(ay)?|accept and continue|alle akzeptieren|tout accepter|aceptar( todo)?)$/i;
	const scope = [...document.querySelectorAll('[id*=cookie i],[class*=cookie i],[id*=consent i],[class*=consent i],[id*=gdpr i],[class*=gdpr i],[aria-label*=cookie i],[role=dialog]')];
	const buttons = (scope.length ? scope : [document]).flatMap((s) => [...s.querySelectorAll('button, a, [role=button]')]);
	const b = buttons.find((x) => words.test((x.innerText || '').trim()));
	if (b) { b.click(); return true; }
	return false;
}

/** The page as rendered, ready to stand alone: scripts out, a <base> so every URL resolves, and a placeholder for
 *  each stylesheet in its cascade order (Node fills them, cross-origin ones fetched). */
export function exactShell() {
	const sheets = [];
	const all = [...document.styleSheets, ...(document.adoptedStyleSheets ?? [])];
	all.forEach((s, k) => {
		let text = null;
		try { text = [...s.cssRules].map((r) => r.cssText).join('\n'); } catch {}
		sheets.push({ k, href: s.href, media: s.media?.mediaText || '', text, disabled: !!s.disabled });
		const owner = s.ownerNode;
		if (owner && owner.nodeType === 1) owner.setAttribute('data-sp-sheet', String(k));
	});
	const d = document.documentElement.cloneNode(true);
	d.querySelectorAll('script, noscript, link[rel=preload], link[rel=modulepreload], link[rel=prefetch], base, meta[http-equiv]').forEach((e) => e.remove());
	d.querySelectorAll('link[rel=stylesheet], style').forEach((e) => {
		const k = e.getAttribute('data-sp-sheet');
		if (k === null) return e.remove();
		const ph = document.createElement('style');
		ph.setAttribute('data-sp-fill', k);
		e.replaceWith(ph);
	});
	document.querySelectorAll('[data-sp-sheet]').forEach((e) => e.removeAttribute('data-sp-sheet'));
	const head = d.querySelector('head');
	const base = document.createElement('base');
	base.href = location.href;
	head.prepend(base);
	// adopted sheets have no node: they go last, as they cascade
	for (const s of sheets) if (!d.querySelector(`[data-sp-fill="${s.k}"]`)) { const ph = document.createElement('style'); ph.setAttribute('data-sp-fill', String(s.k)); head.appendChild(ph); }
	// what scripts would have done on load is already in the DOM; lazy media keeps what loaded
	d.querySelectorAll('img').forEach((im, i) => { const o = document.images[i]; if (o && o.currentSrc && !im.getAttribute('src')) im.setAttribute('src', o.currentSrc); im.removeAttribute('loading'); });
	d.querySelectorAll('[data-sp-r],[data-sp-hover],[data-sp-section],[data-sp-header]').forEach((e) => { for (const a of ['data-sp-r', 'data-sp-hover', 'data-sp-section', 'data-sp-header']) e.removeAttribute(a); });
	return { html: '<!doctype html>\n' + d.outerHTML, sheets };
}
