// Motion capture: how a pick moves, and what makes it move. The page is opened again in a Chrome of its own (the
// person's page never moves), and a person's session is replayed against the pick: the page loading, scrolling it
// into view, sitting still, hovering, moving the pointer across it, leaving, pressing (and clicking where that is
// safe). Every frame, every animated property of the pick and everything inside it is recorded.
//
// Where the page says exactly how it moves, that is read, not guessed: Chrome's Animation domain (CSS transitions and
// animations, Web Animations), Element.animate calls (Motion, Framer Motion), and GSAP calls. Everything else is
// measured from the frames and fitted: a cubic-bezier, or a spring when it overshoots; tied to scroll; following the
// pointer; looping. Key frames of the biggest moves are kept as a filmstrip.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch, wait } from './chrome.mjs';

const FRAME = 1000 / 60;

/** Installed before the page's own scripts: the frame recorder, and hooks on Element.animate and GSAP. */
function hooks(PATH) {
	if (window.__spRec) return;
	const PROPS = ['opacity', 'transform', 'translate', 'scale', 'rotate', 'filter', 'clipPath', 'backgroundColor', 'color', 'boxShadow', 'borderTopLeftRadius', 'strokeDashoffset', 'backgroundPosition', 'width', 'height'];
	const R = (window.__spRec = { found: null, marks: [], tracks: {}, root: [], scroll: [], ptr: [], parents: [], desc: [], waapi: [], gsap: [] });
	let nodes = [], pseudo = [], last = {}, frame = 0;
	const short = (n) => {
		const t = n.tagName.toLowerCase();
		const src = n.currentSrc || n.getAttribute('src') || '';
		const file = src ? decodeURIComponent(src.split('/').pop().split('?')[0]).replace(/-[0-9a-f]{12,}/i, '') : '';
		const text = [...n.childNodes].filter((x) => x.nodeType === 3).map((x) => x.textContent.trim()).join(' ').trim().slice(0, 30);
		return `${t}${n.getAttribute('alt') ? ` "${n.getAttribute('alt').slice(0, 30)}"` : file ? ` ${file}` : text ? ` "${text}"` : ''}`;
	};
	const mark = () => {
		const root = document.querySelector(PATH);
		if (!root) return false;
		nodes = [root, ...root.querySelectorAll('*')].filter((e) => !['SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'STYLE'].includes(e.tagName)).slice(0, 220);
		pseudo = [];
		const idx = new Map(nodes.map((n, i) => [n, i]));
		nodes.forEach((n, i) => {
			n.setAttribute('data-sp-m', String(i));
			R.parents[i] = idx.get(n.parentElement) ?? -1;
			R.desc[i] = short(n);
			for (const ps of ['::before', '::after']) { const c = getComputedStyle(n, ps).content; if (c && c !== 'none' && c !== 'normal') pseudo.push([i, ps]); }
		});
		return true;
	};
	const put = (key, v, t) => { if (last[key] === v) return; last[key] = v; (R.tracks[key] ??= []).push([t, v]); };
	const r1 = (v) => Math.round(v * 10) / 10;
	let lastScroll = null;
	const tick = (t) => {
		if (!nodes.length || !nodes[0].isConnected || (frame % 30 === 0 && document.querySelector(PATH) !== nodes[0])) { if (mark() && R.found == null) R.found = t; }
		if (nodes.length && nodes[0].isConnected) {
			const rr = nodes[0].getBoundingClientRect();
			R.root.push([t, r1(rr.left), r1(rr.top), Math.round(rr.width), Math.round(rr.height)]);
			if (scrollY !== lastScroll) { lastScroll = scrollY; R.scroll.push([t, scrollY]); }
			nodes.forEach((n, i) => {
				const cs = getComputedStyle(n);
				for (const p of PROPS) put(`${i}|${p}`, cs[p], t);
				if (i) { const q = n.getBoundingClientRect(); put(`${i}|x`, r1(q.left - rr.left), t); put(`${i}|y`, r1(q.top - rr.top), t); }
			});
			for (const [i, ps] of pseudo) { const cs = getComputedStyle(nodes[i], ps); for (const p of ['opacity', 'transform', 'filter', 'backgroundPosition']) put(`${i}${ps}|${p}`, cs[p], t); }
		}
		frame++;
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	addEventListener('mousemove', (e) => R.ptr.push([performance.now(), e.clientX, e.clientY]), true);
	R.mark = (label) => R.marks.push([performance.now(), label]);
	const plain = (v, d = 0) => {
		if (v == null || typeof v !== 'object') return typeof v === 'function' ? '[function]' : v;
		if (v instanceof Element) return '[element]';
		if (d > 3) return '[…]';
		if (Array.isArray(v)) return v.slice(0, 20).map((x) => plain(x, d + 1));
		const o = {};
		for (const [k, x] of Object.entries(v).slice(0, 40)) o[k] = plain(x, d + 1);
		return o;
	};
	const els = (t) => { try { return typeof t === 'string' ? [...document.querySelectorAll(t)] : t instanceof Element ? [t] : t && typeof t.length === 'number' ? [...t].filter((x) => x instanceof Element) : []; } catch { return []; } };
	// Element.animate: Motion, Framer Motion and hand-written Web Animations all go through it
	const oa = Element.prototype.animate;
	Element.prototype.animate = function (k, o) {
		try { R.waapi.push({ el: this, t: performance.now(), keyframes: plain(k), options: typeof o === 'number' ? { duration: o } : plain(o ?? {}) }); } catch {}
		return oa.apply(this, arguments);
	};
	// GSAP (the global build): every tween with its vars, before it runs
	const wrapGsap = (g) => {
		if (!g || g.__spWrapped) return g;
		g.__spWrapped = true;
		const hook = (obj, prefix) => {
			for (const m of ['to', 'from', 'fromTo', 'set']) {
				const o = obj[m];
				if (typeof o !== 'function') continue;
				obj[m] = function (t, a, b, pos) {
					try { R.gsap.push({ m: prefix + m, t: performance.now(), targets: els(t), sel: typeof t === 'string' ? t : null, vars: plain(m === 'fromTo' ? b : a), from: m === 'fromTo' ? plain(a) : undefined, position: m === 'fromTo' ? plain(pos) : plain(b) }); } catch {}
					return o.apply(this, arguments);
				};
			}
		};
		hook(g, 'gsap.');
		const tl = g.timeline;
		if (typeof tl === 'function') g.timeline = function () { const x = tl.apply(this, arguments); try { hook(x, 'timeline.'); } catch {} return x; };
		R.gsapVersion = g.version;
		return g;
	};
	let g = window.gsap;
	if (g) wrapGsap(g);
	try { Object.defineProperty(window, 'gsap', { configurable: true, get: () => g, set: (v) => { g = wrapGsap(v); } }); } catch {}
	R.dump = () => {
		const root = nodes[0];
		const at = (e) => { const i = e?.getAttribute?.('data-sp-m'); return i == null ? null : +i; };
		const inside = (list) => list.filter((e) => root && (e === root || root.contains(e)));
		return {
			found: R.found, marks: R.marks, tracks: R.tracks, root: R.root, scroll: R.scroll, ptr: R.ptr, parents: R.parents, desc: R.desc, nodes: nodes.length,
			waapi: R.waapi.filter((w) => inside([w.el]).length).map((w) => ({ node: at(w.el), t: w.t, keyframes: w.keyframes, options: w.options })),
			gsap: R.gsap.map((x) => ({ ...x, nodes: inside(x.targets).map(at), targets: x.targets.length })).filter((x) => x.nodes.length),
			gsapVersion: R.gsapVersion ?? null,
			libs: {
				gsap: window.gsap?.version ?? (window.gsap ? 'yes' : null), scrollTrigger: !!window.ScrollTrigger,
				lenis: !!window.lenis || /\blenis\b/.test(document.documentElement.className),
				framer: !!document.querySelector('[data-framer-name],[data-framer-component-type],[data-framer-appear-id]'),
				lottie: !!window.lottie || !!window.bodymovin || !!document.querySelector('lottie-player,dotlottie-player,dotlottie-wc'),
				rive: !!window.rive || !!document.querySelector('canvas[data-rive],rive-canvas'),
				three: !!window.__THREE__, spline: !!document.querySelector('spline-viewer'),
				aos: !!document.querySelector('[data-aos]'),
			},
			now: performance.now(), wall: Date.now(),
		};
	};
}

// ---------------------------------------------------------------- the analysis

const num = (s) => (String(s).match(/-?\d*\.?\d+(e-?\d+)?/g) ?? []).map(Number);
/** A value as named numbers, so motion can be measured: a transform becomes x, y, scale, rotate. */
function parts(prop, v) {
	const p = prop.split('|')[1];
	if (v == null) return null;
	if (p === 'transform') {
		if (v === 'none') return { x: 0, y: 0, scale: 1, rotate: 0 };
		const m = num(v.slice(v.indexOf('(')));
		if (v.startsWith('matrix3d') && m.length >= 16) return { x: m[12], y: m[13], z: m[14], scale: Math.hypot(m[0], m[1], m[2]), rotate: Math.atan2(m[1], m[0]) * 180 / Math.PI, rotateX: Math.atan2(m[6], m[5]) * 180 / Math.PI, rotateY: Math.atan2(-m[2], m[0]) * 180 / Math.PI };
		if (m.length >= 6) return { x: m[4], y: m[5], scale: Math.hypot(m[0], m[1]), rotate: Math.atan2(m[1], m[0]) * 180 / Math.PI };
		return null;
	}
	if (p === 'translate') { if (v === 'none') return { x: 0, y: 0 }; const m = num(v); return { x: m[0] ?? 0, y: m[1] ?? 0 }; }
	if (p === 'scale') { if (v === 'none') return { scale: 1 }; const m = num(v); return { scale: m[0] ?? 1 }; }
	if (p === 'rotate') { if (v === 'none') return { rotate: 0 }; const m = num(v); return { rotate: m[m.length - 1] ?? 0 }; }
	if (p === 'backgroundColor' || p === 'color') { const m = num(v); return m.length >= 3 ? { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 } : null; }
	if (p === 'filter' && v === 'none') return { f0: 0 };
	const m = num(v);
	if (!m.length) return null;
	return m.length === 1 ? { v: m[0] } : Object.fromEntries(m.map((x, k) => [`v${k}`, x]));
}
const UNIT = { x: 'px', y: 'px', z: 'px', rotate: '°', rotateX: '°', rotateY: '°', v: '' };
const SCALE = { x: 40, y: 40, z: 40, scale: 0.1, rotate: 5, rotateX: 5, rotateY: 5, r: 40, g: 40, b: 40, a: 0.2 };

/** A cubic-bezier's y at time x. */
function bezier(x1, y1, x2, y2) {
	const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
	const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t, dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
	return (x) => {
		let t = x;
		for (let k = 0; k < 8; k++) { const e = X(t) - x, d = dX(t); if (Math.abs(e) < 1e-5 || Math.abs(d) < 1e-6) break; t -= e / d; }
		if (t < 0 || t > 1) { let lo = 0, hi = 1; t = x; for (let k = 0; k < 30; k++) { if (X(t) < x) lo = t; else hi = t; t = (lo + hi) / 2; } }
		return Y(t);
	};
}
const NAMED = [
	['linear', [0, 0, 1, 1]], ['ease', [0.25, 0.1, 0.25, 1]], ['ease-in', [0.42, 0, 1, 1]], ['ease-out', [0, 0, 0.58, 1]], ['ease-in-out', [0.42, 0, 0.58, 1]],
	['ease-out cubic', [0.33, 1, 0.68, 1]], ['ease-out quart', [0.25, 1, 0.5, 1]], ['ease-out quint', [0.22, 1, 0.36, 1]], ['ease-out expo', [0.16, 1, 0.3, 1]],
	['ease-in-out cubic', [0.65, 0, 0.35, 1]], ['ease-in-out quart', [0.76, 0, 0.24, 1]], ['ease-in cubic', [0.32, 0, 0.67, 0]], ['material standard', [0.4, 0, 0.2, 1]],
	['snappy out', [0.23, 1, 0.32, 1]], ['power2.out', [0.215, 0.61, 0.355, 1]], ['power3.out', [0.17, 0.84, 0.44, 1]], ['power4.out', [0.23, 1, 0.32, 1]],
];
const rms = (f, pts) => Math.sqrt(pts.reduce((s, [x, y]) => s + (f(x) - y) ** 2, 0) / pts.length);
function fitBezier(pts) {
	let best = null;
	for (const [name, c] of NAMED) { const e = rms(bezier(...c), pts); if (!best || e < best.err) best = { name, c, err: e }; }
	let cur = [...best.c], err = best.err, step = 0.15, seed = 7;
	const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
	for (let k = 0; k < 600; k++) {
		const t = cur.map((v, j) => (j % 2 === 0 ? Math.min(1, Math.max(0, v + rnd() * step)) : Math.min(1.6, Math.max(-0.6, v + rnd() * step))));
		const e = rms(bezier(...t), pts);
		if (e < err) { cur = t; err = e; }
		if (k % 100 === 99) step *= 0.6;
	}
	const named = best.err <= err * 1.25 + 0.004 ? best : null;
	return { c: (named ? named.c : cur).map((v) => Math.round(v * 100) / 100), name: named?.name ?? null, err: named ? named.err : err };
}
const springAt = (z, w) => (t) => {
	if (z < 1) { const wd = w * Math.sqrt(1 - z * z); return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t)); }
	return 1 - (1 + w * t) * Math.exp(-w * t);
};
function fitSpring(pts) {
	let best = null;
	for (const off of [-0.017, -0.008, 0, 0.008, 0.017]) for (let z = 0.05; z <= 1.0001; z += 0.02) for (let w = 3; w <= 80; w *= 1.04) { const f = springAt(z, w); const e = rms((t) => (t + off <= 0 ? 0 : f(t + off)), pts); if (!best || e < best.err) best = { z, w, err: e }; }
	const k = best.w * best.w, c = 2 * best.z * best.w;
	return { stiffness: Math.round(k), damping: Math.round(c * 10) / 10, mass: 1, dampingRatio: Math.round(best.z * 100) / 100, err: best.err };
}

/** Where along [a, b] (0..1) each sample sits, with its time from the start in seconds and in 0..1. */
function progress(samples, comp, from, to, t0, dur) {
	const d = to - from;
	return samples.map(([t, p]) => { const tt = Math.max(t, t0); return [(tt - t0) / 1000, Math.min(1, Math.max(0, (tt - t0) / dur)), (p[comp] - from) / d]; });
}

function segmentsOf(track) {
	const segs = [];
	let s = null;
	for (let k = 1; k < track.length; k++) {
		const [t] = track[k];
		if (s && t - track[k - 1][0] <= 140) { s.end = k; continue; }
		if (s) segs.push(s);
		s = { start: k, end: k };
	}
	if (s) segs.push(s);
	return segs;
}
const corr = (xs, ys) => {
	const n = xs.length; if (n < 4) return 0;
	const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
	let sxy = 0, sxx = 0, syy = 0;
	for (let k = 0; k < n; k++) { sxy += (xs[k] - mx) * (ys[k] - my); sxx += (xs[k] - mx) ** 2; syy += (ys[k] - my) ** 2; }
	return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
};
const nearest = (list, t) => { let lo = 0, hi = list.length - 1; if (hi < 0) return null; while (lo < hi) { const m = (lo + hi) >> 1; if (list[m][0] < t) lo = m + 1; else hi = m; } return lo > 0 && Math.abs(list[lo - 1][0] - t) < Math.abs(list[lo][0] - t) ? list[lo - 1] : list[lo]; };
const fmt = (v, u = '') => `${Math.round(v * 100) / 100}${u}`;

/** Every motion in the recording, attributed to what triggered it, fitted, with the page's own numbers when it gave them. */
export function analyse(rec, exact) {
	const phases = rec.marks.map(([t, label], k) => ({ label, t, end: rec.marks[k + 1]?.[0] ?? rec.now }));
	for (const p of phases) {
		if (!['hover', 'leave'].includes(p.label)) continue;
		const inside = (q) => { const r = nearest(rec.root, q[0]); return r && q[1] >= r[1] && q[1] <= r[1] + r[3] && q[2] >= r[2] && q[2] <= r[2] + r[4]; };
		const hit = rec.ptr.find((q) => q[0] >= p.t && q[0] < p.end && (p.label === 'hover' ? inside(q) : !inside(q)));
		if (hit) p.t = hit[0];
	}
	const phaseAt = (t) => phases.findLast((p) => p.t <= t + 40) ?? { label: 'load', t: rec.found ?? 0 };
	const out = [];
	for (const [key, track] of Object.entries(rec.tracks)) {
		if (track.length < 2) continue;
		const [nodeKey, prop] = key.split('|');
		const node = parseInt(nodeKey, 10), pseudo = nodeKey.match(/::\w+/)?.[0] ?? '';
		const parsed = track.map(([t, v]) => [t, parts(key, v), v]);
		for (const s of segmentsOf(track)) {
			const startT = track[s.start][0] - FRAME, endT = track[s.end][0];
			const ph = phaseAt(startT);
			if (ph.label === 'load' && rec.found != null && startT < rec.found + 120 && endT < rec.found + 600) continue; // the page settling as it appears
			const before = parsed[s.start - 1], after = parsed[s.end];
			const fromV = before[2], toV = after[2];
			const seg = { node, pseudo, prop, trigger: ph.label, start: startT, delay: Math.max(0, Math.round(startT - ph.t)), duration: Math.round(endT - startT), from: fromV, to: toV, frames: s.end - s.start + 1 };
			const a = before[1], b = after[1];
			if (a && b) {
				const win = parsed.slice(s.start - 1, s.end + 1).filter((x) => x[1]);
				const range = (c) => { const v = win.map((x) => x[1][c]).filter((x) => x != null); return v.length ? Math.max(...v) - Math.min(...v) : 0; };
				const comps = Object.keys(b).filter((c) => a[c] != null && (Math.abs(b[c] - a[c]) > (SCALE[c] ?? 1) * 0.01 || (ph.label === 'pointer' && range(c) > (SCALE[c] ?? 1) * 0.05)));
				const size = (c) => Math.max(Math.abs(b[c] - a[c]), ph.label === 'pointer' ? range(c) : 0) / (SCALE[c] ?? 1);
				const pick = comps.sort((c1, c2) => size(c2) - size(c1))[0];
				seg.changes = comps.map((c) => ({ c, from: a[c], to: b[c] }));
				if (pick && s.end - s.start >= 2 && Math.abs(b[pick] - a[pick]) > (SCALE[pick] ?? 1) * 0.01) {
					const samples = parsed.slice(s.start - 1, s.end + 1).filter((x) => x[1] && x[1][pick] != null).map(([t, p]) => [t, p]);
					const pr = progress(samples, pick, a[pick], b[pick], startT, endT - startT);
					const over = Math.max(...pr.map((x) => x[2])), under = Math.min(...pr.map((x) => x[2]));
					seg.comp = pick;
					seg.overshoot = Math.round(Math.max(0, over - 1, -under) * 1000) / 10;
					if (seg.overshoot > 1.5) seg.spring = fitSpring(pr.map(([sec, , p]) => [sec, p]));
					else seg.bezier = fitBezier(pr.map(([, x, p]) => [x, p]));
				}
				// tied to scroll, or to the pointer?
				const inWin = parsed.slice(s.start - 1, s.end + 1).filter((x) => x[1] && pick && x[1][pick] != null);
				if (ph.label === 'scroll' && pick && rec.scroll.length > 3 && inWin.length > 4) {
					const ys = inWin.map(([t]) => nearest(rec.scroll, t)?.[1] ?? 0), vs = inWin.map(([, p]) => p[pick]);
					const lastScroll = rec.scroll.filter(([t]) => t <= endT + 200).pop()?.[0] ?? 0;
					const r = corr(ys, vs);
					if (Math.abs(r) > 0.92 && endT - lastScroll < 120) {
						const root0 = nearest(rec.root, startT), root1 = nearest(rec.root, endT);
						seg.scrollLinked = { r: Math.round(r * 100) / 100, fromTop: root0?.[2], toTop: root1?.[2] };
					}
				}
				if (ph.label === 'pointer' && pick && inWin.length > 4) {
					const pts = inWin.map(([t, p]) => { const q = nearest(rec.ptr, t), rr = nearest(rec.root, t); return q && rr ? [((q[1] - rr[1]) / rr[3]) * 2 - 1, ((q[2] - rr[2]) / rr[4]) * 2 - 1, p[pick]] : null; }).filter(Boolean);
					const rx = corr(pts.map((x) => x[0]), pts.map((x) => x[2])), ry = corr(pts.map((x) => x[1]), pts.map((x) => x[2]));
					const axis = Math.abs(rx) >= Math.abs(ry) ? 'x' : 'y', r = axis === 'x' ? rx : ry;
					if (Math.abs(r) > 0.75) {
						const xs = pts.map((x) => (axis === 'x' ? x[0] : x[1])), vs = pts.map((x) => x[2]);
						const mx = xs.reduce((p, q) => p + q, 0) / xs.length, mv = vs.reduce((p, q) => p + q, 0) / vs.length;
						const slope = xs.reduce((p, x, k) => p + (x - mx) * (vs[k] - mv), 0) / xs.reduce((p, x) => p + (x - mx) ** 2, 0);
						seg.follows = { axis, r: Math.round(r * 100) / 100, atStart: mv - slope * (1 + mx), atEnd: mv + slope * (1 - mx) };
					}
				}
			}
			out.push(seg);
		}
	}
	// a child that only moves because its parent moves is not its own motion
	const moving = (n, t0, t1) => out.some((o) => o.node === n && !o.pseudo && ['transform', 'translate', 'scale', 'rotate', 'x', 'y'].includes(o.prop) && o.start < t1 && o.start + o.duration > t0);
	const ancestors = (n) => { const a = []; for (let p = rec.parents[n]; p != null && p >= 0; p = rec.parents[p]) a.push(p); return a; };
	const kept = out.filter((o) => {
		if (['x', 'y', 'width', 'height'].includes(o.prop)) {
			if (moving(o.node, o.start, o.start + o.duration) && o.prop !== 'width' && o.prop !== 'height') return false;
			if (ancestors(o.node).some((p) => moving(p, o.start, o.start + o.duration) || out.some((q) => q.node === p && ['x', 'y', 'width', 'height'].includes(q.prop) && q.start < o.start + o.duration && q.start + q.duration > o.start))) return false;
		}
		return true;
	});
	// loops: the same move again and again while nothing happens
	const loops = [];
	const byKey = new Map();
	for (const o of kept) if (['idle', 'load', 'scroll'].includes(o.trigger)) (byKey.get(`${o.node}${o.pseudo}|${o.prop}`) ?? byKey.set(`${o.node}${o.pseudo}|${o.prop}`, []).get(`${o.node}${o.pseudo}|${o.prop}`)).push(o);
	for (const [k, list] of byKey) {
		const idle = phases.find((p) => p.label === 'idle');
		const cont = list.find((o) => idle && o.start <= idle.t + 50 && o.start + o.duration >= idle.end - 80);
		if (cont) loops.push({ key: k, node: cont.node, pseudo: cont.pseudo, prop: cont.prop, continuous: true });
		else if (list.filter((o) => o.frames >= 3 && o.duration >= 50).length >= 3) {
			list.splice(0, list.length, ...list.filter((o) => o.frames >= 3 && o.duration >= 50));
			const gaps = list.slice(1).map((o, j) => o.start - list[j].start), mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
			if (gaps.every((g) => Math.abs(g - mean) < Math.max(60, mean * 0.12))) loops.push({ key: k, node: list[0].node, pseudo: list[0].pseudo, prop: list[0].prop, period: Math.round(mean), duration: list[0].duration });
		}
	}
	for (const c of exact.css) if (c.type === 'CSSAnimation' && (c.iterations == null || c.iterations > 50) && !loops.some((l) => l.node === c.node && !!l.pseudo === !!c.pseudo)) loops.push({ key: `${c.node}|${c.name}`, node: c.node, pseudo: c.pseudo ? '::?' : '', prop: 'animation', continuous: true, css: c });
	// the page's own numbers, where it gave them: every move of that element inside an exact animation's window is that animation
	const sources = [
		...rec.waapi.map((w, k) => ({ id: `w${k}`, node: w.node, pseudo: false, t: w.t + (w.options?.delay ?? 0), dur: w.options?.duration ?? 0, exact: { via: 'element.animate (Web Animations; Motion and Framer Motion use it)', duration: w.options?.duration, delay: w.options?.delay ?? 0, easing: w.options?.easing ?? (w.keyframes?.some?.((f) => f.easing) ? 'per keyframe, see below' : 'linear'), keyframes: w.keyframes } })),
		...exact.css.filter((c) => c.type !== 'WebAnimation').map((c, k) => ({ id: `c${k}`, node: c.node, pseudo: c.pseudo, prop: c.type === 'CSSTransition' ? c.name : null, t: c.startTime + (c.delay ?? 0), dur: c.duration, exact: { via: c.type === 'CSSTransition' ? 'CSS transition' : `CSS animation "${c.name}"`, duration: Math.round(c.duration), delay: Math.round(c.delay ?? 0), easing: c.easing, iterations: c.iterations, keyframes: c.keyframes } })),
	];
	for (const o of kept) {
		const src = sources.find((x) => x.node === o.node && !o.pseudo === !x.pseudo && (!x.prop || x.prop === kebab(o.prop) || (o.prop === 'transform' && /^(transform|translate|scale|rotate)$/.test(x.prop)) || (/^(x|y)$/.test(o.prop) && /^(transform|translate|top|left)$/.test(x.prop))) && o.start >= x.t - 90 && o.start <= x.t + x.dur + 120);
		if (src) { o.exact = src.exact; o.exactId = src.id; }
	}
	return { phases: phases.map((p) => ({ label: p.label, ms: Math.round(p.end - p.t) })), motions: kept, loops };
}
const kebab = (p) => p.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

// ---------------------------------------------------------------- recording

/**
 * Replay a person against the pick at `elPath` on `url` in a Chrome of its own and record how it moves.
 * `safeClick`: release the press on the element too (a toggle, a tab), never for links or form buttons.
 */
export async function recordMotion({ url, elPath, dir, safeClick = false, log = () => {} }) {
	const { page, close } = await launch({ width: 1440, height: 900 });
	const frames = [];
	try {
		await page.send('Animation.enable');
		const css = [];
		const pendingCss = [];
		page.on('Animation.animationStarted', (e) => pendingCss.push(e.animation));
		const assets = new Set();
		page.on('Network.responseReceived', (e) => { const u = e.response.url; if (/\.(lottie|riv|splinecode)(\?|$)/i.test(u) || (/\.json(\?|$)/i.test(u) && /lottie|anim/i.test(u))) assets.add(u); });
		await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${hooks.toString()})(${JSON.stringify(elPath)})` });
		page.on('Page.screencastFrame', (e) => { frames.push({ ts: e.metadata.timestamp * 1000, data: e.data }); page.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {}); });
		await page.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 });
		const loaded = page.once('Page.loadEventFired', 45_000).catch(() => null);
		await page.send('Page.navigate', { url });
		await loaded;
		await page.eval('window.__spRec?.mark("load")').catch(() => {});
		// load: watch it arrive
		const t0 = Date.now();
		while (Date.now() - t0 < 12_000 && !(await page.eval('window.__spRec?.found != null').catch(() => false))) await wait(100);
		if (!(await page.eval('window.__spRec?.found != null').catch(() => false))) return null;
		await wait(3200);
		const where = () => page.eval(`(() => { const e = document.querySelector('[data-sp-m="0"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, vh: innerHeight, vw: innerWidth, sy: scrollY }; })()`);
		let b = await where();
		if (!b) return null;
		// scroll: from above it (or past it and back, when it is on screen at the top) with the wheel, like a person
		const wheel = async (dy) => { await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 720, y: 450, deltaX: 0, deltaY: dy }); await wait(45); };
		const centre = b.y + b.h / 2 - b.vh / 2;
		if (b.sy + b.y > b.vh * 0.9) {
			await page.eval('window.scrollTo(0, Math.max(0, document.querySelector(\'[data-sp-m="0"]\').getBoundingClientRect().top + scrollY - innerHeight * 1.5))');
			await wait(500);
			await page.eval('window.__spRec.mark("scroll")');
			b = await where();
			for (let k = 0; k < 70 && b && b.y + b.h / 2 > b.vh / 2 + 60; k++) { await wheel(100); if (k % 3 === 2) b = await where(); }
		} else {
			await page.eval('window.__spRec.mark("scroll")');
			for (let k = 0; k < 9; k++) await wheel(100);
			await wait(300);
			for (let k = 0; k < 9; k++) await wheel(-100);
			if (centre > 0 && (await where())?.y > b.vh) await page.eval(`window.scrollBy(0, ${Math.round(centre)})`);
		}
		await wait(900);
		// idle: loops and timers
		await page.eval('window.__spRec.mark("idle")');
		await wait(2600);
		b = await where();
		if (!b) return null;
		const cx = b.x + Math.min(b.w, b.vw) / 2, cy = Math.min(b.vh - 4, Math.max(4, b.y + b.h / 2));
		const move = (x, y) => page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y) });
		await move(4, 4);
		await wait(200);
		// hover: the pointer comes in
		await page.eval('window.__spRec.mark("hover")');
		for (let k = 1; k <= 6; k++) { await move(4 + (cx - 4) * k / 6, 4 + (cy - 4) * k / 6); await wait(16); }
		await wait(1100);
		// the pointer moves across it: tilts, magnets, spotlights
		await page.eval('window.__spRec.mark("pointer")');
		const L = Math.max(4, b.x + 6), Rr = Math.min(b.vw - 4, b.x + b.w - 6), T = Math.max(4, b.y + 6), B = Math.min(b.vh - 4, b.y + b.h - 6);
		for (let k = 0; k <= 20; k++) { await move(L + (Rr - L) * k / 20, cy); await wait(24); }
		for (let k = 0; k <= 20; k++) { await move(cx, T + (B - T) * k / 20); await wait(24); }
		await move(cx, cy);
		await wait(500);
		// leave
		await page.eval('window.__spRec.mark("leave")');
		for (let k = 1; k <= 6; k++) { await move(cx + (4 - cx) * k / 6, cy + (4 - cy) * k / 6); await wait(16); }
		await wait(1000);
		// press (and click where that is safe)
		for (let k = 1; k <= 4; k++) { await move(4 + (cx - 4) * k / 4, 4 + (cy - 4) * k / 4); await wait(16); }
		await wait(500);
		await page.eval('window.__spRec.mark("press")');
		await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(cx), y: Math.round(cy), button: 'left', clickCount: 1 });
		await wait(450);
		if (safeClick) {
			await page.eval('window.__spRec.mark("click")');
			await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(cx), y: Math.round(cy), button: 'left', clickCount: 1 });
			await wait(1200);
		} else {
			await move(4, 4);
			await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 4, y: 4, button: 'left', clickCount: 1 });
			await wait(500);
		}
		await page.eval('window.__spRec.mark("end")');
		await page.send('Page.stopScreencast').catch(() => {});
		const rec = await page.eval('window.__spRec.dump()');
		if (process.env.SITE_PROMPT_DEBUG) writeFileSync(path.join(dir, 'recording.json'), JSON.stringify(rec));
		// Chrome's own record of CSS and Web Animations, mapped to the pick's elements
		for (const a of pendingCss) {
			const s = a.source ?? {};
			if (!s.backendNodeId) continue;
			let node = null, pseudo = false;
			try {
				const { object } = await page.send('DOM.resolveNode', { backendNodeId: s.backendNodeId });
				const r = await page.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: 'function () { const e = this.nodeType === 1 && this.getAttribute ? this : null; const p = !e && this.parentElement; const x = e || p; return x && x.getAttribute ? [x.getAttribute("data-sp-m"), !e] : null; }', returnByValue: true });
				const v = r.result.value;
				if (v && v[0] != null) { node = +v[0]; pseudo = v[1]; }
			} catch {}
			if (node == null) continue;
			css.push({ node, pseudo, type: a.type, name: a.name, startTime: a.startTime, delay: s.delay, duration: s.duration, easing: s.easing, iterations: s.iterations, keyframes: s.keyframesRule?.keyframes?.map((k) => `${k.offset} ${k.easing}`) });
		}
		const result = analyse(rec, { css });
		result.libs = Object.fromEntries(Object.entries(rec.libs).filter(([, v]) => v));
		result.gsap = rec.gsap;
		result.waapi = rec.waapi;
		result.css = css;
		result.assets = [...assets];
		result.desc = rec.desc;
		// key frames of the biggest moves
		result.filmstrip = await filmstrip({ rec, result, frames, dir }).catch(() => null);
		writeFileSync(path.join(dir, 'motion.json'), JSON.stringify({ ...result, filmstrip: result.filmstrip ? 'motion.png' : null }, null, 1));
		return result;
	} finally {
		close();
	}
}

