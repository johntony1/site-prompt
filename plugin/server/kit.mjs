// The kit both sides use, the person's page and the server: what each element of a pick paints and the effects on it,
// how the parts group into layers a person would name (a card, its art, its text), the layer names and the spec
// rows of each layer's card. One self-contained function, so the page gets it with toString().

export function spKit() {
	/** Every element under root that paints something, with what it paints and its effects. idxOf(el) → its number. */
	function anatomyOf(root, idxOf, region = null) {
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
			// the shapes inside a drawing paint with fill and stroke
			if (el.namespaceURI === 'http://www.w3.org/2000/svg' && /^(path|line|polyline|polygon|circle|ellipse|rect|text|use|image)$/.test(t)) {
				if (cs.stroke !== 'none' && !clear(cs.stroke) && parseFloat(cs.strokeWidth) > 0 && parseFloat(cs.strokeOpacity ?? 1) > 0) p.push({ k: 'stroke', v: `${cs.strokeWidth} ${cs.stroke}${cs.strokeDasharray !== 'none' ? `, dashed ${cs.strokeDasharray}` : ''}` });
				if (cs.fill !== 'none' && !clear(cs.fill) && parseFloat(cs.fillOpacity ?? 1) > 0 && t !== 'line') p.push({ k: 'vfill', v: cs.fill });
				if (t === 'text' && el.textContent.trim()) p.push({ k: 'text', v: el.textContent.trim().slice(0, 80) });
			}
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
	const nodes = [root, ...root.querySelectorAll('*')].filter((e) => idxOf(e) != null);
	const opOf = new Map(), clipOf = new Map();
	const rootClips = true; // what lies outside the picked box is not part of what they picked (clipped or masked away)
	const index = new Map(nodes.map((e) => [e, idxOf(e)]));
	let lo = { x: R.left, y: R.top, r: R.right, b: R.bottom };
	const out = nodes.map((el) => {
		const i = index.get(el);
		const cs = getComputedStyle(el), r = el.getBoundingClientRect();
		const op = (el === root ? 1 : (opOf.get(el.parentElement) ?? 1)) * (parseFloat(cs.opacity) || 0);
		opOf.set(el, op);
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
			i, p: index.get(el.parentElement) ?? null, tag: el.tagName.toLowerCase(), depth, alt: el.getAttribute('alt') || el.getAttribute('aria-label') || '',
			box: (() => {
				// what can be seen of it: cut by every frame above it that clips (and by the pick itself when it clips)
				const c = el === root ? (region ? { x0: region.x, y0: region.y, x1: region.x + region.w, y1: region.y + region.h } : rootClips ? { x0: 0, y0: 0, x1: R.width, y1: R.height } : { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 }) : (clipOf.get(el.parentElement) ?? { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 });
				const own = { x0: r.left - R.left, y0: r.top - R.top, x1: r.right - R.left, y1: r.bottom - R.top };
				clipOf.set(el, cs.overflow !== 'visible' || cs.overflowX !== 'visible' ? { x0: Math.max(c.x0, own.x0), y0: Math.max(c.y0, own.y0), x1: Math.min(c.x1, own.x1), y1: Math.min(c.y1, own.y1) } : c);
				const x0 = Math.max(c.x0, own.x0), y0 = Math.max(c.y0, own.y0), x1 = Math.min(c.x1, own.x1), y1 = Math.min(c.y1, own.y1);
				return { x: Math.round(x0), y: Math.round(y0), w: Math.max(0, Math.round(x1 - x0)), h: Math.max(0, Math.round(y1 - y0)) };
			})(),
			op: Math.round(op * 100) / 100,
			raw: { w: Math.round(r.width), h: Math.round(r.height) },
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

	const slugOf = (t) => String(t).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'layer';
	const colorOf = (g) => (g.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/gi) ?? []);

	/** The spec rows of a layer's card: what it is made of, in the words a designer would use. */
	function specsOf(n, motion) {
		const rows = [];
		const add = (k, v, sw) => rows.push(sw ? { k, v, sw } : { k, v });
		add('Size', `${n.box.w} × ${n.box.h}`);
		const paints = [...n.paint.map((p) => ({ ...p, ps: '' })), ...Object.entries(n.pseudos).flatMap(([ps, v]) => v.paint.map((p) => ({ ...p, ps })))];
		for (const p of paints) {
			const via = p.ps ? ` (${p.ps})` : '';
			if (p.k === 'fill') add(`Fill${via}`, p.v.replace(/\s+/g, ''), p.v);
			if (p.k === 'gradient') add(`Gradient${via}`, `${/radial/.test(p.v) ? 'radial' : /conic/.test(p.v) ? 'conic' : 'linear'}, ${colorOf(p.v).length} stops`, p.v);
			if (p.k === 'border') add(`Stroke${via}`, p.v.replace(/ solid/, ''), p.v.match(/rgba?\([^)]*\)/)?.[0]);
			if (p.k === 'shadow') {
				const inner = p.v.filter((x) => /inset/.test(x)), outer = p.v.filter((x) => !/inset/.test(x));
				if (outer.length) add(`Shadow${via}`, `${outer.length > 1 ? `${outer.length} stacked, ` : ''}blur ${outer.map(blurOf).join(' / ')}px`);
				if (inner.length) add(`Inner edge${via}`, `${inner.length} inset`);
			}
			if (p.k === 'media') add('Art', /\.svg/i.test(p.v) || p.v === 'svg' ? 'SVG, vector' : 'image');
			if (p.k === 'text') add('Text', `"${p.v.slice(0, 28)}"`);
		}
		const fx = { ...n.fx, ...Object.values(n.pseudos).reduce((o, v) => ({ ...v.fx, ...o }), {}) };
		if (fx.radius) add('Corner radius', fx.radius);
		if (fx.clip) add('Clips content', 'yes, to its corners');
		if (fx.opacity && fx.opacity !== '1') add('Opacity at rest', fx.opacity);
		if (fx.transform) { const d = deg(fx.transform); if (d) add('Tilt', `${d}°`); }
		if (fx.bleed) add('Overhangs', `${fx.bleed}px past its box`);
		if (fx.mask) add('Mask', /linear-gradient/.test(fx.mask) ? 'gradient fade' : 'shape');
		if (fx.perspective) add('Perspective', fx.perspective);
		if (fx.backdrop) add('Backdrop', fx.backdrop);
		if (fx.filter) add('Filter', fx.filter);
		const WHEN = { load: 'on load', scroll: 'on scroll into view', idle: 'on its own', hover: 'on hover', pointer: 'follows the pointer', press: 'on press', click: 'on click' };
		if (motion === undefined) add('Motion', 'recording…');
		else if (motion) {
			let mine = motion.motions.filter((m) => m.node === n.i && m.frames > 2 && m.trigger !== 'leave');
			if (mine.some((m) => m.exact)) mine = mine.filter((m) => m.exact).filter((m, k, a2) => a2.findIndex((x) => x.exactId === m.exactId) === k);
			const loop = motion.loops.find((l) => l.node === n.i);
			for (const m of mine.slice(0, 3)) add(`Moves ${WHEN[m.trigger] ?? m.trigger}`, `${m.exact?.duration ?? m.duration} ms${m.delay > 20 || m.exact?.delay ? `, after ${m.exact?.delay || m.delay} ms` : ''}${m.spring ? ', spring' : m.exact?.easing && !/^eased per/.test(m.exact.easing) ? `, ${m.exact.easing}` : m.bezier ? `, cubic-bezier(${m.bezier.c.join(', ')})` : ''}`);
			if (loop) add('Loops', loop.css ? `${Math.round(loop.css.duration)} ms, forever` : loop.continuous ? 'continuously' : `every ${loop.period} ms`);
			if (!mine.length && !loop) add('Motion', 'none');
		}
		return rows;
	}

	/**
	 * The layers a person would name. A small pick keeps every painting part as its own layer; a big one (a section,
	 * a grid of cards) is grouped at the depth where it comes to about a dozen: each group is a part and all it holds.
	 */
	function groupLayers(nodes, files = [], max = 12, moving = null) {
		if (moving?.size) {
			const byI = new Map(nodes.map((n) => [n.i, n]));
			const isMoving = (n) => { for (let x = n; x; x = byI.get(x.p)) if (moving.has(x.i)) return true; return false; };
			const still = nodes.map((n) => (isMoving(n) ? { ...n, paint: [], pseudos: {} } : n));
			const anyStill = still.some((n) => n.paint.length || Object.values(n.pseudos).some((v) => v.paint.length));
			const gs = anyStill ? groupLayers(still, files, max - 1, null) : [];
			const mem = nodes.filter((n) => isMoving(n) && (n.paint.length || Object.values(n.pseudos).some((v) => v.paint.length)) && n.raw.w >= 2 && n.raw.h >= 2);
			if (mem.length) {
				const xs = mem.map((m) => m.box.w >= 2 ? m.box : { ...m.box, w: m.raw.w, h: m.raw.h });
				const box = { x: Math.min(...xs.map((b) => b.x)), y: Math.min(...xs.map((b) => b.y)), r: Math.max(...xs.map((b) => b.x + b.w)), b: Math.max(...xs.map((b) => b.y + b.h)) };
				gs.push({ i: mem[0].i, sub: true, n: mem[0], members: mem.map((m) => m.i), box: { x: box.x, y: box.y, w: Math.max(2, box.r - box.x), h: Math.max(2, box.b - box.y) }, name: `Animation (${moving.size} moving ${moving.size > 1 ? 'parts' : 'part'})`, moving: true });
			}
			return gs;
		}
		const first = groupStrict(nodes, files, max, false);
		if (first.length) return first;
		const second = groupStrict(nodes, files, max, true);
		if (second.length) return second;
		const n = nodes[0];
		return n ? [{ i: n.i, sub: true, n, members: nodes.map((x) => x.i), box: { x: 0, y: 0, w: n.box.w || 1, h: n.box.h || 1 }, name: 'The whole thing' }] : [];
	}
	function groupStrict(nodes, files, max, relaxed) {
		const byI = new Map(nodes.map((n) => [n.i, n]));
		const kids = new Map();
		for (const n of nodes) if (n.p != null) (kids.get(n.p) ?? kids.set(n.p, []).get(n.p)).push(n);
		const paints = (n) => n.paint.length || Object.values(n.pseudos).some((v) => v.paint.length);
		const seen = (n) => (relaxed ? n.raw.w >= 2 && n.raw.h >= 2 : n.box.w >= 2 && n.box.h >= 2 && n.op > 0.04);
		const surface = (n) => [...n.paint, ...Object.values(n.pseudos).flatMap((v) => v.paint)].some((p) => p.k === 'fill' || p.k === 'border' || p.k === 'shadow' || p.k === 'gradient' || p.k === 'image' || p.k === 'media');
		const P = nodes.filter((n) => paints(n) && seen(n));
		const under = (n) => { const out = []; const walk = (x) => { for (const c of kids.get(x.i) ?? []) { out.push(c); walk(c); } }; walk(n); return out; };
		const finish = (gs, keep = false) => (keep ? gs : gs.slice().sort((a, b) => a.n.i - b.n.i)).filter((g) => g.members.length).map((g) => {
			const xs = g.members.map((m) => m.box);
			const box = { x: Math.min(...xs.map((b) => b.x)), y: Math.min(...xs.map((b) => b.y)), r: Math.max(...xs.map((b) => b.x + b.w)), b: Math.max(...xs.map((b) => b.y + b.h)) };
			const sub = g.members.some((m) => m !== g.n);
			return { i: g.n.i, sub, n: g.n, members: g.members.map((m) => m.i), box: { x: box.x, y: box.y, w: box.r - box.x, h: box.b - box.y }, name: g.name ?? (sub ? groupName(g, files) : nameOf(g.n, files)) };
		});
		const svgRoot = nodes[0].tag === 'svg' ? nodes[0] : (() => { const k = kids.get(nodes[0].i) ?? []; return k.length === 1 && k[0].tag === 'svg' ? k[0] : null; })();
		if (svgRoot && P.length > max) {
			const inside2 = (x) => [x, ...under(x)].filter((m) => P.includes(m));
			let parts = (kids.get(svgRoot.i) ?? []).filter((c) => inside2(c).length);
			for (let k = 0; k < 3 && parts.length === 1; k++) { const inner = (kids.get(parts[0].i) ?? []).filter((c) => inside2(c).length); if (inner.length < 2) break; parts = inner; }
			const gs = [];
			if (P.includes(nodes[0]) && nodes[0] !== svgRoot) gs.push({ n: nodes[0], members: [nodes[0]], name: 'Panel' });
			// one layer per group of the drawing when it has a few; otherwise its parts sorted by what they are
			if (parts.length >= 2 && parts.length <= max - gs.length) for (const x of parts) gs.push({ n: x, members: inside2(x), name: drawingName(x, inside2(x)) });
			else {
				const mem = inside2(svgRoot).filter((m) => m !== svgRoot);
				const kindOf = (m) => {
					const has = (k) => m.paint.some((q) => q.k === k);
					if (has('text')) return 'Text';
					if (m.anim) return has('stroke') ? 'Animated pulses' : 'Animated shapes';
					if (has('stroke') && m.paint.some((q) => q.k === 'stroke' && /dashed/.test(q.v))) return 'Dashed lines';
					if (has('stroke') && !has('vfill')) return 'Lines';
					if (m.tag === 'circle' || m.tag === 'ellipse') return 'Circles';
					if (has('media')) return 'Images';
					return 'Shapes';
				};
				const kinds = new Map();
				for (const m of mem) { const k = kindOf(m); (kinds.get(k) ?? kinds.set(k, []).get(k)).push(m); }
				const ORDER = ['Circles', 'Shapes', 'Images', 'Dashed lines', 'Lines', 'Animated shapes', 'Animated pulses', 'Text'];
				for (const k of ORDER) if (kinds.has(k)) gs.push({ n: kinds.get(k)[0], members: kinds.get(k), name: `${k} (${kinds.get(k).length})` });
			}
			return finish(gs, true);
		}
		// a small pick: every part is its own layer
		if (P.length <= max) return finish(P.map((n) => ({ n, members: [n] })));
		// a big one: its visual pieces (a panel, a card, a picture), each with everything it holds, the biggest first
		const root = nodes[0];
		// the first surfaces under x (a panel, a card, a picture at least 40×40), not looking inside them
		const top = (x) => { const out = []; const find = (y) => { for (const c of kids.get(y.i) ?? []) { if (!seen(c)) continue; if (surface(c) && c.box.w * c.box.h >= 1600) out.push(c); else find(c); } }; find(x); return out; };
		let pieces = top(root);
		const chain = []; // a card that holds everything keeps its own slab while we look inside it
		for (let k = 0; k < 4 && pieces.length === 1; k++) { const inner = top(pieces[0]); if (inner.length < 2) break; chain.push(pieces[0]); pieces = inner; }
		{
			// distinct pieces that fit: each its own layer, with what it holds; containers keep their own slab
			const room = max - (P.includes(root) ? 1 : 0) - chain.length - 1;
			const R1 = root.box, diag1 = Math.hypot(R1.w, R1.h) / 2 || 1;
			if (pieces.length && pieces.length <= room) {
				const inside1 = (x) => [x, ...under(x)].filter((m) => P.includes(m));
				const gs = [];
				if (P.includes(root)) gs.push({ n: root, members: [root], name: 'Panel' });
				const claimed = new Set([root]);
				for (const c of chain) if (P.includes(c)) { gs.push({ n: c, members: [c], name: groupName({ n: c, members: inside1(c) }, files) }); claimed.add(c); }
				for (const x of pieces) { const mem = inside1(x).filter((m) => !claimed.has(m)); mem.forEach((m) => claimed.add(m)); if (mem.length) gs.push({ n: x, members: mem }); }
				const loose = P.filter((m) => !claimed.has(m));
				if (loose.length) gs.push({ n: loose[0], members: loose });
				return finish(gs, true);
			}
		}
		if (!pieces.length) pieces = P.slice().sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h).slice(0, max - 1);
		const R0 = root.box, diag = Math.hypot(R0.w, R0.h) / 2 || 1;
		const weight = (x) => x.box.w * x.box.h * x.op * Math.max(0.15, 1 - Math.hypot(x.box.x + x.box.w / 2 - R0.w / 2, x.box.y + x.box.h / 2 - R0.h / 2) / diag);
		const inside = (x) => [x, ...under(x)].filter((m) => P.includes(m));
		// the one they picked it for: the most visible piece that holds parts (a card, not a lone ring)
		const holders = pieces.filter((x) => inside(x).length > 1);
		const hero = (holders.length ? holders : pieces).slice().sort((a, b) => weight(b) - weight(a))[0];
		const overlap = (a, b) => { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? (w * h) / Math.min(a.w * a.h, b.w * b.h) : 0; };
		// pieces sitting on it (a focus ring, a glow, a badge) go on top of it, each its own layer
		const onTop = pieces.filter((x) => x !== hero && overlap(x.box, hero.box) > 0.5 && !(Math.abs(x.box.w - hero.box.w) < 4 && Math.abs(x.box.h - hero.box.h) < 4 && inside(x).length > 1)).slice(0, 3);
		const others = pieces.filter((x) => x !== hero && !onTop.includes(x));
		const groups = [];
		if (P.includes(root)) groups.push({ n: root, members: [root], name: 'Panel' });
		const claimed = new Set([root]);
		if (others.length) {
			const mem = others.flatMap(inside);
			mem.forEach((m) => claimed.add(m));
			const alike = others.filter((x) => surface(x) && Math.abs(x.box.w - hero.box.w) < hero.box.w * 0.3).length >= others.length * 0.6;
			const drawings = others.every((x) => x.paint.some((q) => q.k === 'media'));
			groups.push({ n: others[0], members: mem, name: others.length === 1 ? undefined : alike ? `${others.length} more cards` : drawings ? `${others.length} drawings` : `${others.length} more pieces` });
		}
		const heroAll = inside(hero);
		heroAll.forEach((m) => claimed.add(m));
		const heroName = groupName({ n: hero, members: heroAll }, files);
		const roomForHero = max - groups.length - onTop.length - 1;
		if (heroAll.length <= Math.max(3, roomForHero)) heroAll.forEach((m) => groups.push({ n: m, members: [m], name: m === hero ? heroName : undefined }));
		else {
			groups.push({ n: hero, members: [hero], name: heroName });
			const used = new Set([hero]);
			for (const part of top(hero).slice(0, Math.max(2, roomForHero - 3))) { const mem = inside(part).filter((m) => !used.has(m)); mem.forEach((m) => used.add(m)); groups.push({ n: part, members: mem }); }
			const left = heroAll.filter((m) => !used.has(m));
			const texts = left.filter((m) => m.paint.some((q) => q.k === 'text')), rest = left.filter((m) => !texts.includes(m));
			if (rest.length) groups.push({ n: rest[0], members: rest, name: rest.length > 1 ? `${rest.length} icons and marks` : undefined });
			if (texts.length) groups.push({ n: texts[0], members: texts });
		}
		for (const x of onTop) { const mem = inside(x); mem.forEach((m) => claimed.add(m)); groups.push({ n: x, members: mem, name: x.paint.some((q) => q.k === 'media') && overlap(x.box, hero.box) > 0.8 && Math.abs(x.box.w - hero.box.w) < hero.box.w * 0.15 && Math.abs(x.box.h - hero.box.h) < hero.box.h * 0.15 ? 'Focus ring' : undefined }); }
		// anything else that shows (a heading outside the cards)
		const loose = P.filter((m) => !claimed.has(m));
		if (loose.length) groups.splice(others.length ? 2 : 1, 0, { n: loose[0], members: loose });
		return finish(groups.slice(0, max), true);
	}
	function drawingName(x, mem) {
		const label = x.alt || '';
		if (label) return label;
		const strokes = mem.filter((m) => m.paint.some((q) => q.k === 'stroke')), fills = mem.filter((m) => m.paint.some((q) => q.k === 'vfill')), texts = mem.filter((m) => m.paint.some((q) => q.k === 'text'));
		const dashed = strokes.some((m) => m.paint.some((q) => q.k === 'stroke' && /dashed/.test(q.v)));
		if (texts.length) return `Text "${texts[0].paint.find((q) => q.k === 'text').v.slice(0, 24)}"`;
		if (strokes.length && !fills.length) return `${dashed ? 'Dashed lines' : 'Lines'} (${strokes.length})`;
		if (fills.length && !strokes.length) return `${x.tag === 'circle' || mem.every((m) => m.tag === 'circle') ? 'Circles' : 'Shapes'} (${fills.length})`;
		return `Drawing group (${mem.length})`;
	}
	function groupName(g, files) {
		const media = g.members.filter((m) => m.paint.some((p) => p.k === 'media'));
		const texts = g.members.flatMap((m) => m.paint.filter((p) => p.k === 'text').map((p) => p.v));
		const words = texts.filter((t) => /[A-Za-z0-9]{2}/.test(t));
		const art = texts.length && !words.length;
		const surface = g.n.paint.some((p) => p.k === 'fill' || p.k === 'border' || p.k === 'shadow' || p.k === 'gradient');
		if (surface && (media.length || words.length)) return `Card${words.length ? ` "${words.slice(-1)[0].slice(0, 24)}"` : ''}`;
		if (art) return 'Text art';
		if (words.length) return `Text "${words[0].slice(0, 28)}"`;
		if (media.length === g.members.length) return media.length > 1 ? `${media.length} drawings` : nameOf(media[0], files);
		return surface ? nameOf(g.n, files) : `Group of ${g.members.length}`;
	}
	/** A group's card: its own look, then what it holds. */
	function groupSpecs(layer, motion) {
		const rows = specsOf(layer.n ?? layer, motion);
		if (layer.sub) {
			const ms = layer.members;
			rows.splice(1, 0, { k: 'Holds', v: `${ms.length} parts` });
		}
		return rows;
	}
	/** Why the layers came out as they did, for diagnosis. */
	function why(nodes) {
		const paints = (n) => n.paint.length || Object.values(n.pseudos).some((v) => v.paint.length);
		return { nodes: nodes.length, painting: nodes.filter(paints).length, visible: nodes.filter((n) => paints(n) && n.box.w >= 2 && n.box.h >= 2 && n.op > 0.04).length, zeroOpacity: nodes.filter((n) => n.op <= 0.04).length, clippedAway: nodes.filter((n) => paints(n) && (n.box.w < 2 || n.box.h < 2) && n.raw.w >= 2).length, root: nodes[0] && { box: nodes[0].box, op: nodes[0].op } };
	}
	return { why, anatomyOf, groupLayers, groupSpecs, nameOf, specsOf, fileName, deg, blurOf, colorOf, slugOf };
}
