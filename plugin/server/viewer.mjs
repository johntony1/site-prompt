// Break it down, on the site itself: the picked element lifts off the page where it sits, splits into its layers in
// 3D, and a panel names each layer and how it is made. Hover a layer or its row to light it up (a line joins them),
// drag to turn the stack, spread or flatten it, Esc to put it back. Runs in the person's page, in its own shadow root.

/** In the page. window.__spView = { path, size, offset, clip, frame, layers: [{ n, name, how, png }], title }. */
export function viewer() {
	const V = window.__spView;
	if (!V) return;
	document.querySelector('site-prompt-view')?.remove();
	window.__spViewerOpen = true;
	const host = document.createElement('site-prompt-view');
	host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647';
	const root = host.attachShadow({ mode: 'open' });
	const brief = (h) => { const i = h.indexOf(': '); return i > 0 && h.length - i > 48 ? h.slice(0, i) : h; };
	const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
	root.innerHTML = `<style>${window.__spTheme || ''}
		.scrim{position:fixed;inset:0;background:rgba(9,9,11,0);backdrop-filter:blur(0px);-webkit-backdrop-filter:blur(0px);transition:background .6s ease,backdrop-filter .6s ease,-webkit-backdrop-filter .6s ease;cursor:grab}
		.on .scrim{background:rgba(9,9,11,.82);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
		.scrim.drag{cursor:grabbing}
		.stage{position:fixed;perspective:2600px;pointer-events:none}
		.stack{position:absolute;transform-style:preserve-3d;transform-origin:50% 50%;transition:transform 1.1s cubic-bezier(.2,.8,.2,1)}
		.stack.fast{transition:transform .12s linear}
		.plane{position:absolute;inset:0;transform-style:preserve-3d;border-radius:12px;transition:transform 1.1s cubic-bezier(.2,.8,.2,1),opacity .25s ease,box-shadow .25s ease,background-color .25s ease}
		.on .plane{box-shadow:0 0 0 1px rgba(255,255,255,.10);background:rgba(255,255,255,.025)}
		.plane img{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
		.plane .tag{position:absolute;left:-11px;top:-11px;width:22px;height:22px;border-radius:7px;background:var(--accent2);color:#fff;font:650 11px/22px var(--f, ui-sans-serif,-apple-system,system-ui,sans-serif);text-align:center;box-shadow:0 0 0 2px rgba(9,9,11,.9);opacity:0;transition:opacity .4s ease}
		.on .plane .tag{opacity:1}
		.dim .plane{opacity:.18}
		.dim .plane.hot{opacity:1;box-shadow:0 0 0 1.5px var(--accent),0 0 40px rgba(61,123,255,.35);background:rgba(61,123,255,.06)}
		.panel{position:fixed;top:20px;right:20px;bottom:84px;width:356px;border-radius:14px;display:flex;flex-direction:column;overflow:hidden;opacity:0;transform:translateX(16px);transition:opacity .45s ease .35s,transform .6s cubic-bezier(.2,.8,.2,1) .35s}
		.on .panel{opacity:1;transform:none}
		.ph{padding:16px 16px 12px}
		.ph h2{font-size:15px;font-weight:620;color:var(--text);letter-spacing:-.01em}
		.ph p{font-size:12px;color:var(--muted);margin-top:3px}
		.frame{margin:0 16px 10px;padding:9px 11px;border-radius:9px;background:rgba(255,255,255,.035);box-shadow:inset 0 0 0 1px var(--line);font-size:12px;line-height:1.45;color:var(--text2)}
		.frame b{display:block;font-size:11px;font-weight:600;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:.04em}
		.list{flex:1;overflow:auto;padding:4px 8px 12px}
		.row{display:grid;grid-template-columns:22px 1fr;gap:10px;padding:10px 8px;border-radius:10px;cursor:default;transition:background .15s ease}
		.row:hover,.row.hot{background:rgba(255,255,255,.05)}
		.row i{font-style:normal;width:22px;height:22px;border-radius:7px;background:rgba(255,255,255,.08);color:var(--text2);font-size:11px;font-weight:650;display:grid;place-items:center}
		.row.hot i{background:var(--accent2);color:#fff}
		.row b{display:block;font-size:13px;font-weight:590;color:var(--text);margin-bottom:2px}
		.row span{display:block;font-size:12px;line-height:1.45;color:var(--muted)}
		.row ul{display:none;margin:6px 0 0;padding:0;list-style:none}
		.row.hot ul{display:block}
		.row li{font-size:12px;line-height:1.45;color:var(--text2);padding:3px 0 3px 12px;position:relative}
		.row li:before{content:"";position:absolute;left:2px;top:10px;width:4px;height:4px;border-radius:50%;background:var(--accent)}
		.bar{left:50%;right:auto;bottom:20px;transform:translateX(-50%);opacity:0;transition:opacity .45s ease .5s}
		.on .bar{opacity:1}
		.bar label{display:flex;align-items:center;gap:8px;padding:0 10px;font-size:12px;color:var(--muted)}
		.bar input{width:120px;accent-color:#3d7bff}
		svg.lead{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
		svg.lead path{fill:none;stroke:var(--accent);stroke-width:1.25;stroke-dasharray:3 3}
		svg.lead circle{fill:var(--accent)}
		.hint{bottom:76px}
	</style>
	<div class="v">
	<div class="scrim"></div>
	<div class="stage"><div class="stack">${V.layers.map((l, k) => `<div class="plane" data-k="${k}"><img src="data:image/png;base64,${l.png}"><span class="tag">${l.n}</span></div>`).join('')}</div></div>
	<svg class="lead"><path d=""/><circle r="3" cx="-9" cy="-9"/></svg>
	<div class="panel surface">
		<div class="ph"><h2>${esc(V.title)}</h2><p>${V.layers.length} layers, bottom to top · hover one to see it</p></div>
		${V.frame?.length ? `<div class="frame"><b>Around it</b>${V.frame.map((f) => esc(brief(f))).join('<br>')}</div>` : ''}
		<div class="list">${V.layers.map((l, k) => `<div class="row" data-k="${k}"><i>${l.n}</i><div><b>${esc(l.name)}</b><span>${esc(brief(l.how.find((h) => !/^drawn by/.test(h)) ?? l.how[0] ?? ''))}</span><ul>${l.how.map((h) => `<li>${esc(h)}</li>`).join('')}</ul></div></div>`).join('')}</div>
	</div>
	<div class="bar surface"><label>Spread <input type="range" min="0" max="100" value="60"></label><span class="sep"></span><button class="btn" data-a="flat">Flatten</button><button class="btn" data-a="close">Close <kbd>esc</kbd></button></div>
	</div>`;
	document.documentElement.appendChild(host);
	const $ = (s) => root.querySelector(s);
	const container = $('.v'), stage = $('.stage'), stack = $('.stack'), planes = [...root.querySelectorAll('.plane')], rows = [...root.querySelectorAll('.row')];
	const path = $('svg.lead path'), dot = $('svg.lead circle'), scrim = $('.scrim'), range = $('input[type=range]');
	// where the element is on the page right now: the stack starts exactly over it
	const el = V.path && document.querySelector(V.path);
	let r = el?.getBoundingClientRect();
	if (!r || !r.width || r.bottom < 0 || r.top > innerHeight) {
		el?.scrollIntoView({ block: 'center' });
		r = el?.getBoundingClientRect() ?? { left: (innerWidth - V.size.w) / 2, top: (innerHeight - V.size.h) / 2, width: V.size.w, height: V.size.h };
	}
	Object.assign(stage.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
	// the element itself lifts off: hidden underneath while its layers are out, back when they return
	const was = el ? el.style.visibility : '';
	if (el) el.style.visibility = 'hidden';
	Object.assign(stack.style, { left: V.offset.x + 'px', top: V.offset.y + 'px', width: V.clip.w + 'px', height: V.clip.h + 'px' });
	const n = V.layers.length;
	let rx = 58, rz = -36, spread = 0.6, flat = false, tx = 0, ty = 0, sc = 1;
	const gap = () => (flat ? 0 : spread * Math.max(60, Math.min(150, 760 / Math.max(1, n))));
	const apply = () => {
		stack.style.transform = `translate(${tx}px, ${ty}px) scale(${sc}) rotateX(${flat ? 0 : rx}deg) rotateZ(${flat ? 0 : rz}deg)`;
		planes.forEach((p, k) => { p.style.transform = `translateZ(${k * gap()}px)`; });
	};
	// fit the stack in the space left of the panel
	const fit = () => {
		const W = innerWidth - 400, H = innerHeight - 110;
		const cx = 20 + W / 2, cy = 20 + H / 2;
		const ex = r.left + V.offset.x + V.clip.w / 2, ey = r.top + V.offset.y + V.clip.h / 2;
		const span = (V.clip.w + V.clip.h) * 0.62 + gap() * n * 0.8;
		sc = Math.min(1.25, Math.max(0.25, Math.min(W / ((V.clip.w + V.clip.h) * 0.85), H / span)));
		tx = cx - ex; ty = cy - ey;
	};
	const refit = () => {
		// measure what it really covers and nudge it into the free space
		let u = null;
		for (const p of planes) { const q = p.getBoundingClientRect(); u = u ? { l: Math.min(u.l, q.left), t: Math.min(u.t, q.top), r: Math.max(u.r, q.right), b: Math.max(u.b, q.bottom) } : { l: q.left, t: q.top, r: q.right, b: q.bottom }; }
		if (!u) return;
		const W = innerWidth - 400, H = innerHeight - 110, k = Math.min(1.15, (W - 40) / (u.r - u.l), (H - 20) / (u.b - u.t));
		sc *= k;
		tx += (20 + W / 2) - (u.l + u.r) / 2; ty += (20 + H / 2) - (u.t + u.b) / 2;
		apply();
	};
	// first exactly over the element, flat; then it lifts, turns and splits apart
	tx = 0; ty = 0; sc = 1;
	const target = { rx, rz };
	rx = 0; rz = 0;
	stack.style.transition = 'none';
	planes.forEach((p) => (p.style.transition = 'none'));
	apply();
	stack.getBoundingClientRect();
	stack.style.transition = '';
	planes.forEach((p) => (p.style.transition = ''));
	requestAnimationFrame(() => requestAnimationFrame(() => {
		rx = target.rx; rz = target.rz;
		fit();
		planes.forEach((p, k) => (p.style.transitionDelay = `${k * 45}ms`));
		container.classList.add('on');
		apply();
		setTimeout(() => { planes.forEach((p) => (p.style.transitionDelay = '')); refit(); }, 1100 + n * 45 + 150);
	}));
	// highlight: a layer and its row light up, a line joins them
	let hot = null;
	const lead = () => {
		if (hot == null) { path.setAttribute('d', ''); dot.setAttribute('cx', -9); return; }
		const t = planes[hot].querySelector('.tag').getBoundingClientRect(), row = rows[hot].getBoundingClientRect();
		const x1 = row.left - 6, y1 = row.top + 21, x2 = t.left + t.width / 2, y2 = t.top + t.height / 2;
		const mx = (x1 + x2) / 2;
		path.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
		dot.setAttribute('cx', x2); dot.setAttribute('cy', y2);
	};
	const setHot = (k) => {
		hot = k;
		container.classList.toggle('dim', k != null);
		planes.forEach((p, j) => p.classList.toggle('hot', j === k));
		rows.forEach((p, j) => p.classList.toggle('hot', j === k));
		lead();
	};
	rows.forEach((row, k) => { row.addEventListener('mouseenter', () => setHot(k)); row.addEventListener('mouseleave', () => setHot(null)); });
	// pointer over the stack: the nearest plane under it lights up
	scrim.addEventListener('mousemove', (e) => {
		if (drag) return;
		let best = null;
		for (let k = planes.length - 1; k >= 0; k--) { const q = planes[k].getBoundingClientRect(); if (e.clientX >= q.left && e.clientX <= q.right && e.clientY >= q.top && e.clientY <= q.bottom) { const tag = planes[k].querySelector('.tag').getBoundingClientRect(); const dd = Math.hypot(tag.left - e.clientX, tag.top - e.clientY); if (!best || dd < best.d) best = { k, d: dd }; } }
		setHot(best ? best.k : null);
	});
	// drag to turn it
	let drag = null;
	scrim.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, rx, rz }; scrim.classList.add('drag'); stack.classList.add('fast'); scrim.setPointerCapture(e.pointerId); });
	scrim.addEventListener('pointermove', (e) => { if (!drag) return; rz = drag.rz + (e.clientX - drag.x) * 0.3; rx = Math.max(0, Math.min(85, drag.rx - (e.clientY - drag.y) * 0.3)); flat = false; apply(); lead(); });
	scrim.addEventListener('pointerup', () => { drag = null; scrim.classList.remove('drag'); stack.classList.remove('fast'); });
	range.addEventListener('input', () => { spread = range.value / 100; flat = false; apply(); setTimeout(lead, 30); });
	const flatBtn = $('[data-a=flat]');
	flatBtn.addEventListener('click', () => { flat = !flat; flatBtn.textContent = flat ? 'Spread out' : 'Flatten'; apply(); setTimeout(lead, 1150); });
	let tick = 0;
	const loop = () => { if (!host.isConnected) return; if (hot != null && ++tick % 2 === 0) lead(); requestAnimationFrame(loop); };
	requestAnimationFrame(loop);
	// put it back: the layers fall back into the page, then the view goes
	const close = () => {
		removeEventListener('keydown', onKey, true);
		setHot(null);
		container.classList.remove('on');
		planes.forEach((p, k) => (p.style.transitionDelay = `${(n - 1 - k) * 35}ms`));
		tx = 0; ty = 0; sc = 1; flat = true;
		stack.style.transform = 'translate(0px, 0px) scale(1) rotateX(0deg) rotateZ(0deg)';
		planes.forEach((p) => (p.style.transform = 'translateZ(0px)'));
		setTimeout(() => { if (el) el.style.visibility = was; host.remove(); window.__spViewerOpen = false; }, 1150);
	};
	const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
	addEventListener('keydown', onKey, true);
	$('[data-a=close]').addEventListener('click', close);
	window.__spViewClose = close;
}