async function filmstrip({ rec, result, frames, dir }) {
	if (!frames.length) return null;
	const wallOf = (t) => rec.wall - (rec.now - t);
	const order = ['hover', 'press', 'click', 'scroll', 'load', 'pointer', 'idle', 'leave'];
	const groups = [];
	for (const trig of order) {
		const loopKeys = new Set(result.loops.map((l) => `${l.node}${l.pseudo}|${l.prop}`));
		const onScreen = (t) => { const r = nearest(rec.root, t); return r && r[2] < 900 && r[2] + r[4] > 0; };
		const ms = result.motions.filter((m) => m.trigger === trig && m.duration > 40 && !m.scrollLinked && !loopKeys.has(`${m.node}${m.pseudo}|${m.prop}`) && onScreen(m.start + m.duration / 2));
		if (!ms.length) continue;
		const t0 = Math.min(...ms.map((m) => m.start)), t1 = Math.max(...ms.map((m) => m.start + m.duration));
		groups.push({ trig, t0: t0 - 30, t1: Math.min(t1 + 40, t0 + 2500) });
		if (groups.length >= 4) break;
	}
	if (!groups.length) return null;
	const rows = [];
	for (const g of groups) {
		const cells = [];
		for (let k = 0; k < 6; k++) {
			const t = g.t0 + (g.t1 - g.t0) * k / 5;
			const w = wallOf(t);
			const f = frames.reduce((a, b) => (Math.abs(b.ts - w) < Math.abs(a.ts - w) ? b : a));
			const r = nearest(rec.root, t);
			if (!r) continue;
			cells.push({ data: f.data, x: Math.max(0, r[1] - 16), y: Math.max(0, r[2] - 16), w: Math.min(1440, r[3] + 32), h: Math.min(900, r[4] + 32), ms: Math.round(t - g.t0) });
		}
		rows.push({ label: g.trig, cells });
	}
	const cw = Math.max(...rows.flatMap((r) => r.cells.map((c) => c.w))), ch = Math.max(...rows.flatMap((r) => r.cells.map((c) => c.h)));
	const scale = Math.min(1, 260 / cw, 220 / ch);
	const html = `<!doctype html><html><head><meta charset="utf-8"><style>
		body{margin:0;background:#fafafa;font:500 12px -apple-system,system-ui,sans-serif;color:#52525b;-webkit-font-smoothing:antialiased}
		.row{display:flex;align-items:flex-start;gap:10px;padding:14px 18px;border-bottom:1px solid #ececef}
		.lab{width:70px;padding-top:4px;font-weight:650;color:#18181b;text-transform:capitalize}
		.c{display:flex;flex-direction:column;gap:5px;align-items:flex-start}
		.f{overflow:hidden;border-radius:6px;box-shadow:0 0 0 1px rgba(0,0,0,.08);background:#fff}
	</style></head><body>${rows.map((r) => `<div class="row"><div class="lab">${r.label}</div>${r.cells.map((c) => `<div class="c"><div class="f" style="width:${Math.round(c.w * scale)}px;height:${Math.round(c.h * scale)}px;background:url(data:image/jpeg;base64,${c.data}) ${-Math.round(c.x * scale)}px ${-Math.round(c.y * scale)}px / ${Math.round(1440 * scale)}px ${Math.round(900 * scale)}px no-repeat"></div><span>${c.ms} ms</span></div>`).join('')}</div>`).join('')}</body></html>`;
	const file = path.join(dir, 'motion-strip.html');
	writeFileSync(file, html);
	const { page, close } = await launch({ width: 1800, height: 1200 });
	try {
		await page.send('Emulation.setDeviceMetricsOverride', { width: 1800, height: 1200, deviceScaleFactor: 2, mobile: false });
		await page.send('Page.navigate', { url: 'file://' + file });
		await wait(700);
		const b = await page.eval(`(() => { let w = 0, h = 0; for (const r of document.querySelectorAll('.row')) { const q = r.getBoundingClientRect(); w = Math.max(w, [...r.children].reduce((s, c) => Math.max(s, c.getBoundingClientRect().right), 0) + 18); h = q.bottom; } return { width: Math.ceil(w), height: Math.ceil(h) }; })()`);
		const r = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: b.width, height: b.height, scale: 1 }, captureBeyondViewport: true });
		writeFileSync(path.join(dir, 'motion.png'), Buffer.from(r.data, 'base64'));
		return 'motion.png';
	} finally {
		close();
	}
}

