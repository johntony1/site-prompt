// The picker that lives on the page (the person's own Chrome tab, or a window site-prompt opened): a small toolbar in
// the corner, a highlight that follows the pointer and says what it is over (Button, Text, Illustration, Section,
// Component), click to pick (with an optional note), then "Get prompts" hands the picks to the agent.
// Self-contained: Page.addScriptToEvaluateOnNewDocument installs it on every page the person visits in the session.

export function overlay() {
	if (window.__spOverlay) return;
	window.__spOverlay = true;
	const start = () => {
		if (!document.documentElement) return setTimeout(start, 30);
		const host = document.createElement('site-prompt-ui');
		host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647';
		const root = host.attachShadow({ mode: 'closed' });
		root.innerHTML = `<style>
			*{box-sizing:border-box;font-family:ui-sans-serif,-apple-system,"SF Pro Text",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
			.hl{position:fixed;pointer-events:none;border:1.5px solid #4f8cff;background:rgba(79,140,255,.07);border-radius:6px;display:none;transition:left 70ms,top 70ms,width 70ms,height 70ms}
			.chip{position:fixed;pointer-events:none;display:none;background:#4f8cff;color:#fff;font-size:11px;font-weight:600;line-height:1;padding:5px 7px;border-radius:6px;white-space:nowrap;letter-spacing:.01em}
			.chip i{font-style:normal;opacity:.75;font-weight:500;margin-left:6px}
			.badge{position:fixed;pointer-events:none;width:20px;height:20px;border-radius:50%;background:#4f8cff;color:#fff;font-size:11px;font-weight:700;display:grid;place-items:center;box-shadow:0 0 0 2px #fff,0 4px 10px rgba(0,0,0,.25)}
			.ring{position:fixed;pointer-events:none;border:1.5px solid #4f8cff;border-radius:6px}
			.bar{position:fixed;right:18px;bottom:18px;pointer-events:auto;display:flex;align-items:center;gap:6px;padding:6px;background:rgba(20,20,22,.9);backdrop-filter:blur(18px) saturate(1.4);-webkit-backdrop-filter:blur(18px) saturate(1.4);border:1px solid rgba(255,255,255,.08);border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.28),0 1px 0 rgba(255,255,255,.06) inset;color:#f4f4f5;font-size:13px;user-select:none}
			.mark{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(180deg,#5d97ff,#3b6fe0)}
			.mark svg{width:14px;height:14px}
			.btn{appearance:none;border:0;height:28px;padding:0 12px;border-radius:999px;font-size:13px;font-weight:550;color:#e4e4e7;background:transparent;cursor:pointer;display:flex;align-items:center;gap:6px}
			.btn:hover{background:rgba(255,255,255,.08)}
			.btn.on{background:rgba(79,140,255,.18);color:#9ec0ff}
			.btn.primary{background:#fff;color:#111}
			.btn.primary:hover{background:#e9e9ec}
			.btn[disabled]{opacity:.4;cursor:default;background:transparent;color:#e4e4e7}
			.count{min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:rgba(255,255,255,.14);font-size:11px;font-weight:700;display:grid;place-items:center}
			.status{padding:0 8px 0 4px;color:#a1a1aa;font-size:12px;white-space:nowrap}
			.pop{position:fixed;pointer-events:auto;width:272px;padding:12px;background:rgba(20,20,22,.94);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.08);border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.32);color:#f4f4f5;display:none}
			.pop .k{font-size:12px;color:#a1a1aa;margin-bottom:8px}
			.pop .k b{color:#f4f4f5;font-weight:600}
			.pop textarea{width:100%;height:64px;resize:none;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#f4f4f5;border-radius:9px;padding:8px 10px;font-size:13px;outline:none}
			.pop textarea:focus{border-color:#4f8cff}
			.pop .row{display:flex;justify-content:space-between;margin-top:10px}
			.hint{position:fixed;left:50%;bottom:72px;transform:translateX(-50%);pointer-events:none;background:rgba(20,20,22,.9);color:#e4e4e7;font-size:12.5px;padding:8px 12px;border-radius:999px;white-space:nowrap;transition:opacity .3s}
		</style>
		<div class="hl"></div><div class="chip"></div><div class="marks"></div>
		<div class="hint">Hover anything you like, click to pick it, then Get prompts</div>
		<div class="pop"><div class="k"></div><textarea placeholder="What do you like about it? (optional)"></textarea>
			<div class="row"><button class="btn" data-a="remove">Remove</button><button class="btn primary" data-a="done">Done</button></div></div>
		<div class="bar">
			<div class="mark"><svg viewBox="0 0 16 16" fill="none"><path d="M3 2.5l9.5 5-4 1.2-1.6 4.3L3 2.5z" fill="#fff"/></svg></div>
			<button class="btn on" data-a="pick">Pick</button>
			<span class="count">0</span>
			<button class="btn primary" data-a="send" disabled>Get prompts</button>
			<span class="status" hidden></span>
		</div>`;
		document.documentElement.appendChild(host);
		const $ = (s) => root.querySelector(s);
		const hl = $('.hl'), chip = $('.chip'), marks = $('.marks'), pop = $('.pop'), note = $('textarea'), hint = $('.hint');
		const pickBtn = $('[data-a=pick]'), sendBtn = $('[data-a=send]'), count = $('.count'), status = $('.status');
		let picking = true, cur = null, open = null, n = +(sessionStorage.getItem('__spN') || 0);
		const picks = [];
		setTimeout(() => (hint.style.opacity = '0'), 6000);

		const ours = (e) => e.composedPath().includes(host);
		const INLINE = new Set(['SPAN', 'STRONG', 'EM', 'B', 'I', 'A', 'BR', 'CODE', 'MARK', 'SMALL', 'SUP', 'SUB', 'U', 'S', 'ABBR', 'TIME', 'WBR']);
		const kindOf = (el) => {
			const tag = el.tagName.toLowerCase(), r = el.getBoundingClientRect(), cs = getComputedStyle(el);
			const text = (el.innerText || '').trim();
			if (['img', 'picture', 'svg', 'canvas', 'video', 'lottie-player', 'dotlottie-player', 'spline-viewer', 'rive-canvas', 'model-viewer'].includes(tag)) return 'illustration';
			if (cs.backgroundImage.includes('url(') && !text) return 'illustration';
			if (tag === 'button' || el.getAttribute('role') === 'button' || (tag === 'input' && /submit|button/.test(el.type)) || (tag === 'a' && r.width < 480 && r.height < 120 && (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.borderTopStyle !== 'none' || parseFloat(cs.borderTopLeftRadius) > 0 || cs.boxShadow !== 'none'))) return 'button';
			if (text && [...el.children].every((c) => INLINE.has(c.tagName)) && !el.querySelector('img,svg,video,canvas')) return 'text';
			if (r.width >= innerWidth * 0.75 && r.height >= 220) return 'section';
			return 'component';
		};
		const NAME = { illustration: 'Illustration', button: 'Button', text: 'Text', section: 'Section', component: 'Component' };
		const describe = (el) => {
			const r = el.getBoundingClientRect(), k = kindOf(el), cs = getComputedStyle(el);
			const extra = k === 'text' ? `${cs.fontFamily.split(',')[0].replace(/["']/g, '')} ${Math.round(parseFloat(cs.fontSize))}px ${cs.fontWeight}` : `${Math.round(r.width)}×${Math.round(r.height)}`;
			return { kind: k, label: `${NAME[k]}<i>${extra}</i>`, plain: `${NAME[k]} · ${extra}` };
		};
		const place = (box, el) => {
			const r = el.getBoundingClientRect();
			Object.assign(box.style, { display: 'block', left: r.left - 3 + 'px', top: r.top - 3 + 'px', width: r.width + 6 + 'px', height: r.height + 6 + 'px' });
			return r;
		};
		const show = () => {
			if (!cur || !picking) { hl.style.display = chip.style.display = 'none'; return; }
			const r = place(hl, cur);
			chip.innerHTML = describe(cur).label;
			Object.assign(chip.style, { display: 'block', left: Math.max(6, Math.min(innerWidth - 200, r.left - 3)) + 'px', top: (r.top > 32 ? r.top - 28 : Math.min(innerHeight - 30, r.bottom + 8)) + 'px' });
		};
		const target = (el) => {
			const svg = el.closest && el.closest('svg');
			if (svg && svg.ownerSVGElement == null) return svg; // a part of an icon or a drawing: the whole svg
			return el;
		};
		const redraw = () => {
			marks.innerHTML = '';
			for (const p of picks) {
				if (!document.contains(p.el)) continue;
				const r = p.el.getBoundingClientRect();
				const ring = document.createElement('div'); ring.className = 'ring';
				Object.assign(ring.style, { left: r.left - 3 + 'px', top: r.top - 3 + 'px', width: r.width + 6 + 'px', height: r.height + 6 + 'px' });
				const b = document.createElement('div'); b.className = 'badge'; b.textContent = p.n;
				Object.assign(b.style, { left: Math.max(4, r.left - 10) + 'px', top: Math.max(4, r.top - 10) + 'px' });
				marks.append(ring, b);
			}
			count.textContent = String(picks.length);
			sendBtn.disabled = !picks.length;
		};
		const loop = () => { if (picks.length) redraw(); if (cur && picking) show(); requestAnimationFrame(loop); };
		requestAnimationFrame(loop);
		const openPop = (p) => {
			open = p;
			const r = p.el.getBoundingClientRect();
			$('.k').innerHTML = `<b>${p.n}. ${NAME[p.kind]}</b> · ${describe(p.el).plain.split(' · ')[1]}`;
			note.value = p.note;
			const left = Math.max(10, Math.min(innerWidth - 284, r.right + 12 > innerWidth - 284 ? r.left : r.right + 12));
			const top = Math.max(10, Math.min(innerHeight - 160, r.top));
			Object.assign(pop.style, { display: 'block', left: left + 'px', top: top + 'px' });
			setTimeout(() => note.focus(), 0);
		};
		const closePop = () => { if (open) open.note = note.value.trim(); open = null; pop.style.display = 'none'; };
		const setPicking = (v) => { picking = v; pickBtn.classList.toggle('on', v); if (!v) { cur = null; show(); } };

		const block = (e) => { if (picking && !ours(e)) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } };
		for (const t of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'contextmenu', 'auxclick']) addEventListener(t, block, true);
		addEventListener('mousemove', (e) => {
			if (!picking || ours(e) || open) return;
			const el = target(e.composedPath()[0] instanceof Element ? e.composedPath()[0] : e.target);
			if (el && el !== cur && el !== document.documentElement && el !== document.body) { cur = el; show(); }
		}, true);
		addEventListener('click', (e) => {
			if (ours(e)) return;
			if (!picking) return;
			e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
			if (open) return closePop();
			if (!cur) return;
			const existing = picks.find((p) => p.el === cur);
			if (existing) return openPop(existing);
			const d = describe(cur);
			const p = { n: ++n, el: cur, kind: d.kind, label: d.plain, note: '' };
			sessionStorage.setItem('__spN', String(n));
			cur.setAttribute('data-sp-pick', String(p.n));
			picks.push(p);
			hint.style.opacity = '0';
			status.hidden = true;
			redraw();
			openPop(p);
		}, true);
		addEventListener('keydown', (e) => {
			if (open && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); closePop(); return; }
			if (e.key === 'Escape') { e.preventDefault(); if (open) closePop(); else setPicking(!picking); return; }
			if (picking && !open && e.key === 'ArrowUp' && cur?.parentElement && cur.parentElement !== document.body) { e.preventDefault(); cur = cur.parentElement; show(); }
		}, true);
		root.addEventListener('click', (e) => {
			const a = e.target.closest('[data-a]')?.getAttribute('data-a');
			if (a === 'pick') setPicking(!picking);
			if (a === 'done') closePop();
			if (a === 'remove' && open) { open.el.removeAttribute('data-sp-pick'); picks.splice(picks.indexOf(open), 1); open = null; pop.style.display = 'none'; redraw(); }
			if (a === 'send' && picks.length) {
				closePop();
				const batch = picks.filter((p) => document.contains(p.el)).map((p) => ({ n: p.n, kind: p.kind, label: p.label, note: p.note }));
				picks.length = 0;
				redraw();
				status.textContent = `Sent ${batch.length}. Writing the prompt${batch.length > 1 ? 's' : ''}…`;
				status.hidden = false;
				window.__spSend?.(JSON.stringify({ url: location.href, title: document.title, picks: batch }));
			}
		});
		window.__spStatus = (t) => { status.textContent = t; status.hidden = !t; };
		window.__spTest = { rect: (sel) => { const r = root.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, note: (t) => { note.value = t; }, status: () => (status.hidden ? '' : status.textContent) };
	};
	start();
}

