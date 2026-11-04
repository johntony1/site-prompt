// The picker that lives on the page (the person's own Chrome tab, or a window site-prompt opened): a small toolbar in
// the corner, a highlight that follows the pointer and says what it is over (Button, Text, Illustration, Section,
// Component), click to pick (with an optional note), then "Get prompts" hands the picks to the agent.
// Self-contained: Page.addScriptToEvaluateOnNewDocument installs it on every page the person visits in the session.

export function overlay() {
	if (window.__spOverlay || window.top !== window) return; // the page itself, never its iframes
	window.__spOverlay = true;
	const start = () => {
		if (!document.documentElement) return setTimeout(start, 30);
		const host = document.createElement('site-prompt-ui');
		host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647';
		const root = host.attachShadow({ mode: 'closed' });
		root.innerHTML = `<style>${window.__spTheme || ''}</style>
		<div class="hl"></div><div class="chip"></div><div class="marks"></div>
		<div class="hint surface"><b>Hover</b> anything you like, <b>click</b> to pick it (again to deselect), then <b>Get prompts</b></div>
		<div class="pop surface"><span class="beam"></span>
			<div class="head k"></div><div class="rule"></div>
			<textarea placeholder="What do you like about it? (optional)" rows="2"></textarea>
			<div class="rule"></div>
			<div class="foot"><button class="btn ghost" data-a="remove">${window.__spIcons?.trash ?? ''}Remove</button><span class="go"><button class="btn ghost-n" data-a="add" hidden>Add</button><button class="btn done" data-a="send">Get prompt <kbd>↵</kbd></button></span></div></div>
		<div class="bar surface">
			<div class="mark">${window.__spIcons?.cursor ?? ''}</div>
			<button class="btn on" data-a="pick" title="Pick (Esc)">${window.__spIcons?.pick ?? ''}Pick<span class="count">0</span></button>
			<button class="btn quiet" data-a="clear" hidden title="Deselect everything">Clear</button>
			<span class="sep"></span>
			<div class="seg" hidden><button data-s="exact" title="Pixel for pixel, as it is on this site">Exact</button><button data-s="mine" title="Same layout and motion, in your site's fonts, colours and radius">My style</button></div>
			<button class="btn" data-a="add" disabled hidden>${window.__spIcons?.add ?? ''}Add to project</button>
			<button class="btn primary" data-a="send" disabled>${window.__spIcons?.prompt ?? ''}Get prompts</button>
			<span class="status" hidden></span>
		</div>`;
		document.documentElement.appendChild(host);
		const $ = (s) => root.querySelector(s);
		const hl = $('.hl'), chip = $('.chip'), marks = $('.marks'), pop = $('.pop'), note = $('textarea'), hint = $('.hint');
		const clearBtn = $('[data-a=clear]'), bar = $('.bar'), pickBtn = $('[data-a=pick]'), sendBtn = $('.bar [data-a=send]'), addBtn = $('.bar [data-a=add]'), count = $('.count'), status = $('.status');
		const proj = window.__spProject;
		if (proj) {
			// building something: adding it is the main action, a prompt the other
			addBtn.hidden = false;
				$('.seg').hidden = false;
				$('.go [data-a=add]').hidden = false;
			addBtn.innerHTML = `${window.__spIcons?.add ?? ''}Add to ${(proj.name.length > 18 ? 'project' : proj.name).replace(/</g, '&lt;')}`;
			note.placeholder = 'What you like, or where it goes (optional)';
			hint.innerHTML = '<b>Hover</b> anything you like, <b>click</b> to pick it (again to deselect), then <b>Add</b> it to your project';
		}
		const store = { get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} } };
		let style = store.get('__spStyle') || 'exact';
			const setStyle = (v) => { style = v; store.set('__spStyle', v); for (const b of root.querySelectorAll('.seg button')) b.classList.toggle('on', b.dataset.s === v); };
			setStyle(style);
			let picking = true, cur = null, open = null, n = +(store.get('__spN') || 0);
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
			if (!cur || !picking || open) { hl.style.display = chip.style.display = 'none'; return; }
			const r = place(hl, cur);
			chip.innerHTML = picks.some((p) => p.el === cur) ? `Deselect<i>${picks.find((p) => p.el === cur).n}</i>` : describe(cur).label;
			Object.assign(chip.style, { display: 'flex', left: Math.max(6, Math.min(innerWidth - 200, r.left - 3)) + 'px', top: (r.top > 32 ? r.top - 28 : Math.min(innerHeight - 30, r.bottom + 8)) + 'px' });
		};
		const target = (el) => {
			const svg = el.closest && el.closest('svg');
			if (svg && svg.ownerSVGElement == null) return svg; // a part of an icon or a drawing: the whole svg
			return el;
		};
		// rings and badges are kept (not rebuilt every frame) so a badge can be clicked
		const marked = new Map();
		const redraw = () => {
			for (const [p, m] of marked) if (!picks.includes(p)) { m.ring.remove(); m.badge.remove(); marked.delete(p); }
			for (const p of picks) {
				let m = marked.get(p);
				if (!m) {
					m = { ring: document.createElement('div'), badge: document.createElement('button') };
					m.ring.className = 'ring'; m.badge.className = 'badge'; m.badge.textContent = p.n; m.badge.dataset.n = p.n;
					m.badge.title = 'Edit the note';
					marks.append(m.ring, m.badge); marked.set(p, m);
				}
				const on = document.contains(p.el);
				m.ring.style.display = m.badge.style.display = on ? '' : 'none';
				if (!on) continue;
				const r = p.el.getBoundingClientRect();
				Object.assign(m.ring.style, { left: r.left - 3 + 'px', top: r.top - 3 + 'px', width: r.width + 6 + 'px', height: r.height + 6 + 'px' });
				Object.assign(m.badge.style, { left: Math.max(4, r.left - 10) + 'px', top: Math.max(4, r.top - 10) + 'px' });
			}
			count.textContent = String(picks.length);
			count.classList.toggle('has', picks.length > 0);
			clearBtn.hidden = !picks.length;
			clearBtn.textContent = picks.length > 1 ? 'Clear all' : 'Clear';
			sendBtn.disabled = addBtn.disabled = !picks.length;
		};
		const unpick = (p) => {
			if (!p) return;
			if (open === p) { open = null; pop.style.display = 'none'; }
			p.el.removeAttribute('data-sp-pick');
			picks.splice(picks.indexOf(p), 1);
			redraw();
		};
		const loop = () => { if (picks.length) redraw(); if (cur && picking) show(); requestAnimationFrame(loop); };
		requestAnimationFrame(loop);
		const openPop = (p) => {
			open = p;
			const r = p.el.getBoundingClientRect();
			$('.k').innerHTML = `<span class="num">${p.n}</span><b>${NAME[p.kind]}</b><span class="dim">${describe(p.el).plain.split(' · ')[1]}</span><kbd>esc</kbd>`;
			note.value = p.note;
			// under the pick (over it when there is no room), never covering it unless it fills the screen
			const H = 150, left = Math.max(10, Math.min(innerWidth - 300, r.left));
			const top = r.bottom + 12 + H < innerHeight - 70 ? r.bottom + 12 : r.top - 12 - H > 10 ? r.top - 12 - H : Math.max(10, Math.min(innerHeight - H - 80, r.top + 12));
			Object.assign(pop.style, { display: 'block', left: left + 'px', top: top + 'px' });
			note.style.height = ''; grow();
			setTimeout(() => note.focus(), 0);
		};
		const grow = () => { note.style.height = 'auto'; note.style.height = Math.min(140, Math.max(52, note.scrollHeight)) + 'px'; };
		note.addEventListener('input', grow);
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
			if (existing) return unpick(existing); // clicking a pick again deselects it
			const d = describe(cur);
			const p = { n: ++n, el: cur, kind: d.kind, label: d.plain, note: '' };
			store.set('__spN', String(n));
			cur.setAttribute('data-sp-pick', String(p.n));
			picks.push(p);
			hint.style.opacity = '0';
			status.hidden = true;
			redraw();
			openPop(p);
		}, true);
		addEventListener('keydown', (e) => {
			if (open && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send('send'); return; }
			if (e.key === 'Escape') { e.preventDefault(); if (open) closePop(); else setPicking(!picking); return; }
			if (picking && !open && e.key === 'ArrowUp' && cur?.parentElement && cur.parentElement !== document.body) { e.preventDefault(); cur = cur.parentElement; show(); }
		}, true);
		const send = (a) => {
			closePop();
			if (!picks.length) return;
			const batch = picks.filter((p) => document.contains(p.el)).map((p) => ({ n: p.n, kind: p.kind, label: p.label, note: p.note }));
			picks.length = 0;
			redraw();
			status.textContent = a === 'add' ? `Sent ${batch.length}. Adding to ${proj?.name ?? 'your project'}…` : `Sent ${batch.length}. Writing the prompt${batch.length > 1 ? 's' : ''}…`;
			status.hidden = false;
			status.classList.remove('ok');
			bar.classList.add('busy');
			window.__spSend?.(JSON.stringify({ url: location.href, title: document.title, picks: batch, action: a === 'add' ? 'add' : 'prompt', style }));
		};
		root.addEventListener('click', (e) => {
			const badge = e.target.closest('.badge');
				if (badge) { const p = picks.find((x) => x.n === +badge.dataset.n); if (p) { closePop(); openPop(p); } return; }
				const sb = e.target.closest('[data-s]');
				if (sb) return setStyle(sb.dataset.s);
				const a = e.target.closest('[data-a]')?.getAttribute('data-a');
			if (a === 'pick') setPicking(!picking);
			if (a === 'remove' && open) unpick(open);
				if (a === 'clear') { for (const p of [...picks]) unpick(p); status.hidden = true; }
			if (a === 'send' || a === 'add') send(a);
		});
		window.__spStatus = (t) => { const ok = /^✓/.test(t || ''); status.textContent = ok ? t.replace(/^✓\s*/, '') : t; status.hidden = !t; status.classList.toggle('ok', ok); bar.classList.toggle('busy', !!t && !ok && !/^Could not/.test(t)); };
		// out of every screenshot of a pick (the highlight would tint it)
		window.__spHide = (v) => { host.style.display = v ? 'none' : ''; };
		window.__spTest = { rect: (sel) => { const r = root.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, note: (t) => { note.value = t; }, keep: () => closePop(), style: setStyle, clear: () => (clearBtn.hidden ? '' : clearBtn.textContent), status: () => (status.hidden ? '' : status.textContent) };
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