// ---------------------------------------------------------------- in words

const TRIGGER = { load: 'When the page loads', scroll: 'As it scrolls into view', idle: 'On its own (while nothing happens)', hover: 'On hover', pointer: 'As the pointer moves over it', leave: 'When the pointer leaves', press: 'While pressed', click: 'On click' };
const COMP = { x: 'x', y: 'y', z: 'z', scale: 'scale', rotate: 'rotate', rotateX: 'rotateX', rotateY: 'rotateY', v: '' };

function change(m) {
	if (m.from === m.to) return `${kebab(m.prop)} moves and comes back`;
	if (!m.changes?.length) return `${kebab(m.prop)} ${String(m.from).slice(0, 60)} → ${String(m.to).slice(0, 60)}`;
	if (['backgroundColor', 'color'].includes(m.prop)) return `${kebab(m.prop)} ${m.from} → ${m.to}`;
	if (m.prop === 'boxShadow' || m.prop === 'clipPath' || m.prop === 'filter' || m.prop === 'backgroundPosition') return `${kebab(m.prop)} ${String(m.from).slice(0, 80)} → ${String(m.to).slice(0, 80)}`;
	const base = ['transform', 'translate', 'scale', 'rotate'].includes(m.prop) ? '' : kebab(m.prop) + ' ';
	return m.changes.map((c) => `${base}${COMP[c.c] ? COMP[c.c] + ' ' : c.c === 'v' ? '' : c.c + ' '}${fmt(c.from, UNIT[c.c] ?? (m.prop === 'opacity' || c.c === 'scale' ? '' : 'px'))} → ${fmt(c.to, UNIT[c.c] ?? (m.prop === 'opacity' || c.c === 'scale' ? '' : 'px'))}`).join(', ').replace(/^(\S+) (?=\d|-)/, '$1 ');
}
function curve(m) {
	if (m.exact) return `${m.exact.duration != null ? `${m.exact.duration} ms` : `${m.duration} ms`}${m.exact.delay ? `, after a ${m.exact.delay} ms delay` : ''}, ${m.exact.easing ?? 'linear'} (exact, from the page's ${m.exact.via}${m.exact.iterations && m.exact.iterations !== 1 ? `, ${m.exact.iterations === Infinity || m.exact.iterations === null ? 'repeating' : `${m.exact.iterations} times`}` : ''})`;
	if (m.spring) return `a spring: stiffness ${m.spring.stiffness}, damping ${m.spring.damping}, mass 1 (overshoots ${m.overshoot}%, settles in ${m.duration} ms; measured)`;
	if (m.bezier) return `${m.duration} ms, cubic-bezier(${m.bezier.c.join(', ')})${m.bezier.name ? ` (${m.bezier.name})` : ''} (measured, ${fmt(m.bezier.err * 100)}% off the fitted curve)`;
	return m.frames <= 1 ? 'changes at once, no animation' : `${m.duration} ms`;
}
const who = (m, desc) => `.c${m.node}${m.pseudo}${desc?.[m.node] ? ` (${desc[m.node]})` : ''}`;