/** In the page: the details a prompt needs that depend on what was picked (type for text, the artwork for an illustration). */
export function details(sel) {
	const el = document.querySelector(sel);
	if (!el) return null;
	const cs = getComputedStyle(el), r = el.getBoundingClientRect(), tag = el.tagName.toLowerCase();
	const abs = (u) => { try { return new URL(u, location.href).href; } catch { return u; } };
	const textEl = [el, ...el.querySelectorAll('*')].find((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) || el;
	const tcs = getComputedStyle(textEl);
	const out = {
		tag, box: { width: Math.round(r.width * 100) / 100, height: Math.round(r.height * 100) / 100 },
		text: (el.innerText || '').trim().slice(0, 2000),
		type: {
			family: tcs.fontFamily, size: tcs.fontSize, weight: tcs.fontWeight, style: tcs.fontStyle, lineHeight: tcs.lineHeight, letterSpacing: tcs.letterSpacing,
			wordSpacing: tcs.wordSpacing, transform: tcs.textTransform, align: tcs.textAlign, color: tcs.color, features: tcs.fontFeatureSettings, variation: tcs.fontVariationSettings,
			optical: tcs.fontOpticalSizing, smoothing: tcs.webkitFontSmoothing, shadow: tcs.textShadow, decoration: tcs.textDecoration, wrap: tcs.textWrap || tcs.textWrapStyle,
			fill: tcs.webkitTextFillColor, clip: tcs.webkitBackgroundClip || tcs.backgroundClip, background: tcs.backgroundImage !== 'none' ? tcs.backgroundImage : null,
			lines: Math.max(1, Math.round(textEl.getBoundingClientRect().height / (parseFloat(tcs.lineHeight) || parseFloat(tcs.fontSize) * 1.2))),
		},
		art: null,
	};
	const art = tag === 'svg' || tag === 'img' || tag === 'picture' || tag === 'canvas' || tag === 'video' ? el : el.querySelector('svg, img, canvas, video, lottie-player, dotlottie-player, spline-viewer');
	const bg = [el, ...el.querySelectorAll('*')].map((e) => getComputedStyle(e).backgroundImage).find((b) => b.includes('url('));
	if (art || bg) {
		const t = art?.tagName.toLowerCase();
		const img = t === 'picture' ? art.querySelector('img') : art;
		out.art = {
			kind: t === 'svg' ? 'svg' : t === 'img' || t === 'picture' ? 'image' : t === 'canvas' ? 'canvas' : t === 'video' ? 'video' : t ? t : 'background',
			src: t === 'img' || t === 'picture' ? abs(img.currentSrc || img.src) : t === 'video' ? abs(art.currentSrc || art.querySelector('source')?.src || '') : /lottie|spline/.test(t ?? '') ? abs(art.getAttribute('src') || art.getAttribute('url') || '') : bg ? abs(bg.match(/url\("?([^")]+)"?\)/)?.[1] ?? '') : null,
			natural: img && img.naturalWidth ? `${img.naturalWidth}×${img.naturalHeight}` : null,
			fit: img ? getComputedStyle(img).objectFit : null,
			webgl: t === 'canvas' ? (() => { try { return !!(art.getContext('webgl2') || art.getContext('webgl')); } catch { return null; } })() : null,
			svgSize: t === 'svg' ? art.outerHTML.length : null,
			alt: img?.alt || art?.getAttribute?.('aria-label') || '',
		};
	}
	return out;
}
