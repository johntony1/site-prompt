// Break it down, on the site itself, drawn like a designer's spec sheet: the picked element lifts off the page where
// it sits and splits into white layers in 3D on a light canvas. Labels down the left name each layer (a leader line
// runs to the one you are on); a card on the right lists what it is made of (fills with swatches, corners, shadows,
// tilt, overhang, how and when it moves) with Copy prompt for that layer alone. Copy whole thing copies the full
// prompt. Hover a layer or its label, drag to turn, Spread / Flatten, Esc puts it back.

/** In the page. window.__spView = { path, title, size, offset, clip, layers: [{ n, name, specs, prompt, css, png }], all }. */
export function viewer() {
	const V = window.__spView;
	if (!V) return;
	document.querySelector('site-prompt-view')?.remove();
	window.__spViewerOpen = true;
	const host = document.createElement('site-prompt-view');
	host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647';
	const root = host.attachShadow({ mode: 'open' });
	const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
	const n = V.layers.length;
	const pad2 = (k) => String(k).padStart(2, '0');
	root.innerHTML = `<style>
		:host{all:initial}
		*{box-sizing:border-box;margin:0;font-family:"Inter Variable",Inter,ui-sans-serif,-apple-system,"SF Pro Text",system-ui,sans-serif;-webkit-font-smoothing:antialiased;letter-spacing:-.006em}
		.v{--ink:#f7f8f8;--ink2:#d0d3d9;--muted:#8a8f98;--faint:#5c6068;--line:rgba(255,255,255,.08);--line2:rgba(255,255,255,.12);--panel:#131315;--slab:#f4f4f5;--slabline:#d4d4d8;--blue:#2b64f8;--blue2:#3d7bff;--mono:"JetBrains Mono","SF Mono",ui-monospace,Menlo,monospace}
		.canvas{position:fixed;inset:0;background-color:rgba(9,9,11,.94);background-image:radial-gradient(rgba(255,255,255,.07) 1px,transparent 1.2px);background-size:22px 22px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);opacity:0;transition:opacity .45s ease;cursor:grab}
		.on .canvas{opacity:1}
		.canvas.drag{cursor:grabbing}
		.stage{position:fixed;perspective:2800px;pointer-events:none}
		.stack{position:absolute;transform-style:preserve-3d;transform-origin:50% 50%;transition:transform 1s cubic-bezier(.2,.8,.2,1)}
		.stack.fast{transition:transform .1s linear}
		.plane{position:absolute;inset:0;transform-style:preserve-3d;border-radius:14px;transition:transform 1s cubic-bezier(.2,.8,.2,1),opacity .25s ease}
		.plane .slab,.plane .edge{position:absolute;inset:0;border-radius:inherit;transition:box-shadow .25s ease,background-color .25s ease,opacity .4s ease;opacity:0}
		.on .plane .slab,.on .plane .edge{opacity:1}
		.plane .slab{background:var(--slab);box-shadow:0 0 0 1px var(--slabline),0 1px 0 #fff inset}
		.plane .edge{transform:translateZ(-7px);background:#c9c9cf;box-shadow:0 0 0 1px #a1a1aa,0 30px 50px -20px rgba(0,0,0,.6)}
		.plane img{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;transform:translateZ(.5px)}
		.plane .tag{position:absolute;left:10px;top:10px;height:20px;padding:0 7px;border-radius:6px;background:#fff;color:#71717a;font:600 10.5px/20px var(--mono);box-shadow:0 0 0 1px #d4d4d8;opacity:0;transform:translateZ(1px);transition:opacity .3s ease}
		.on .plane .tag{opacity:1}
		.pin{position:absolute;width:1px;height:1px}
		.pin.l{left:0;top:50%}.pin.r{right:0;top:50%}
		.focus .plane{opacity:.28}
		.focus .plane.hot{opacity:1}
		.plane.hot .slab{box-shadow:0 0 0 1.5px var(--blue2),0 0 0 6px rgba(61,123,255,.12)}
		.plane.hot .edge{background:#9db8fb;box-shadow:0 0 0 1.5px var(--blue2),0 26px 40px -24px rgba(43,100,248,.35)}
		.plane.hot .tag{background:var(--blue);color:#fff;box-shadow:none}
		.head{position:fixed;left:32px;top:28px;opacity:0;transform:translateY(-6px);transition:opacity .4s ease .25s,transform .5s cubic-bezier(.2,.8,.2,1) .25s}
		.on .head{opacity:1;transform:none}
		.head small{font:500 10.5px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--faint)}
		.head h2{font-size:19px;font-weight:620;color:var(--ink);letter-spacing:-.015em;margin-top:8px}
		.head p{font-size:12.5px;color:var(--muted);margin-top:4px}
		.labels{position:fixed;left:32px;display:flex;flex-direction:column;gap:2px;opacity:0;transition:opacity .4s ease .45s}
		.on .labels{opacity:1}
		.label{display:flex;align-items:center;gap:10px;height:30px;padding-right:10px;cursor:default;font:500 11px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--faint);white-space:nowrap;transition:color .15s ease}
		.label b{font-weight:500;color:var(--faint);transition:color .15s ease}
		.label:hover,.label.hot{color:var(--ink)}
		.label.hot b{color:var(--blue2)}
		svg.lines{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
		svg.lines path{fill:none;stroke:var(--ink2);stroke-width:1}
		svg.lines path.card{stroke:var(--muted);stroke-dasharray:3 3}
		svg.lines circle{fill:#09090b;stroke:var(--ink);stroke-width:1.25}
		svg.lines circle.card{stroke:var(--faint)}
		.spec{position:fixed;right:28px;top:120px;width:330px;background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,0) 40%),var(--panel);border-radius:14px;box-shadow:0 0 0 1px var(--line),0 0 0 1px rgba(0,0,0,.55),0 1px 0 rgba(255,255,255,.04) inset,0 24px 48px -12px rgba(0,0,0,.6);opacity:0;transition:opacity .35s ease .5s,top .35s cubic-bezier(.2,.8,.2,1)}
		.on .spec{opacity:1}
		.spec .ch{display:flex;align-items:center;gap:9px;padding:14px 16px 10px}
		.spec .ch i{font:600 10.5px/20px var(--mono);font-style:normal;height:20px;padding:0 7px;border-radius:6px;background:var(--blue);color:#fff}
		.spec .ch b{font-size:14px;font-weight:620;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
		.spec .rows{padding:2px 16px 8px}
		.spec .row{display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:30px;font-size:12.5px;border-top:1px solid rgba(255,255,255,.05)}
		.spec .row:first-child{border-top:0}
		.spec .row span{color:var(--muted);white-space:nowrap}
		.spec .row em{font-style:normal;color:var(--ink);font-weight:500;display:flex;align-items:center;gap:7px;min-width:0}
		.spec .row em u{text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:190px}
		.spec .row em s{width:12px;height:12px;border-radius:50%;flex:none;box-shadow:0 0 0 1px rgba(255,255,255,.25) inset}
		.spec .row em s.g{width:26px;border-radius:4px}
		.spec .row.wait em{color:var(--faint)}
		.spec .acts{display:flex;gap:6px;padding:10px 12px 12px;border-top:1px solid var(--line)}
		.b{appearance:none;border:0;height:30px;padding:0 12px;border-radius:7px;font-size:12.5px;font-weight:550;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;color:var(--ink2);background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px var(--line2);transition:background .12s ease,color .12s ease}
		.b:hover{background:rgba(255,255,255,.08);color:var(--ink)}
		.b.p{position:relative;isolation:isolate;overflow:hidden;color:#fff;border-radius:5px;background:linear-gradient(rgb(50,117,255),rgb(40,93,245));box-shadow:0 1px 1px rgba(20,31,87,.2),0 2px 4px -2px rgba(20,31,87,.4),0 0 0 1px rgb(43,100,248),inset 0 1px .5px rgba(255,255,255,.13)}
		.b.p:after{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;background:rgb(62,113,246);opacity:0;transition:opacity .16s ease}
		.b.p:hover:after{opacity:1}
		.b.done{color:#4cb782}
		.b.p.done{color:#fff}
		.bar{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);display:flex;align-items:center;gap:6px;padding:6px;border-radius:13px;background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,0) 40%),var(--panel);box-shadow:0 0 0 1px var(--line),0 0 0 1px rgba(0,0,0,.55),0 24px 48px -12px rgba(0,0,0,.6);opacity:0;transition:opacity .4s ease .55s}
		.on .bar{opacity:1}
		.bar label{display:flex;align-items:center;gap:8px;padding:0 8px 0 10px;font-size:12px;color:var(--muted)}
		.bar input{width:110px;accent-color:#3d7bff}
		.bar .sep{width:1px;height:18px;background:var(--line);margin:0 2px}
		.bar kbd{font:500 10.5px/1 var(--mono);color:var(--muted);padding:3px 5px;border-radius:4px;box-shadow:inset 0 0 0 1px var(--line)}
	</style>
	<div class="v">
		<div class="canvas"></div>
		<div class="stage"><div class="stack">${V.layers.map((l, k) => `<div class="plane" data-k="${k}"><div class="edge"></div><div class="slab"></div>${l.png ? `<img src="data:image/png;base64,${l.png}">` : ''}<span class="tag">${pad2(l.n)}</span><i class="pin l"></i><i class="pin r"></i></div>`).join('')}</div></div>
		<svg class="lines"><path class="lab" d=""/><circle class="lab" r="3" cx="-9" cy="-9"/><path class="card" d=""/><circle class="card" r="3" cx="-9" cy="-9"/></svg>
		<div class="head"><small>Breakdown</small><h2>${esc(V.title)}</h2><p>${n} layers · hover one to inspect · drag to turn</p></div>
		<div class="labels">${V.layers.slice().reverse().map((l) => `<div class="label" data-k="${l.n - 1}"><b>${pad2(l.n)}</b>${esc(l.name.replace(/ \(layer-\d+\.\w+\)/, ''))}</div>`).join('')}</div>
		<div class="spec"></div>
		<div class="bar"><label>Spread <input type="range" min="0" max="100" value="60"></label><button class="b" data-a="flat">Flatten</button><span class="sep"></span><button class="b p" data-a="all">Copy whole thing</button><button class="b" data-a="close">Close <kbd>esc</kbd></button></div>
	</div>`;
	document.documentElement.appendChild(host);
	const $ = (s) => root.querySelector(s);
	const v = $('.v'), canvas = $('.canvas'), stage = $('.stage'), stack = $('.stack'), card = $('.spec'), labelsBox = $('.labels');
	const planes = [...root.querySelectorAll('.plane')], labels = [...root.querySelectorAll('.label')];
	const [labPath, labDot, cardPath, cardDot] = [...root.querySelectorAll('svg.lines > *')];
	// each slab hugs what its layer draws: the bounding box of the picture's visible pixels
	planes.forEach((p) => {
		const img = p.querySelector('img');
		if (!img) return;
		const fit = () => {
			const w = img.naturalWidth, h = img.naturalHeight;
			if (!w || !h) return;
			const c = document.createElement('canvas'); c.width = w; c.height = h;
			const g = c.getContext('2d'); g.drawImage(img, 0, 0);
			const d = g.getImageData(0, 0, w, h).data;
			let x0 = w, y0 = h, x1 = -1, y1 = -1;
			for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (d[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
			if (x1 < 0) return;
			const P = 10, box = { left: Math.max(0, x0 - P) / w * 100 + '%', top: Math.max(0, y0 - P) / h * 100 + '%', width: (Math.min(w, x1 + P) - Math.max(0, x0 - P)) / w * 100 + '%', height: (Math.min(h, y1 + P) - Math.max(0, y0 - P)) / h * 100 + '%' };
			for (const e of p.querySelectorAll('.slab, .edge')) Object.assign(e.style, { inset: 'auto', ...box });
			const tag = p.querySelector('.tag'); tag.style.left = `calc(${box.left} + 10px)`; tag.style.top = `calc(${box.top} + 10px)`;
			const L = p.querySelector('.pin.l'), R = p.querySelector('.pin.r');
			L.style.left = box.left; L.style.top = `calc(${box.top} + ${box.height} / 2)`;
			R.style.left = `calc(${box.left} + ${box.width})`; R.style.right = 'auto'; R.style.top = L.style.top;
		};
		p.__fit = fit;
	});
	// where the element is right now: the stack starts exactly over it, and the element itself lifts off
	const el = V.path && document.querySelector(V.path);
	let r = el?.getBoundingClientRect();
	if (!r || !r.width || r.bottom < 0 || r.top > innerHeight) { el?.scrollIntoView({ block: 'center' }); r = el?.getBoundingClientRect() ?? { left: (innerWidth - V.size.w) / 2, top: (innerHeight - V.size.h) / 2, width: V.size.w, height: V.size.h }; }
	const was = el ? el.style.visibility : '';
	if (el) el.style.visibility = 'hidden';
	Object.assign(stage.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
	Object.assign(stack.style, { left: V.offset.x + 'px', top: V.offset.y + 'px', width: V.clip.w + 'px', height: V.clip.h + 'px' });
	let rx = 0, rz = 0, spread = 0.6, flat = false, tx = 0, ty = 0, sc = 1;
	const gap = () => (flat ? 0 : spread * Math.max(56, Math.min(130, 700 / Math.max(1, n))));
	const apply = () => {
		stack.style.transform = `translate(${tx}px, ${ty}px) scale(${sc}) rotateX(${flat ? 0 : rx}deg) rotateZ(${flat ? 0 : rz}deg)`;
		planes.forEach((p, k) => { p.style.transform = `translateZ(${k * gap()}px)`; });
	};
	// the free space: between the labels on the left and the card on the right
	const space = () => ({ l: 260, r: innerWidth - 390, t: 110, b: innerHeight - 90 });
	const refit = () => {
		let u = null;
		for (const p of planes) for (const q of [p.querySelector('.slab').getBoundingClientRect(), p.querySelector('.edge').getBoundingClientRect(), p.querySelector('.tag').getBoundingClientRect()]) u = u ? { l: Math.min(u.l, q.left), t: Math.min(u.t, q.top), r: Math.max(u.r, q.right), b: Math.max(u.b, q.bottom) } : { l: q.left, t: q.top, r: q.right, b: q.bottom };
		if (!u) return;
		const S = space(), k = Math.min(1.3, (S.r - S.l) / (u.r - u.l), (S.b - S.t) / (u.b - u.t));
		const ox = r.left + V.offset.x + V.clip.w / 2 + tx, oy = r.top + V.offset.y + V.clip.h / 2 + ty; // the stack's centre on screen
		const cx = (u.l + u.r) / 2, cy = (u.t + u.b) / 2;
		sc *= k;
		tx += (S.l + S.r) / 2 - (ox + (cx - ox) * k);
		ty += (S.t + S.b) / 2 - (oy + (cy - oy) * k);
		apply();
	};
	// the pictures decode first, the slabs take their shape, then it lifts off
	const ready = Promise.all(planes.map((p) => { const img = p.querySelector('img'); return img ? img.decode().then(() => p.__fit?.()).catch(() => {}) : null; }));
	ready.then(() => {
		// lift off: flat over the element, then turn and split. Where it ends up is measured first, with transitions off.
		const all = [stack, ...planes];
		all.forEach((e) => (e.style.transition = 'none'));
		rx = 55; rz = -40;
		apply(); refit(); refit();
		const target = { rx, rz, tx, ty, sc };
		rx = 0; rz = 0; tx = 0; ty = 0; sc = 1; flat = true;
		apply();
		stack.getBoundingClientRect();
		all.forEach((e) => (e.style.transition = ''));
		planes.forEach((p, k) => (p.style.transitionDelay = `${k * 40}ms`));
		requestAnimationFrame(() => requestAnimationFrame(() => {
			({ rx, rz, tx, ty, sc } = target);
			flat = false;
			v.classList.add('on');
			apply();
			setTimeout(() => { planes.forEach((p) => (p.style.transitionDelay = '')); setHot(n - 1); }, 1000 + n * 40);
		}));
	});
	// the labels: a column on the left, centred
	const h0 = labelsBox.getBoundingClientRect().height;
	labelsBox.style.top = Math.max(130, (innerHeight - h0) / 2) + 'px';
	// the card: what the layer is made of, and its prompt
	const swatch = (row) => (row.sw ? `<s class="${/gradient/.test(row.sw) ? 'g' : ''}" style="background:${esc(row.sw)}"></s>` : '');
	const copy = async (text, btn, label) => {
		let ok = false;
		try { await navigator.clipboard.writeText(text); ok = true; } catch {}
		if (!ok) { const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0'; root.appendChild(t); t.select(); try { ok = document.execCommand('copy'); } catch {} t.remove(); }
		btn.textContent = ok ? 'Copied ✓' : 'Could not copy';
		btn.classList.add('done');
		setTimeout(() => { btn.textContent = label; btn.classList.remove('done'); }, 1600);
		window.__spCopied = text;
	};
	let hot = null;
	const showCard = (k) => {
		const l = V.layers[k];
		card.innerHTML = `<div class="ch"><i>${pad2(l.n)}</i><b>${esc(l.name)}</b></div>
			<div class="rows">${l.specs.map((row) => `<div class="row${/recording/.test(row.v) ? ' wait' : ''}"><span>${esc(row.k)}</span><em>${swatch(row)}<u title="${esc(row.v)}">${esc(row.v)}</u></em></div>`).join('')}</div>
			<div class="acts"><button class="b p" data-c="prompt">Copy prompt</button><button class="b" data-c="css">Copy CSS</button></div>`;
		card.querySelector('[data-c=prompt]').addEventListener('click', (e) => copy(V.layers[k].prompt, e.currentTarget, 'Copy prompt'));
		card.querySelector('[data-c=css]').addEventListener('click', (e) => copy(V.layers[k].css || '/* no styles of its own */', e.currentTarget, 'Copy CSS'));
	};
	const lines = () => {
		if (hot == null) { labPath.setAttribute('d', ''); cardPath.setAttribute('d', ''); labDot.setAttribute('cx', -9); cardDot.setAttribute('cx', -9); return; }
		const lab = labels.find((x) => +x.dataset.k === hot).getBoundingClientRect();
		const pl = planes[hot].querySelector('.pin.l').getBoundingClientRect(), pr = planes[hot].querySelector('.pin.r').getBoundingClientRect();
		const x1 = lab.right + 8, y1 = lab.top + lab.height / 2;
		labPath.setAttribute('d', `M${x1},${y1} L${Math.max(x1 + 16, pl.left - 36)},${y1} L${pl.left},${pl.top}`);
		labDot.setAttribute('cx', pl.left); labDot.setAttribute('cy', pl.top);
		const c = card.getBoundingClientRect();
		const y2 = Math.min(c.bottom - 24, Math.max(c.top + 24, pr.top));
		cardPath.setAttribute('d', `M${pr.left},${pr.top} L${Math.min(c.left - 16, pr.left + 36)},${pr.top} L${c.left - 16},${y2} L${c.left},${y2}`);
		cardDot.setAttribute('cx', pr.left); cardDot.setAttribute('cy', pr.top);
	};
	const setHot = (k) => {
		if (k == null || k === hot) return;
		hot = k;
		v.classList.add('focus');
		planes.forEach((p, j) => p.classList.toggle('hot', j === k));
		labels.forEach((x) => x.classList.toggle('hot', +x.dataset.k === k));
		showCard(k);
		// the card follows the layer up and down
		const pr = planes[k].querySelector('.pin.r').getBoundingClientRect();
		const h = card.getBoundingClientRect().height || 320;
		card.style.top = Math.max(24, Math.min(innerHeight - h - 90, pr.top - h / 2)) + 'px';
	};
	labels.forEach((x) => x.addEventListener('mouseenter', () => setHot(+x.dataset.k)));
	// over the stack: the top-most plane under the pointer (a projected plane is a quad: test inside its corners)
	const inside = (q, x, y) => { let s = 0; for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]); if (c !== 0) { if (s && Math.sign(c) !== s) return false; s = Math.sign(c); } } return true; };
	const corners = (p) => {
		const m = new DOMMatrix(getComputedStyle(stack).transform).multiply(new DOMMatrix(getComputedStyle(p).transform));
		const W = V.clip.w, H = V.clip.h, b = stage.getBoundingClientRect(), ox = V.offset.x + W / 2, oy = V.offset.y + H / 2, P = 2800;
		return [[0, 0], [W, 0], [W, H], [0, H]].map(([x, y]) => { const pt = m.transformPoint(new DOMPoint(x - W / 2, y - H / 2, 0)); const ex = pt.x + ox, ey = pt.y + oy; const cxs = b.width / 2, cys = b.height / 2; const f = P / (P - pt.z); return [b.left + cxs + (ex - cxs) * f, b.top + cys + (ey - cys) * f]; });
	};
	canvas.addEventListener('mousemove', (e) => {
		if (drag) return;
		for (let k = planes.length - 1; k >= 0; k--) if (inside(corners(planes[k]), e.clientX, e.clientY)) { setHot(k); return; }
	});
	let drag = null;
	canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, rx, rz }; canvas.classList.add('drag'); stack.classList.add('fast'); canvas.setPointerCapture(e.pointerId); });
	canvas.addEventListener('pointermove', (e) => { if (!drag) return; rz = drag.rz + (e.clientX - drag.x) * 0.3; rx = Math.max(0, Math.min(85, drag.rx - (e.clientY - drag.y) * 0.3)); flat = false; apply(); });
	canvas.addEventListener('pointerup', () => { drag = null; canvas.classList.remove('drag'); stack.classList.remove('fast'); });
	const range = $('input[type=range]');
	range.addEventListener('input', () => { spread = range.value / 100; flat = false; apply(); });
	const flatBtn = $('[data-a=flat]');
	flatBtn.addEventListener('click', () => { flat = !flat; flatBtn.textContent = flat ? 'Spread out' : 'Flatten'; apply(); });
	$('[data-a=all]').addEventListener('click', (e) => copy(V.all || V.layers.map((l) => l.prompt).join('\n\n---\n\n'), e.currentTarget, 'Copy whole thing'));
	const loop = () => { if (!host.isConnected) return; lines(); requestAnimationFrame(loop); };
	requestAnimationFrame(loop);
	// when the motion arrives: new card rows and prompts, in place
	window.__spViewUpdate = (patch) => {
		if (patch.all) V.all = patch.all;
		(patch.layers ?? []).forEach((p, k) => { if (V.layers[k]) Object.assign(V.layers[k], p); });
		if (hot != null) showCard(hot);
	};
	// put it back: the layers fall back into the page, then the view goes
	const close = () => {
		removeEventListener('keydown', onKey, true);
		hot = null;
		v.classList.remove('on', 'focus');
		planes.forEach((p, k) => (p.style.transitionDelay = `${(n - 1 - k) * 30}ms`));
		tx = 0; ty = 0; sc = 1; flat = true;
		apply();
		setTimeout(() => { if (el) el.style.visibility = was; host.remove(); window.__spViewerOpen = false; }, 1050);
	};
	const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
	addEventListener('keydown', onKey, true);
	$('[data-a=close]').addEventListener('click', close);
	window.__spViewClose = close;
}