/** The "## Motion" section of a prompt or lesson. */
export function motionMarkdown(mo, { short = false } = {}) {
	if (!mo) return '';
	const L = [];
	L.push('## Motion and interaction');
	L.push('Recorded by replaying a person on the live page (load, scroll it into view, wait, hover, move across it, leave, press). Times in ms; delays are from the moment of the trigger.');
	const libs = Object.keys(mo.libs ?? {});
	if (libs.length) L.push(`Seen on the page: ${libs.map((k) => (k === 'gsap' && mo.libs.gsap !== true ? `GSAP ${mo.libs.gsap}` : k === 'scrollTrigger' ? 'ScrollTrigger' : k === 'framer' ? 'Framer' : k === 'lenis' ? 'Lenis smooth scroll' : k === 'aos' ? 'AOS scroll reveals' : k)).join(', ')}.`);
	L.push('');
	const desc = mo.desc;
	const loopKeys = new Set(mo.loops.map((l) => `${l.node}${l.pseudo}|${l.prop}`));
	const groups = new Map();
	for (const m of mo.motions) {
		if (['idle', 'load', 'scroll'].includes(m.trigger) && loopKeys.has(`${m.node}${m.pseudo}|${m.prop}`)) continue;
		if (m.frames <= 1 && !['hover', 'press', 'click', 'leave'].includes(m.trigger)) continue;
		(groups.get(m.trigger) ?? groups.set(m.trigger, []).get(m.trigger)).push(m);
	}
	let any = false;
	for (const trig of ['load', 'scroll', 'idle', 'hover', 'pointer', 'leave', 'press', 'click']) {
		const ms = groups.get(trig);
		if (!ms?.length) continue;
		any = true;
		L.push(`### ${TRIGGER[trig]}`);
		const linked = ms.filter((m) => m.scrollLinked), follows = ms.filter((m) => m.follows), timed = ms.filter((m) => !m.scrollLinked && !m.follows);
		for (const m of linked) L.push(`- ${who(m, desc)}: ${change(m)}, tied to the scroll position (not to time): it moves while its top goes from ${fmt(m.scrollLinked.fromTop)}px to ${fmt(m.scrollLinked.toTop)}px from the top of the window, and stops when the scrolling stops.`);
		for (const m of follows) L.push(`- ${who(m, desc)}: follows the pointer on the ${m.follows.axis} axis, ${COMP[m.comp] ?? m.comp} from ${fmt(m.follows.atStart, UNIT[m.comp] ?? '')} at the ${m.follows.axis === 'x' ? 'left' : 'top'} edge to ${fmt(m.follows.atEnd, UNIT[m.comp] ?? '')} at the ${m.follows.axis === 'x' ? 'right' : 'bottom'} edge.`);
		const lines = new Map();
		for (const m of timed.sort((a, b) => a.start - b.start)) {
			const k = m.exactId ? `${m.node}${m.pseudo}#${m.exactId}` : `${m.node}${m.pseudo}@${Math.round(m.delay / 40)}`;
			const prev = lines.get(k);
			if (prev) prev.parts.push(change(m));
			else lines.set(k, { m, parts: [change(m)] });
		}
		const list = [...lines.values()].slice(0, short ? 8 : 24);
		for (const { m, parts: p } of list) L.push(`- ${who(m, desc)}: ${p.join('; ')}, ${curve(m)}${m.delay > 20 && !m.exact?.delay ? `, starting ${m.delay} ms after the ${trig === 'scroll' ? 'scroll begins' : trig}` : ''}.`);
		// stagger: the same move on siblings, started at even steps
		const starts = list.map((x) => x.m).filter((m) => m.prop === list[0]?.m.prop).map((m) => m.start).sort((a, b) => a - b);
		if (starts.length >= 3) {
			const gaps = starts.slice(1).map((s, k) => s - starts[k]), mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
			if (mean > 20 && gaps.every((g) => Math.abs(g - mean) < Math.max(25, mean * 0.25))) L.push(`- These start one after another, about ${Math.round(mean)} ms apart (a stagger).`);
		}
		L.push('');
	}
	if (mo.loops.length) {
		any = true;
		L.push('### Looping');
		for (const l of mo.loops.slice(0, 10)) {
			const css = mo.css.find((c) => c.node === l.node && c.type === 'CSSAnimation');
			L.push(`- ${who(l, desc)}: ${kebab(l.prop)} ${l.continuous ? 'keeps moving the whole time' : `repeats every ${l.period} ms (each move ${l.duration} ms)`}${css ? `: CSS animation "${css.name}", ${Math.round(css.duration)} ms a cycle, ${css.iterations == null || css.iterations === Infinity || css.iterations > 50 ? 'forever' : `${css.iterations} times`}${css.keyframes?.length ? `, keyframes at ${css.keyframes.map((k) => k.replace(/^(\S+) (.*)$/, (x, o, e) => `${/%/.test(o) ? o : `${Math.round(o * 100)}%`} (${e})`)).join(', ')}` : ''}${css.easing && css.easing !== 'linear' ? `, overall ${css.easing}` : ''}` : ''}.`);
		}
		L.push('');
	}
	if (mo.gsap?.length) {
		any = true;
		L.push('### GSAP, exactly as the page calls it');
		for (const g of mo.gsap.slice(0, 12)) L.push(`- ${g.m}(${g.sel ? `"${g.sel}"` : 'element'} → ${g.nodes.map((n) => `.c${n}`).join(', ')}, ${JSON.stringify(g.vars).slice(0, 300)}${g.from ? `, from ${JSON.stringify(g.from).slice(0, 200)}` : ''})`);
		L.push('');
	}
	if (mo.waapi?.length) {
		any = true;
		L.push('### element.animate, exactly as the page calls it');
		for (const w of mo.waapi.slice(0, 12)) L.push(`- .c${w.node}.animate(${JSON.stringify(w.keyframes).slice(0, 300)}, ${JSON.stringify(w.options).slice(0, 200)})`);
		L.push('');
	}
	if (mo.assets?.length) { L.push(`Animation files it loads (use them as they are): ${mo.assets.slice(0, 6).join(', ')}`); L.push(''); }
	if (!any) { L.push('Nothing moved: no entrance, scroll, hover, pointer or press motion on this element.'); L.push(''); return L.join('\n'); }
	if (!short) {
		L.push('### How to build the motion');
		L.push('- Keep every duration, delay and curve above. A cubic-bezier goes straight into `transition` / `animation` timing functions; a spring goes into Motion / Framer Motion as `{ type: "spring", stiffness, damping, mass }`.');
		if (groups.get('scroll')?.some((m) => !m.scrollLinked)) L.push('- "As it scrolls into view" moves are reveals: start them once when it enters the viewport (IntersectionObserver, or Motion\'s whileInView / inView), not on every scroll.');
		if (groups.get('scroll')?.some((m) => m.scrollLinked)) L.push('- Moves tied to the scroll position: CSS scroll-driven animations (`animation-timeline: view()`) or Motion\'s useScroll + useTransform, mapped over the same range.');
		if (groups.get('pointer')?.some((m) => m.follows)) L.push('- Pointer-following: on pointermove, map the pointer\'s position inside the element (-1 to 1) to the values above; ease toward them (a short transition or a spring) so it does not jitter; reset on leave.');
		if (mo.motions.some((m) => m.exact)) L.push('- Lines marked exact come straight from the page: copy them as given.');
		if (mo.filmstrip) L.push('- motion.png shows key frames of the main moves, left to right in time: match them.');
		L.push('');
	}
	return L.join('\n');
}
