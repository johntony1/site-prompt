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
		<div class="hl"></div><div class="chip"></div><div class="marks"></div><div class="drag" hidden></div><div class="abox" hidden><span></span></div>
		<div class="hint surface"><b>Hover</b> anything you like, <b>click</b> to pick it (again to deselect), then <b>Get prompts</b></div>
		<div class="pop surface"><span class="beam"></span>
			<div class="head k"></div><div class="rule"></div>
			<textarea placeholder="What do you like about it? (optional)" rows="2"></textarea>
			<div class="rule"></div>
			<div class="foot"><button class="btn ghost icon" data-a="remove" title="Remove this pick">${window.__spIcons?.trash ?? ''}</button><span class="go"><button class="btn ghost-n" data-a="add" hidden>Add</button><button class="btn ghost-n" data-a="learn" title="Take it apart: the layers, how each is made, and the build in steps">Break it down</button><button class="btn done primary" data-a="send">Get prompt <kbd>↵</kbd></button></span></div></div>
		<div class="bar surface">
			<div class="mark">${window.__spIcons?.cursor ?? ''}</div>
			<button class="btn on" data-a="pick" title="Pick (Esc)">${window.__spIcons?.pick ?? ''}Pick<span class="count">0</span></button>
			<button class="btn" data-a="area" title="Drag over an area to take everything in it (A)"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M2.5 5V3.5a1 1 0 011-1H5M11 2.5h1.5a1 1 0 011 1V5M13.5 11v1.5a1 1 0 01-1 1H11M5 13.5H3.5a1 1 0 01-1-1V11"/></svg>Area</button>
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
		const NAME = { illustration: 'Illustration', button: 'Button', text: 'Text', section: 'Section', component: 'Component', area: 'Area' };
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
			if (!cur || !picking || open || window.__spViewerOpen) { hl.style.display = chip.style.display = 'none'; return; }
			const r = place(hl, cur);
			chip.innerHTML = (picks.some((p) => p.el === cur) ? `Deselect<i>${picks.find((p) => p.el === cur).n}</i>` : describe(cur).label) + `<i class="keys">↑ bigger${down.length ? ' · ↓ back' : ''}</i>`;
			Object.assign(chip.style, { display: 'flex', left: Math.max(6, Math.min(innerWidth - 200, r.left - 3)) + 'px', top: (r.top > 32 ? r.top - 28 : Math.min(innerHeight - 30, r.bottom + 8)) + 'px' });
		};
		// a see-through layer laid over the content (connector lines, a glow, a pattern) is not what they point at:
		// look beneath it for the real thing
		const seeThrough = (el) => {
			const t = el.tagName.toLowerCase(), cs = getComputedStyle(el);
			if (!/absolute|fixed/.test(cs.position)) return false;
			const r = el.getBoundingClientRect();
			if (r.width * r.height < 60000) return false;
			if ((el.innerText || '').trim()) return false;
			return t === 'svg' || t === 'canvas' || t === 'img' || t === 'video' || el.getAttribute('aria-hidden') === 'true' || !el.querySelector('a,button,input,img,p,h1,h2,h3,h4,span');
		};
		const under = (x, y) => {
			const stack = document.elementsFromPoint(x, y).filter((el) => el !== host && el !== document.documentElement && el !== document.body).map(target);
			const first = stack[0];
			if (!first || !seeThrough(first)) return null;
			return stack.find((el) => el !== first && !first.contains(el) && !seeThrough(el)) ?? null;
		};
		const down = []; // where ↑ came from, so ↓ goes back
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
				const b0 = p.el.getBoundingClientRect();
				const r = p.area ? { left: b0.left + p.area.x, top: b0.top + p.area.y, width: p.area.w, height: p.area.h } : b0;
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

		// Area: drag a rectangle; the pick is the smallest element that holds it, cut to the rectangle
		const dragLayer = $('.drag'), abox = $('.abox'), areaBtn = $('[data-a=area]');
		let areaMode = false, a0 = null;
		const setArea = (v) => { areaMode = v; areaBtn.classList.toggle('on', v); pickBtn.classList.toggle('on', !v && picking); dragLayer.hidden = !v; if (v) { cur = null; show(); } };
		const holder = (r) => {
			let el = document.elementsFromPoint(r.x + r.w / 2, r.y + r.h / 2).map(target).find((x) => x !== host && !seeThrough(x)) ?? document.body;
			for (; el && el !== document.body; el = el.parentElement) { const b = el.getBoundingClientRect(); if (b.left <= r.x + 2 && b.top <= r.y + 2 && b.right >= r.x + r.w - 2 && b.bottom >= r.y + r.h - 2) return el; }
			return document.body;
		};
		dragLayer.addEventListener('pointerdown', (e) => { a0 = { x: e.clientX, y: e.clientY }; dragLayer.setPointerCapture(e.pointerId); abox.hidden = false; Object.assign(abox.style, { left: a0.x + 'px', top: a0.y + 'px', width: '0px', height: '0px' }); });
		dragLayer.addEventListener('pointermove', (e) => {
			if (!a0) return;
			const x = Math.min(a0.x, e.clientX), y = Math.min(a0.y, e.clientY), w = Math.abs(e.clientX - a0.x), h = Math.abs(e.clientY - a0.y);
			Object.assign(abox.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
			abox.querySelector('span').textContent = `${Math.round(w)} × ${Math.round(h)}`;
		});
		dragLayer.addEventListener('pointerup', (e) => {
			if (!a0) return;
			const r = { x: Math.min(a0.x, e.clientX), y: Math.min(a0.y, e.clientY), w: Math.abs(e.clientX - a0.x), h: Math.abs(e.clientY - a0.y) };
			a0 = null; abox.hidden = true;
			if (r.w < 12 || r.h < 12) return;
			const el = holder(r), b = el.getBoundingClientRect();
			const area = { x: Math.round(r.x - b.left), y: Math.round(r.y - b.top), w: Math.round(r.w), h: Math.round(r.h) };
			const p = { n: ++n, el, kind: 'area', area, label: `Area · ${area.w}×${area.h}`, note: '' };
			store.set('__spN', String(n));
			el.setAttribute('data-sp-pick', String(p.n));
			picks.push(p);
			hint.style.opacity = '0';
			status.hidden = true;
			setArea(false);
			redraw();
			openPop(p);
		});
		const block = (e) => { if (window.__spViewerOpen) return; if (picking && !ours(e)) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } };
		for (const t of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'contextmenu', 'auxclick']) addEventListener(t, block, true);
		addEventListener('mousemove', (e) => {
			if (window.__spViewerOpen || !picking || ours(e) || open) return;
			const el = under(e.clientX, e.clientY) ?? target(e.composedPath()[0] instanceof Element ? e.composedPath()[0] : e.target);
			if (el && el !== cur && el !== document.documentElement && el !== document.body) { cur = el; down.length = 0; show(); }
		}, true);
		addEventListener('click', (e) => {
			if (ours(e) || window.__spViewerOpen) return;
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
			if (window.__spViewerOpen) return;
			if (open && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send('send'); return; }
			if (e.key === 'Escape') { e.preventDefault(); if (open) closePop(); else if (areaMode) setArea(false); else setPicking(!picking); return; }
			if ((e.key === 'a' || e.key === 'A') && !open && !e.metaKey && !e.ctrlKey && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '')) { e.preventDefault(); setArea(!areaMode); return; }
			if (picking && !open && e.key === 'ArrowUp' && cur?.parentElement && cur.parentElement !== document.body) { e.preventDefault(); down.push(cur); cur = cur.parentElement; show(); }
			if (picking && !open && e.key === 'ArrowDown' && down.length) { e.preventDefault(); cur = down.pop(); show(); }
		}, true);
		const send = async (a) => {
			closePop();
			if (!picks.length) return;
			// Break it down: taken apart right here, at once, from what is on screen; the agent builds the lesson after
			let inst = null;
			if (a === 'learn') { const p0 = picks.find((p) => document.contains(p.el)); try { inst = p0 && await window.__spInstant?.(p0.el, `${p0.kind === 'area' ? 'Area' : NAME[p0.kind]}, ${location.host.replace(/^www\./, '')}`, p0.area); if (inst) inst.n = p0.n; } catch (e) { inst = null; } }
			const batch = picks.filter((p) => document.contains(p.el)).map((p) => ({ n: p.n, kind: p.kind, label: p.label, note: p.note, area: p.area }));
			picks.length = 0;
			redraw();
			status.textContent = a === 'add' ? `Sent ${batch.length}. Adding to ${proj?.name ?? 'your project'}…` : a === 'learn' ? `Taking ${batch.length > 1 ? 'them' : 'it'} apart…` : `Sent ${batch.length}. Writing the prompt${batch.length > 1 ? 's' : ''}…`;
			status.hidden = false;
			status.classList.remove('ok');
			bar.classList.add('busy');
			window.__spSend?.(JSON.stringify({ url: location.href, title: document.title, picks: batch, action: a === 'add' ? 'add' : a === 'learn' ? 'learn' : 'prompt', style, instant: inst }));
		};
		root.addEventListener('click', (e) => {
			const badge = e.target.closest('.badge');
				if (badge) { const p = picks.find((x) => x.n === +badge.dataset.n); if (p) { closePop(); openPop(p); } return; }
				const sb = e.target.closest('[data-s]');
				if (sb) return setStyle(sb.dataset.s);
				const a = e.target.closest('[data-a]')?.getAttribute('data-a');
			if (a === 'pick') { setArea(false); setPicking(!picking); }
				if (a === 'area') { closePop(); setArea(!areaMode); }
			if (a === 'remove' && open) unpick(open);
				if (a === 'clear') { for (const p of [...picks]) unpick(p); status.hidden = true; }
			if (a === 'send' || a === 'add' || a === 'learn') send(a);
		});
		window.__spStatus = (t) => { const ok = /^✓/.test(t || ''); status.textContent = ok ? t.replace(/^✓\s*/, '') : t; status.hidden = !t; status.classList.toggle('ok', ok); bar.classList.toggle('busy', !!t && !ok && !/^Could not/.test(t)); };
		// out of every screenshot of a pick (the highlight would tint it)
		// out of a screenshot of a pick: the highlight, rings and card always; the toolbar only when it overlaps the pick,
		// so the person still sees what is happening
		window.__spHide = (v, sel) => {
			for (const el of [hl, chip, marks, pop, hint]) el.style.visibility = v ? 'hidden' : '';
			let over = false;
			const t = v && sel && document.querySelector(sel);
			if (t) { const a = t.getBoundingClientRect(), b = bar.getBoundingClientRect(); over = !(a.right + 24 < b.left || a.left - 24 > b.right || a.bottom + 24 < b.top || a.top - 24 > b.bottom); }
			bar.style.visibility = over ? 'hidden' : '';
		};
		window.__spTest = { rect: (sel) => { const r = root.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, note: (t) => { note.value = t; }, keep: () => closePop(), cur: () => (cur ? `${cur.tagName.toLowerCase()} ${Math.round(cur.getBoundingClientRect().width)}x${Math.round(cur.getBoundingClientRect().height)} ${(cur.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30)}` : null), style: setStyle, clear: () => (clearBtn.hidden ? '' : clearBtn.textContent), status: () => (status.hidden ? '' : status.textContent) };
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
			lines: (() => { const tops = new Set(); for (const t of [...textEl.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim())) { const rg = document.createRange(); rg.selectNodeContents(t); for (const q of rg.getClientRects()) if (q.width > 0) tops.add(Math.round(q.top)); } return Math.max(1, tops.size); })(),
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
	// every picture inside it, in paint order: a drawing is often several files stacked
	out.layers = [el, ...el.querySelectorAll('img, svg, video, canvas')].filter((e) => /^(img|svg|video|canvas)$/i.test(e.tagName) && !(e.tagName.toLowerCase() === 'svg' && e.parentElement?.closest('svg'))).slice(0, 12).map((e) => {
		const t = e.tagName.toLowerCase(), src = t === 'img' ? abs(e.currentSrc || e.src) : t === 'video' ? abs(e.currentSrc || '') : null;
		const q = e.getBoundingClientRect();
		return { tag: t, src, vector: t === 'svg' || /\.svg(\?|#|$)/i.test(src ?? '') || /^data:image\/svg/.test(src ?? ''), natural: e.naturalWidth ? `${e.naturalWidth}×${e.naturalHeight}` : null, shown: `${Math.round(q.width)}×${Math.round(q.height)}` };
	});
	return out;
}
