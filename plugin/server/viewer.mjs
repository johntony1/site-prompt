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
	const SIZES = [{ id: 'phone', name: 'Phone', w: 390 }, { id: 'tablet', name: 'Tablet', w: 834 }, { id: 'laptop', name: 'Laptop', w: 1440 }, { id: 'big', name: 'Big screen', w: 1920 }];
	V.sizes ??= {};
	// what is on screen now is the size nearest the person's own window
	const mine = V.mineSize ?? SIZES.reduce((a, z) => (Math.abs(z.w - (V.width ?? innerWidth)) < Math.abs(a.w - (V.width ?? innerWidth)) ? z : a)).id;
	// slabs in the pick's own colour: dark sites get dark slabs, light ones light
	function slabVars(bg) {
		const m = String(bg ?? '').match(/\d+(\.\d+)?/g)?.map(Number);
		if (!m || m.length < 3) return '';
		const lum = (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
		if (lum > 0.5) return `--slab:${bg};--slabline:#d4d4d8;--edge:#c9c9cf;--edgeline:#a1a1aa`;
		const up = (k) => `rgb(${m.slice(0, 3).map((x) => Math.round(x + (255 - x) * k)).join(',')})`;
		return `--slab:${up(0.04)};--slabline:rgba(255,255,255,.16);--edge:${up(0.0)};--edgeline:rgba(255,255,255,.10)`;
	}
	root.innerHTML = `<style>
		:host{all:initial}
		:where(:not(.copy):not(.copy *):not(.whole):not(.whole *)){box-sizing:border-box;margin:0;font-family:"Inter Variable",Inter,ui-sans-serif,-apple-system,"SF Pro Text",system-ui,sans-serif;-webkit-font-smoothing:antialiased;letter-spacing:-.006em}
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
		.plane .edge{transform:translateZ(-7px);background:var(--edge,#c9c9cf);box-shadow:0 0 0 1px var(--edgeline,#a1a1aa),0 30px 50px -20px rgba(0,0,0,.6)}
		.plane > img{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;transform:translateZ(.5px)}
		.plane .tag{position:absolute;left:10px;top:10px;height:20px;padding:0 7px;border-radius:6px;background:#fff;color:#71717a;font:600 10.5px/20px var(--mono);box-shadow:0 0 0 1px #d4d4d8;opacity:0;transform:translateZ(1px);transition:opacity .3s ease}
		.on .plane .tag{opacity:1}
		.pin{position:absolute;width:1px;height:1px}
		.slab .q{position:absolute;width:1px;height:1px}
		.slab .q:nth-child(1){left:0;top:0}.slab .q:nth-child(2){right:0;top:0}.slab .q:nth-child(3){right:0;bottom:0}.slab .q:nth-child(4){left:0;bottom:0}
		.pin.l{left:0;top:50%}.pin.r{right:0;top:50%}
				.v.kept .plane{opacity:.16;filter:saturate(.4)}
		.v.kept .plane.hot{opacity:1;filter:none}
		.v.kept .label:not(.kept){color:var(--faint)}
		.plane.hot .slab{box-shadow:0 0 0 1.5px var(--blue2),0 0 0 6px rgba(61,123,255,.12)}
		.plane.hot .edge{background:#9db8fb;box-shadow:0 0 0 1.5px var(--blue2),0 26px 40px -24px rgba(43,100,248,.35)}
		.plane.hot .tag{background:var(--blue);color:#fff;box-shadow:none}
		.head{position:fixed;left:32px;top:28px;opacity:0;transform:translateY(-6px);transition:opacity .4s ease .25s,transform .5s cubic-bezier(.2,.8,.2,1) .25s}
		.on .head{opacity:1;transform:none}
		.head > small{font:500 10.5px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--faint)}
		.head > h2{font-size:19px;font-weight:620;color:var(--ink);letter-spacing:-.015em;margin-top:8px}
		.head > p{font-size:12.5px;color:var(--muted);margin-top:4px}
		.was{margin-top:16px}
		.was > span{display:block;font:500 10.5px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin-bottom:8px}
		.thumb{position:relative;width:220px;border-radius:10px;overflow:hidden;background:var(--slab,#fff);box-shadow:0 0 0 1px var(--line2),0 12px 30px -12px rgba(0,0,0,.6)}
		.tin{position:absolute;left:0;top:0;transform-origin:0 0}
		.tin > img{position:absolute;left:0;top:0}
		.tin .whole *,.tin .whole *::before,.tin .whole *::after{transition:none!important;animation-name:none!important}
		.labels{position:fixed;left:32px;display:flex;flex-direction:column;gap:2px;opacity:0;transition:opacity .4s ease .45s}
		.on .labels{opacity:1}
		.label{display:flex;align-items:center;gap:10px;height:30px;padding-right:10px;cursor:default;font:500 11px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--faint);white-space:nowrap;transition:color .15s ease}
		.label b{font-weight:500;color:var(--faint);transition:color .15s ease}
		.label:hover,.label.hot{color:var(--ink)}
		.label.hot b{color:var(--blue2)}
		.label{cursor:pointer}
		.label.kept{color:var(--ink)}
		.label.kept:after{content:'';width:5px;height:5px;border-radius:50%;background:var(--blue2);margin-left:4px}
		svg.lines{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
		svg.lines path{fill:none;stroke:var(--ink2);stroke-width:1}
		svg.lines path.card{stroke:var(--muted);stroke-dasharray:3 3}
		svg.lines circle{fill:#09090b;stroke:var(--ink);stroke-width:1.25}
		svg.lines circle.card{stroke:var(--faint)}
		.spec{position:fixed;right:28px;top:120px;width:360px;background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,0) 40%),var(--panel);border-radius:14px;box-shadow:0 0 0 1px var(--line),0 0 0 1px rgba(0,0,0,.55),0 1px 0 rgba(255,255,255,.04) inset,0 24px 48px -12px rgba(0,0,0,.6);opacity:0;transition:opacity .35s ease .5s,top .35s cubic-bezier(.2,.8,.2,1)}
		.on .spec{opacity:1}
		.spec .ch{display:flex;align-items:center;gap:9px;padding:14px 16px 10px}
		.spec .ch i{font:600 10.5px/20px var(--mono);font-style:normal;height:20px;padding:0 7px;border-radius:6px;background:var(--blue);color:#fff}
		.spec .ch b{font-size:14px;font-weight:620;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
		.spec .rows{padding:2px 16px 8px}
		.spec .body{max-height:min(560px, calc(100vh - 200px));overflow:auto}
		.spec .sec small{display:block;padding:10px 16px 2px;font:500 10px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--faint)}
		.spec .why{margin:0 12px 6px;padding:10px 12px;border-radius:10px;background:rgba(61,123,255,.08);box-shadow:inset 0 0 0 1px rgba(61,123,255,.18)}
		.spec .why p{font-size:12.5px;line-height:1.5;color:var(--ink2)}
		.spec .why p+p{margin-top:6px}
		.spec pre{margin:6px 12px 10px;padding:10px 12px;max-height:180px;overflow:auto;border-radius:9px;background:rgba(0,0,0,.35);box-shadow:inset 0 0 0 1px var(--line);font:400 11px/1.55 var(--mono);color:var(--ink2);white-space:pre-wrap;word-break:break-word}
		.spec .sec small .mini{appearance:none;border:0;float:right;margin-top:-3px;height:18px;padding:0 7px;border-radius:5px;font:500 10.5px/18px var(--mono);letter-spacing:.04em;text-transform:none;color:var(--ink2);background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px var(--line);cursor:pointer}
		.spec .sec small .mini:hover{color:var(--ink)}
		.spec .tree{padding:4px 8px 10px}
		.spec .pt{display:flex;align-items:center;gap:6px;height:28px;padding-right:8px;border-radius:7px;cursor:pointer;color:var(--ink2);font-size:12.5px}
		.spec .pt:hover{background:rgba(255,255,255,.05);color:var(--ink)}
		.spec .pt .car{width:16px;height:16px;flex:none;display:grid;place-items:center;border-radius:4px;color:var(--faint);transition:transform .15s ease}
		.spec .pt .car:hover{background:rgba(255,255,255,.08);color:var(--ink)}
		.spec .pt.open > .car{transform:rotate(90deg)}
		.spec .pt .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
		.spec .pt .dm{font:400 10.5px/1 var(--mono);color:var(--faint);flex:none}
		.spec .sub{display:none}
		.spec .sub.open{display:block}
		.spec .crumbs{flex-wrap:wrap;row-gap:4px}
		.spec .crumbs .bk{appearance:none;border:0;height:22px;padding:0 8px 0 6px;border-radius:6px;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px var(--line);color:var(--ink2);font:500 11.5px/22px inherit;cursor:pointer;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
		.spec .crumbs .bk:hover{color:var(--ink);background:rgba(255,255,255,.1)}
		.spec .crumbs .sl{color:var(--faint);font-size:12px}
		.pbox{position:absolute;pointer-events:none;border-radius:3px;box-shadow:0 0 0 1.5px var(--blue2),0 0 0 5px rgba(61,123,255,.16);background:rgba(61,123,255,.07);transform:translateZ(1.5px);transition:left .2s ease,top .2s ease,width .2s ease,height .2s ease}
		.spec .chips{display:flex;flex-wrap:wrap;gap:5px;padding:6px 16px 10px}
		.spec .chips span{font-size:11.5px;color:var(--ink2);padding:3px 8px;border-radius:6px;background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px var(--line)}
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
		.backing{position:absolute;inset:-12px;border-radius:12px;transform:translateZ(-3px);opacity:0;transition:opacity .4s ease;box-shadow:0 0 0 1px rgba(255,255,255,.06),0 30px 60px -30px rgba(0,0,0,.7)}
		.v.specs.on .backing{opacity:1}
		.v.specs .plane .slab,.v.specs .plane .edge,.v.specs .plane .tag{opacity:0!important}
		.v.specs .plane.hot .slab{opacity:1!important;background:transparent!important;box-shadow:0 0 0 1.5px var(--blue2),0 0 0 6px rgba(61,123,255,.16)!important}
		.v.specs .labels{display:none}
		.callouts{position:fixed;inset:0;pointer-events:none}
		.callout{position:fixed;width:216px;padding:10px 12px 8px;border-radius:12px;background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,0) 40%),var(--panel);box-shadow:0 0 0 1px var(--line),0 0 0 1px rgba(0,0,0,.5),0 14px 30px -14px rgba(0,0,0,.7);pointer-events:auto;cursor:pointer;opacity:0;transform:translateY(4px);transition:opacity .35s ease,transform .45s cubic-bezier(.2,.8,.2,1),box-shadow .15s ease}
		.callout.in{opacity:1;transform:none}
		.callout:hover,.callout.hot{box-shadow:0 0 0 1px rgba(61,123,255,.6),0 0 0 4px rgba(61,123,255,.14),0 14px 30px -14px rgba(0,0,0,.7)}
		.callout b{display:block;font-size:12.5px;font-weight:600;color:var(--ink);margin-bottom:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
		.callout .cr{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:11.5px;min-height:22px}
		.callout .cr span{color:var(--muted);white-space:nowrap}
		.callout .cr em{font-style:normal;color:var(--ink2);display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
		.callout .cr em s{width:10px;height:10px;border-radius:50%;flex:none;box-shadow:0 0 0 1px rgba(255,255,255,.25) inset}
		.callout .cr em .pill{font:600 10.5px/1 var(--mono);color:#fff;background:#2b8cf8;padding:3px 5px;border-radius:4px}
		svg.callines{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
		svg.callines path{fill:none;stroke:#8a8f98;stroke-opacity:.75;stroke-width:1}
		svg.callines path.hot{stroke:var(--blue2)}
		svg.callines circle{fill:#fff;stroke:#71717a;stroke-width:1.25}
		svg.callines circle.hot{stroke:var(--blue2)}
		.v.specs .sld{opacity:.35;pointer-events:none}
		.v.specs [data-a=flat]{display:none}
		.sizes{position:fixed;left:50%;top:22px;transform:translateX(-50%);display:flex;gap:2px;padding:3px;border-radius:11px;background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,0) 40%),var(--panel);box-shadow:0 0 0 1px var(--line),0 0 0 1px rgba(0,0,0,.55),0 16px 32px -12px rgba(0,0,0,.6);opacity:0;transition:opacity .4s ease .5s}
		.on .sizes{opacity:1}
		.sz{appearance:none;border:0;height:30px;padding:0 12px;border-radius:8px;display:flex;align-items:center;gap:7px;background:transparent;color:var(--muted);font-size:12.5px;font-weight:550;cursor:pointer;transition:background .12s ease,color .12s ease}
		.sz i{font-style:normal;font:500 10.5px/1 var(--mono);color:var(--faint)}
		.sz:hover{color:var(--ink2)}
		.sz.on{background:rgba(255,255,255,.09);color:var(--ink);box-shadow:0 0 0 1px var(--line2),0 1px 2px rgba(0,0,0,.4)}
		.sz.on i{color:var(--muted)}
		.sz.wait{opacity:.45;cursor:progress}
		.sz.wait i:after{content:' …'}
		.sz.none{opacity:.35;cursor:not-allowed}
		.bar{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);display:flex;align-items:center;gap:6px;padding:6px;border-radius:13px;background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,0) 40%),var(--panel);box-shadow:0 0 0 1px var(--line),0 0 0 1px rgba(0,0,0,.55),0 24px 48px -12px rgba(0,0,0,.6);opacity:0;transition:opacity .4s ease .55s}
		.on .bar{opacity:1}
		.sld{position:relative;width:236px;height:32px;border-radius:9px;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px var(--line);cursor:ew-resize;touch-action:none;outline:none;user-select:none}
		.sld:focus-visible{box-shadow:inset 0 0 0 1px var(--line),0 0 0 2px rgba(61,123,255,.5)}
		.sld .fill{position:absolute;left:0;top:0;bottom:0;min-width:76px;border-radius:9px;background:linear-gradient(180deg,rgba(61,123,255,.34),rgba(43,100,248,.26));box-shadow:inset 0 0 0 1px rgba(61,123,255,.38),inset 0 1px 0 rgba(255,255,255,.08);display:flex;align-items:center}
		.sld .fill span{padding-left:12px;font-size:12.5px;font-weight:550;color:var(--ink2)}
		.sld .fill b{position:absolute;right:7px;top:50%;width:5px;height:18px;margin-top:-9px;border-radius:3px;background:#f7f8f8;box-shadow:0 0 0 1px rgba(0,0,0,.25),0 2px 4px rgba(0,0,0,.4);transition:transform .12s ease}
		.sld:hover .fill b,.sld.drag .fill b{transform:scaleY(1.12)}
		.sld .dots{position:absolute;left:84px;right:52px;top:50%;height:2px;margin-top:-1px;display:flex;justify-content:space-between;pointer-events:none}
		.sld .dots i{width:3px;height:3px;border-radius:50%;background:rgba(255,255,255,.18);margin-top:-.5px}
		.sld em{position:absolute;right:12px;top:50%;transform:translateY(-50%);font-style:normal;font:500 12px/1 var(--mono);color:var(--muted);pointer-events:none}
		.bar .sep{width:1px;height:18px;background:var(--line);margin:0 2px}
		.views{display:flex;padding:2px;gap:1px;border-radius:8px;background:rgba(255,255,255,.035);box-shadow:inset 0 0 0 1px var(--line)}
		.vb{appearance:none;border:0;width:30px;height:26px;border-radius:6px;display:grid;place-items:center;color:var(--muted);background:transparent;cursor:pointer;transition:background .12s ease,color .12s ease}
		.vb svg{width:15px;height:15px}
		.vb:hover{color:var(--ink2)}
		.vb.on{background:rgba(255,255,255,.1);color:var(--ink);box-shadow:0 0 0 1px var(--line2),0 1px 2px rgba(0,0,0,.4)}
		.zoom{display:flex;align-items:center;padding:2px;border-radius:8px;background:rgba(255,255,255,.035);box-shadow:inset 0 0 0 1px var(--line)}
		.zb{appearance:none;border:0;height:26px;min-width:26px;padding:0 6px;border-radius:6px;background:transparent;color:var(--ink2);font:500 13px/1 var(--mono);cursor:pointer}
		.zb:hover{background:rgba(255,255,255,.07);color:var(--ink)}
		.zb.pct{min-width:52px;font-size:11.5px;color:var(--muted)}
		.bar kbd{font:500 10.5px/1 var(--mono);color:var(--muted);padding:3px 5px;border-radius:4px;box-shadow:inset 0 0 0 1px var(--line)}
		.copy,.whole{all:initial;display:block}
		.copy{position:absolute;left:0;top:0;transform:translateZ(.5px);pointer-events:none}
		.copy *,.copy *::before,.copy *::after{transition:none!important;animation-name:none!important}
		${V.html ? (V.rules ?? []).join('\n') : ''}
		${V.html && V.rootW ? `.copy > .c0,.whole > .c0{width:${V.rootW}px!important;min-width:0!important;max-width:none!important;box-sizing:border-box!important;margin:0!important}` : ''}
		.copy :is(clipPath,mask,pattern,linearGradient,radialGradient,marker,symbol,filter) *,.whole :is(clipPath,mask,pattern,linearGradient,radialGradient,marker,symbol,filter) *{visibility:visible!important}
		${V.html ? V.layers.map((l, k) => `.p${k} *{visibility:hidden!important}${(l.members ?? [l.i]).map((m) => `.p${k} .c${m}`).join(',')}{visibility:visible!important}${l.force ? `.p${k} .c${l.i}{opacity:1!important}` : ''}`).join('\n') : ''}
	</style>
	<div class="v" style="${slabVars(V.bg)}">
		<div class="canvas"></div>
		<div class="stage"><div class="stack"><div class="backing" style="background:${esc(V.bg || 'transparent')}"></div>${V.layers.map((l, k) => `<div class="plane" data-k="${k}"><div class="edge"></div><div class="slab"><i class="q"></i><i class="q"></i><i class="q"></i><i class="q"></i></div>${V.html ? `<div class="copy p${k}" style="left:${-(V.offset?.x || 0)}px;top:${-(V.offset?.y || 0)}px">${V.html}</div>` : l.png ? `<img src="data:image/png;base64,${l.png}">` : ''}<span class="tag">${pad2(l.n)}</span><i class="pin l"></i><i class="pin r"></i></div>`).join('')}</div></div>
		<svg class="callines"></svg><div class="callouts"></div><svg class="lines"><path class="lab" d=""/><circle class="lab" r="3" cx="-9" cy="-9"/><path class="card" d=""/><circle class="card" r="3" cx="-9" cy="-9"/></svg>
		<div class="sizes">${SIZES.map((z) => `<button class="sz" data-z="${z.id}" title="${z.w} × ${z.h}"><span>${z.name}</span><i>${z.w}</i></button>`).join('')}</div>
		<div class="head"><small>Breakdown</small><h2>${esc(V.title)}</h2><p>${n} layers · hover one to inspect · scroll to zoom · drag to move</p><div class="was"><span>You picked</span><div class="thumb"><div class="tin">${V.html ? `<div class="whole" style="position:absolute;left:${-(V.offset?.x || 0)}px;top:${-(V.offset?.y || 0)}px">${V.html}</div>` : V.layers.map((l) => (l.png ? `<img src="data:image/png;base64,${l.png}">` : '')).join('')}</div></div></div></div>
		<div class="labels">${V.layers.slice().reverse().map((l) => `<div class="label" data-k="${l.n - 1}"><b>${pad2(l.n)}</b>${esc(l.name.replace(/ \(layer-\d+\.\w+\)/, ''))}</div>`).join('')}</div>
		<div class="spec"></div>
		<div class="bar"><div class="views"><button class="vb" data-v="specs" title="Specs: flat, with callouts"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="4.5" y="5" width="7" height="6" rx="1.2"/><path d="M4.5 8H2M11.5 8H14M8 5V2.5" opacity=".7"/></svg></button><button class="vb on" data-v="top" title="From above"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M8 2.5l5.5 3L8 8.5l-5.5-3L8 2.5z"/><path d="M2.5 8.5L8 11.5l5.5-3"/><path d="M2.5 11L8 14l5.5-3" opacity=".55"/></svg></button><button class="vb" data-v="front" title="Facing you"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="2" y="3.5" width="7" height="9" rx="1.2"/><path d="M11 4.5v7M13.5 5.5v5" opacity=".75"/></svg></button></div><span class="sep"></span><div class="sld" role="slider" tabindex="0" aria-label="Spread" aria-valuemin="0" aria-valuemax="100"><div class="fill"><span>Spread</span><b></b></div><div class="dots"><i></i><i></i><i></i><i></i><i></i><i></i></div><em></em></div><button class="b" data-a="flat">Flatten</button><span class="sep"></span><div class="zoom"><button class="zb" data-z="out" title="Zoom out (−)">−</button><button class="zb pct" data-z="fit" title="Fit (0)">100%</button><button class="zb" data-z="in" title="Zoom in (+)">+</button></div><span class="sep"></span><button class="b p" data-a="all">Copy whole thing</button><button class="b" data-a="close">Close <kbd>esc</kbd></button></div>
	</div>`;
	document.documentElement.appendChild(host);
	const $ = (s) => root.querySelector(s);
	const v = $('.v'), canvas = $('.canvas'), stage = $('.stage'), stack = $('.stack'), card = $('.spec'), labelsBox = $('.labels');
	const planes = [...root.querySelectorAll('.plane')], labels = [...root.querySelectorAll('.label')];
	const [labPath, labDot, cardPath, cardDot] = [...root.querySelectorAll('svg.lines > *')];
	// each slab hugs what its layer draws: the bounding box of the picture's visible pixels
	planes.forEach((p) => {
		const img = V.html ? null : p.querySelector(':scope > img');
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
	const el = V.el ?? (V.path && document.querySelector(V.path));
	let r = el?.getBoundingClientRect();
	if (!r || !r.width || r.bottom < 0 || r.top > innerHeight) { el?.scrollIntoView({ block: 'center', behavior: 'instant' }); r = el?.getBoundingClientRect() ?? { left: (innerWidth - V.size.w) / 2, top: (innerHeight - V.size.h) / 2, width: V.size.w, height: V.size.h }; }
	const was = V.was ?? (el ? el.style.visibility : '');
	if (el) el.style.visibility = 'hidden';
	if (V.again) r = { left: (innerWidth - V.size.w) / 2, top: (innerHeight - V.size.h) / 2, width: V.size.w, height: V.size.h };
	Object.assign(stage.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
	Object.assign(stack.style, { left: V.offset.x + 'px', top: V.offset.y + 'px', width: V.clip.w + 'px', height: V.clip.h + 'px' });
	// is it really stacked? where do three or more layers lie on top of each other
	const depth = (() => {
		let max = 0;
		const W = V.size.w || 1, H = V.size.h || 1, bx = V.layers.map((l) => l.box).filter(Boolean);
		for (let gy = 0; gy < 14; gy++) for (let gx = 0; gx < 14; gx++) {
			const x = (gx + 0.5) * W / 14, y = (gy + 0.5) * H / 14;
			const c = bx.filter((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h && !(b.w >= W * 0.95 && b.h >= H * 0.95)).length;
			if (c > max) max = c;
		}
		return max;
	})();
	let mode = V.view ?? (depth >= 3 ? 'top' : 'specs');
	let hot = null;
	const ANGLES_START = { ry: 0, rx: 55, rz: -40 };
	let zoom = 1, px = 0, py = 0;
	let ry = 0, rx = 0, rz = 0, spread = V.spread ?? 0.6, flat = false, tx = 0, ty = 0, sc = 1;
	const gap = () => (flat ? 0 : spread * 1.6 * Math.max(40, Math.min(170, Math.max(V.clip.w, V.clip.h) * 0.16)));
	const apply = () => {
		stack.style.transform = `translate(${tx + px}px, ${ty + py}px) scale(${sc * zoom}) rotateY(${flat ? 0 : ry}deg) rotateX(${flat ? 0 : rx}deg) rotateZ(${flat ? 0 : rz}deg)`;
		planes.forEach((p, k) => { p.style.transform = `translateZ(${k * gap() + (k === hot && !flat ? gap() * 0.35 : 0)}px)`; });
	};
	// the free space: between the labels on the left and the card on the right
	const space = () => (mode === 'specs' ? { l: Math.min(290, innerWidth * 0.22), r: innerWidth - Math.min(400, innerWidth * 0.3), t: 96, b: innerHeight - 96 } : { l: 290, r: innerWidth - 390, t: 70, b: innerHeight - 90 });
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
	if (V.html) planes.forEach((p, k) => {
		const b = V.layers[k].box, P = 10;
		const box = { left: b.x - P + 'px', top: b.y - P + 'px', width: b.w + P * 2 + 'px', height: b.h + P * 2 + 'px' };
		for (const e of p.querySelectorAll('.slab, .edge')) Object.assign(e.style, { inset: 'auto', ...box });
		const tag = p.querySelector('.tag'); tag.style.left = b.x - P + 10 + 'px'; tag.style.top = b.y - P + 10 + 'px';
		const L = p.querySelector('.pin.l'), R = p.querySelector('.pin.r');
		Object.assign(L.style, { left: b.x - P + 'px', top: b.y + b.h / 2 + 'px' });
		Object.assign(R.style, { left: b.x + b.w + P + 'px', right: 'auto', top: b.y + b.h / 2 + 'px' });
	});
	// the pictures decode first, the slabs take their shape, then it lifts off
	const ready = Promise.all(planes.map((p) => { const img = V.html ? null : p.querySelector(':scope > img'); return img ? img.decode().then(() => p.__fit?.()).catch(() => {}) : null; }));
	ready.then(() => {
		// lift off: flat over the element, then turn and split. Where it ends up is measured first, with transitions off.
		const all = [stack, ...planes];
		all.forEach((e) => (e.style.transition = 'none'));
		({ ry, rx, rz } = mode === 'specs' ? { ry: 0, rx: 0, rz: 0 } : V.angle ?? ANGLES_START);
		if (mode === 'specs') { flat = true; v.classList.add('specs'); }
		apply(); refit(); refit();
		const target = { ry, rx, rz, tx, ty, sc };
		if (!V.again) { ry = 0; rx = 0; rz = 0; tx = 0; ty = 0; sc = 1; flat = true; apply(); }
		stack.getBoundingClientRect();
		all.forEach((e) => (e.style.transition = ''));
		planes.forEach((p, k) => (p.style.transitionDelay = `${k * 40}ms`));
		requestAnimationFrame(() => requestAnimationFrame(() => {
			({ ry, rx, rz, tx, ty, sc } = target);
			flat = mode === 'specs';
			v.classList.add('on');
			apply();
			setTimeout(() => { planes.forEach((p) => (p.style.transitionDelay = '')); if (mode === 'specs') buildCallouts(); else setHot(n - 1); }, 1000 + n * 40);
		}));
	});
	const MIRROR = ['transform', 'opacity', 'filter', 'translate', 'scale', 'rotate', 'stroke-dashoffset', 'stroke-dasharray', 'stroke', 'fill', 'stroke-opacity', 'fill-opacity', 'clip-path', 'offset-distance', 'background-position', 'width', 'height', 'd'];
	// what moves on the page moves here: mirrored from the real element every frame
	const mirrors = (V.mirror ?? []).map((m) => ({ el: m.el, copies: [...root.querySelectorAll(`.c${m.i}`)] })).filter((m) => m.copies.length);
	if (mirrors.length) {
		const step = () => {
			if (!host.isConnected) return;
			for (const m of mirrors) {
				const cs = getComputedStyle(m.el);
				for (const c of m.copies) {
					for (const p of MIRROR) if (p !== 'width' && p !== 'height' || m.el.tagName !== 'CANVAS') c.style.setProperty(p, cs.getPropertyValue(p));
					if (m.el.tagName === 'CANVAS' && c.tagName === 'CANVAS') {
						try {
							if (c.width !== m.el.width || c.height !== m.el.height) { c.width = m.el.width; c.height = m.el.height; }
							const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); g.drawImage(m.el, 0, 0);
						} catch {}
					}
				}
			}
			requestAnimationFrame(step);
		};
		requestAnimationFrame(step);
	}
	// the preview: the whole pick, scaled into 220 px
	{
		const A = V.area, thumb = $('.thumb'), tin = $('.tin'), W0 = V.html ? V.size.w : V.clip.w, H0 = V.html ? V.size.h : V.clip.h, W = A ? A.w : W0, H = A ? A.h : H0, k = Math.min(220 / W, 150 / H);
		Object.assign(thumb.style, { width: Math.round(W * k) + 'px', height: Math.round(H * k) + 'px' });
		Object.assign(tin.style, { width: W0 + 'px', height: H0 + 'px', transform: `scale(${k}) translate(${A ? -A.x : 0}px, ${A ? -A.y : 0}px)` });
		tin.querySelectorAll(':scope > img').forEach((im) => Object.assign(im.style, { width: W0 + 'px', height: H0 + 'px' }));
	}
	// the labels: a column on the left, centred
	const h0 = labelsBox.getBoundingClientRect().height;
	labelsBox.style.top = Math.max($('.head').getBoundingClientRect().bottom + 28, (innerHeight - h0) / 2) + 'px';
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
	// the thread: a layer's parts as a tree; a part opens its own card, with the way back above it
	const CAR = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M3.5 2l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
	const treeOf = (items, depth) => items.map((it) => `<div class="pt" data-p="${it.id}" style="padding-left:${4 + depth * 14}px">${it.kids?.length ? `<span class="car">${CAR}</span>` : '<span class="car"></span>'}<span class="nm">${esc(it.name)}</span>${it.note ? `<span class="dm">${esc(it.note)}</span>` : it.box ? `<span class="dm">${Math.round(it.box.w)}×${Math.round(it.box.h)}</span>` : ''}</div>${it.kids?.length ? `<div class="sub" data-s="${it.id}">${treeOf(it.kids, depth + 1)}</div>` : ''}`).join('');
	const pathTo = (items, id, trail = []) => { for (const it of items ?? []) { const t = [...trail, it]; if (it.id === id) return t; const r = pathTo(it.kids, id, t); if (r) return r; } return null; };
	const wireTree = (k) => {
		card.querySelectorAll('.pt').forEach((row) => {
			const id = +row.dataset.p;
			row.querySelector('.car')?.addEventListener('click', (e) => { e.stopPropagation(); const sub = card.querySelector(`.sub[data-s="${id}"]`); if (!sub) return; sub.classList.toggle('open'); row.classList.toggle('open', sub.classList.contains('open')); });
			row.addEventListener('mouseenter', () => { const t = pathTo(V.layers[k].parts, id); if (t) outline(k, t[t.length - 1]); });
			row.addEventListener('mouseleave', () => outline(k, partOn));
			row.addEventListener('click', () => { const t = pathTo(V.layers[k].parts, id); if (t) showPart(k, t); });
		});
	};
	let partOn = null;
	const outline = (k, it) => {
		root.querySelectorAll('.pbox').forEach((x) => x.remove());
		if (!it?.box || k == null) return;
		const b = document.createElement('div');
		b.className = 'pbox';
		Object.assign(b.style, { left: it.box.x - 2 + 'px', top: it.box.y - 2 + 'px', width: it.box.w + 4 + 'px', height: it.box.h + 4 + 'px' });
		planes[k].appendChild(b);
	};
	const showPart = (k, trail) => {
		const l = V.layers[k], it = trail[trail.length - 1];
		if (pinned !== k) keep(k);
		partOn = it;
		outline(k, it);
		const d = (V.partDetail && V.partDetail(it.idx)) || { specs: it.box ? [{ k: 'Size', v: `${Math.round(it.box.w)} × ${Math.round(it.box.h)}` }] : [] };
		const rowsOf = (list) => list.map((row) => `<div class="row"><span>${esc(row.k)}</span><em>${swatch(row)}<u title="${esc(row.v)}">${esc(row.v)}</u></em></div>`).join('');
		const sect = (name, list) => (list?.length ? `<div class="sec"><small>${name}</small><div class="rows">${rowsOf(list)}</div></div>` : '');
		card.innerHTML = `<div class="ch crumbs"><i>${pad2(l.n)}</i><button class="bk" data-t="-1" title="Back to the layer">‹ ${esc(l.name)}</button>${trail.slice(0, -1).map((x, j) => `<span class="sl">/</span><button class="bk" data-t="${j}">${esc(x.name)}</button>`).join('')}<span class="sl">/</span><b>${esc(it.name)}</b></div>
			<div class="body">
			${d.why?.length ? `<div class="why">${d.why.map((w) => `<p>${esc(w)}</p>`).join('')}</div>` : ''}
			${it.kids?.length ? `<div class="sec"><small>Parts</small><div class="tree">${treeOf(it.kids, 0)}</div></div>` : ''}
			${sect('Look', (d.specs ?? []).filter((r) => !/^(Moves|Motion|Loops|Plays|Animat|Moving)/.test(r.k)))}
			${sect('Type', d.type)}
			${sect('Design', d.design)}
			${sect('Layout', it.kids?.length || it.idx.length === 1 ? d.layout : null)}
			${sect('Engineering', d.eng)}
			${d.authored ? `<div class="sec"><small>Authored CSS <button class="mini" data-c="authored">Copy</button></small><pre>${esc(d.authored)}</pre></div>` : ''}
			</div>
			<div class="acts"><button class="b" data-c="back">Back to ${esc(l.name.length > 22 ? l.name.slice(0, 22) + '…' : l.name)}</button>${d.authored ? '<button class="b" data-c="pcss">Copy CSS</button>' : ''}</div>`;
		card.querySelectorAll('.bk').forEach((b) => b.addEventListener('click', () => { const t = +b.dataset.t; if (t < 0) { partOn = null; outline(k, null); showCard(k); } else showPart(k, trail.slice(0, t + 1)); }));
		card.querySelector('[data-c=back]').addEventListener('click', () => { partOn = null; outline(k, null); showCard(k); });
		card.querySelector('[data-c=authored]')?.addEventListener('click', (e) => copy(d.authored, e.currentTarget, 'Copy'));
		card.querySelector('[data-c=pcss]')?.addEventListener('click', (e) => copy(d.authored, e.currentTarget, 'Copy CSS'));
		// its own parts open the same way, one level further down the thread
		card.querySelectorAll('.pt').forEach((row) => {
			const id = +row.dataset.p;
			row.querySelector('.car')?.addEventListener('click', (e) => { e.stopPropagation(); const sub = card.querySelector(`.sub[data-s="${id}"]`); if (!sub) return; sub.classList.toggle('open'); row.classList.toggle('open', sub.classList.contains('open')); });
			row.addEventListener('mouseenter', () => { const t2 = pathTo(it.kids, id); if (t2) outline(k, t2[t2.length - 1]); });
			row.addEventListener('mouseleave', () => outline(k, partOn));
			row.addEventListener('click', () => { const t2 = pathTo(it.kids, id); if (t2) showPart(k, [...trail, ...t2]); });
		});
	};
	const showCard = (k) => {
		const l = V.layers[k];
		const rowsOf = (list) => list.map((row) => `<div class="row${/recording/.test(row.v) ? ' wait' : ''}"><span>${esc(row.k)}</span><em>${swatch(row)}<u title="${esc(row.v)}">${esc(row.v)}</u></em></div>`).join('');
		const isMotion = (row) => /^(Moves|Motion|Loops|Plays|Animat|Moving)/.test(row.k);
		const sect = (name, list) => (list?.length ? `<div class="sec"><small>${name}</small><div class="rows">${rowsOf(list)}</div></div>` : '');
		card.innerHTML = `<div class="ch"><i>${pad2(l.n)}</i><b>${esc(l.name)}</b></div>
			<div class="body">
			${l.why?.length ? `<div class="why">${l.why.map((w) => `<p>${esc(w)}</p>`).join('')}</div>` : ''}
			${sect('Design', l.design)}
			${sect('Engineering', l.eng)}
			${l.authored ? `<div class="sec"><small>Authored CSS <button class="mini" data-c="authored">Copy</button></small><pre>${esc(l.authored)}</pre></div>` : ''}
			${sect('Look', l.specs.filter((r) => !isMotion(r)))}
			${sect('Type', l.type)}
			${sect('Layout', l.layout)}
			${l.parts?.length ? `<div class="sec"><small>Parts <span style="text-transform:none;letter-spacing:0;font-family:inherit">· click one, or double-click it on the canvas</span></small><div class="tree">${treeOf(l.parts, 0)}</div></div>` : l.holds?.length ? `<div class="sec"><small>Holds</small><div class="chips">${l.holds.map((h) => `<span>${esc(h)}</span>`).join('')}</div></div>` : ''}
			${sect('Motion', l.specs.filter(isMotion))}
			</div>
			<div class="acts"><button class="b p" data-c="prompt" ${l.prompt ? '' : 'disabled style="opacity:.55"'}>${l.prompt ? 'Copy prompt' : 'Writing prompt…'}</button><button class="b" data-c="css" ${l.css ? '' : 'disabled style="opacity:.55"'}>Copy CSS</button></div>`;
		wireTree(k);
		card.querySelector('[data-c=prompt]').addEventListener('click', (e) => V.layers[k].prompt && copy(V.layers[k].prompt + (V.layers[k].authored ? `\n\n## Authored CSS (as written on the site: variables, media queries and states)\n\`\`\`css\n${V.layers[k].authored}\n\`\`\`` : ''), e.currentTarget, 'Copy prompt'));
		card.querySelector('[data-c=authored]')?.addEventListener('click', (e) => copy(V.layers[k].authored, e.currentTarget, 'Copy'));
		card.querySelector('[data-c=css]').addEventListener('click', (e) => V.layers[k].css && copy(V.layers[k].css, e.currentTarget, 'Copy CSS'));
	};
	const lines = () => {
		if (mode === 'specs' && hot != null) drawCallLines();
		if (hot == null || (mode === 'specs' && pinned == null)) { labPath.setAttribute('d', ''); cardPath.setAttribute('d', ''); labDot.setAttribute('cx', -9); cardDot.setAttribute('cx', -9); return; }
		if (mode === 'specs') { labPath.setAttribute('d', ''); labDot.setAttribute('cx', -9); }
		const lab = labels.find((x) => +x.dataset.k === hot).getBoundingClientRect();
		const pl = planes[hot].querySelector('.pin.l').getBoundingClientRect(), pr = planes[hot].querySelector('.pin.r').getBoundingClientRect();
		const x1 = lab.right + 8, y1 = lab.top + lab.height / 2;
		if (mode !== 'specs') { labPath.setAttribute('d', `M${x1},${y1} L${Math.max(x1 + 16, pl.left - 36)},${y1} L${pl.left},${pl.top}`); labDot.setAttribute('cx', pl.left); labDot.setAttribute('cy', pl.top); }
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
		apply();
		labels.forEach((x) => x.classList.toggle('hot', +x.dataset.k === k));
		partOn = null; outline(k, null);
		showCard(k);
		// the card follows the layer up and down
		const pr = planes[k].querySelector('.pin.r').getBoundingClientRect();
		const h = card.getBoundingClientRect().height || 320;
		card.style.top = Math.max(24, Math.min(innerHeight - h - 90, pr.top - h / 2)) + 'px';
	};
	labels.forEach((x) => { x.addEventListener('mouseenter', () => { if (pinned == null) setHot(+x.dataset.k); }); x.addEventListener('click', () => keep(pinned === +x.dataset.k ? null : +x.dataset.k)); });
	// over the stack: the top-most plane under the pointer (a projected plane is a quad: test inside its corners)
	const inside = (q, x, y) => { let s = 0; for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]); if (c !== 0) { if (s && Math.sign(c) !== s) return false; s = Math.sign(c); } } return true; };
	const corners = (p) => [...p.querySelectorAll('.slab .q')].map((q) => { const r = q.getBoundingClientRect(); return [r.left, r.top]; });

	let pinned = null;
	// keep one layer in focus (click it or its label), or let go (click empty space, or it again)
	const keep = (k) => {
		pinned = k;
		v.classList.toggle('kept', k != null);
		labels.forEach((x) => x.classList.toggle('kept', +x.dataset.k === k));
		if (k != null) setHot(k);
		apply();
	};
	canvas.addEventListener('mousemove', (e) => {
		if (drag || pinned != null) return;
		for (let k = planes.length - 1; k >= 0; k--) if (inside(corners(planes[k]), e.clientX, e.clientY)) { setHot(k); return; }
	});
	let drag = null;
	canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, rx, rz, ry, px, py, pan: mode === 'specs' || e.shiftKey }; canvas.classList.add('drag'); stack.classList.add('fast'); canvas.setPointerCapture(e.pointerId); });
	canvas.addEventListener('pointermove', (e) => { if (!drag) return; if (drag.pan) { px = drag.px + e.clientX - drag.x; py = drag.py + e.clientY - drag.y; apply(); return; } if (Math.abs(drag.ry) > 5) { ry = Math.max(-80, Math.min(80, drag.ry + (e.clientX - drag.x) * 0.3)); rx = Math.max(-40, Math.min(85, drag.rx - (e.clientY - drag.y) * 0.3)); } else { rz = drag.rz + (e.clientX - drag.x) * 0.3; rx = Math.max(0, Math.min(85, drag.rx - (e.clientY - drag.y) * 0.3)); } flat = false; apply(); });
	canvas.addEventListener('pointerup', (e) => {
		const moved = drag && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4;
		const wasPan = drag?.pan;
		drag = null; canvas.classList.remove('drag'); stack.classList.remove('fast');
		if (moved) { if (wasPan && mode === 'specs') buildCallouts(); return; }
		// a click: keep the layer under the pointer, or let go on empty space
		let k = null;
		for (let j = planes.length - 1; j >= 0; j--) if (inside(corners(planes[j]), e.clientX, e.clientY)) { k = j; break; }
		keep(k);
	});
	// double-click: into the part under the pointer (the deepest one the thread knows), like Figma
	canvas.addEventListener('dblclick', (e) => {
		let k = null;
		for (let j = planes.length - 1; j >= 0; j--) if (inside(corners(planes[j]), e.clientX, e.clientY)) { k = j; break; }
		if (k == null || !V.layers[k].parts?.length) return;
		const cp = planes[k].querySelector('.copy');
		if (!cp) return;
		cp.style.pointerEvents = 'auto';
		cp.querySelectorAll('*').forEach((x) => (x.style.pointerEvents = 'auto'));
		let hits = [];
		try { hits = root.elementsFromPoint(e.clientX, e.clientY).filter((x) => cp.contains(x)); } finally { cp.style.pointerEvents = ''; cp.querySelectorAll('*').forEach((x) => (x.style.pointerEvents = '')); }
		const best = (items, i, trail = []) => { let found = null; for (const it of items ?? []) if (it.idx.includes(i)) { const t = [...trail, it]; found = best(it.kids, i, t) ?? t; break; } return found; };
		for (const h of hits) {
			const m = [...h.classList].map((c) => c.match(/^c(\d+)$/)?.[1]).find(Boolean);
			if (m == null) continue;
			const t = best(V.layers[k].parts, +m);
			if (t) { showPart(k, t); return; }
		}
	});
	// ---- Specs: callout cards around the flat element, each joined to its part
	const callBox = $('.callouts'), callSvg = $('svg.callines');
	let calls = [];
	const clearCallouts = () => { callBox.innerHTML = ''; callSvg.innerHTML = ''; calls = []; };
	const quadOf = (k) => { const q = corners(planes[k]); const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]); return { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) }; };
	const keyRows = (l) => {
		const rows = [];
		const look = l.specs ?? [];
		const find = (re) => look.find((r) => re.test(r.k));
		for (const re of [/^Fill/, /^Gradient/, /^Stroke/]) { const r = find(re); if (r) rows.push(r); }
		const type = l.type ?? [];
		const size = type.find((r) => r.k === 'Size / line'), weight = type.find((r) => r.k === 'Weight');
		if (size) rows.push({ k: 'Text style', v: `${size.v.split(' / ')[0]}${weight ? ` · ${weight.v}` : ''}` });
		const rad = find(/^Corner radius/); if (rad) rows.push(rad);
		const pad = (l.layout ?? []).find((r) => r.k === 'Padding'); if (pad) rows.push({ k: 'Padding', v: pad.v, pill: true });
		const sh = find(/^Shadow/); if (sh && rows.length < 4) rows.push(sh);
		if (!rows.length) { const sz = find(/^Size/); if (sz) rows.push(sz); }
		if (!rows.length && l.moving) rows.push(...look.slice(0, 2));
		return rows.slice(0, 4);
	};
	const buildCallouts = () => {
		clearCallouts();
		if (mode !== 'specs') return;
		const comp = (() => { let u = null; for (let k = 0; k < planes.length; k++) { const q = quadOf(k); u = u ? { l: Math.min(u.l, q.l), r: Math.max(u.r, q.r), t: Math.min(u.t, q.t), b: Math.max(u.b, q.b) } : { ...q }; } return u; })();
		if (!comp) return;
		// the parts worth a callout: not the whole panel, the bigger and more telling ones first, eight at most
		const W = V.size.w, H = V.size.h;
		let pick = V.layers.map((l, k) => ({ l, k, q: quadOf(k) })).filter((x) => x.l.moving || !(x.l.box && x.l.box.w >= W * 0.95 && x.l.box.h >= H * 0.95));
		if (!pick.length) pick = V.layers.map((l, k) => ({ l, k, q: quadOf(k) }));
		pick = pick.sort((a, b) => (b.l.moving - a.l.moving) || (b.l.box?.w * b.l.box?.h || 0) - (a.l.box?.w * a.l.box?.h || 0)).slice(0, 8);
		// one column on the left (the detail card has the right), as many as fit the screen
		// the column starts under the title and the preview of what was picked
		const top0 = Math.max(84, ($('.head')?.getBoundingClientRect().bottom ?? 72) + 12);
		const avail = innerHeight - top0 - 96;
		const per = avail / Math.max(1, pick.length) >= 120 ? 4 : avail / Math.max(1, pick.length) >= 76 ? 2 : 1;
		const fits = Math.max(1, Math.floor(avail / (per === 4 ? 112 : per === 2 ? 72 : 50)));
		const list = pick.slice(0, fits).sort((a, b) => (a.q.t + a.q.b) - (b.q.t + b.q.b));
		const colW = Math.min(216, Math.max(150, comp.l - 64 - 16));
		let floor = top0;
		for (const x of list) {
			const rows = keyRows(x.l).slice(0, per);
			const el2 = document.createElement('div');
			el2.className = 'callout l';
			el2.style.width = colW + 'px';
			el2.innerHTML = `<b>${esc(x.l.name.replace(/ \(layer-\d+\.\w+\)/, ''))}</b>${rows.map((r) => `<div class="cr"><span>${esc(r.k)}</span><em>${r.sw ? `<s style="background:${esc(r.sw)}"></s>` : ''}${r.pill ? `<i class="pill">${esc(r.v)}</i>` : esc(r.v)}</em></div>`).join('')}`;
			callBox.appendChild(el2);
			const h = el2.getBoundingClientRect().height;
			const want = (x.q.t + x.q.b) / 2 - h / 2;
			const y = Math.max(floor, Math.min(innerHeight - 96 - h, want));
			if (y + h > innerHeight - 88) { el2.remove(); break; } // no room left on screen: the rest stay in the list and the card
			floor = y + h + 8;
			el2.style.top = y + 'px';
			el2.style.left = '16px';
			el2.addEventListener('mouseenter', () => { if (pinned == null) setHot(x.k); });
			el2.addEventListener('click', () => keep(pinned === x.k ? null : x.k));
			calls.push({ el: el2, k: x.k, side: 'l' });
			requestAnimationFrame(() => el2.classList.add('in'));
		}
		if (hot == null && list.length) setHot(list[0].k);
		drawCallLines();
	};
	const drawCallLines = () => {
		if (mode !== 'specs') { callSvg.innerHTML = ''; return; }
		let out = '';
		for (const c of calls) {
			const b = c.el.getBoundingClientRect(), q0 = quadOf(c.k), lb = V.html && V.layers[c.k].box;
			// the dot lands on the part itself, not on the 10px of slab around it
			const fx = lb ? 10 / (lb.w + 20) : 0, fy = lb ? 10 / (lb.h + 20) : 0, qw = q0.r - q0.l, qh = q0.b - q0.t;
			const q = { l: q0.l + qw * fx, r: q0.r - qw * fx, t: q0.t + qh * fy, b: q0.b - qh * fy };
			const ax = c.side === 'l' ? q.l : q.r, ay = Math.max(q.t + 4, Math.min(q.b - 4, b.top + b.height / 2));
			const sx = c.side === 'l' ? b.right : b.left, sy = b.top + b.height / 2;
			const mx = c.side === 'l' ? Math.max(sx + 14, ax - 22) : Math.min(sx - 14, ax + 22);
			const isHot = c.k === hot;
			out += `<path class="${isHot ? 'hot' : ''}" d="M${sx},${sy} L${mx},${sy} L${mx},${ay} L${ax},${ay}"/><circle class="${isHot ? 'hot' : ''}" r="3" cx="${ax}" cy="${ay}"/>`;
			c.el.classList.toggle('hot', isHot);
		}
		callSvg.innerHTML = out;
	};
	addEventListener('resize', () => { if (mode === 'specs') { refit(); setTimeout(buildCallouts, 60); } });
	const ANGLES = { top: { ry: 0, rx: 55, rz: -40 }, front: { ry: -38, rx: 8, rz: 0 } };
	// zoom: wheel or pinch on the canvas (toward the pointer), the buttons, + − 0; pan by dragging (Specs) or Shift-drag
	const pct = $('.zb.pct');
	const centre = () => { const b = stage.getBoundingClientRect(); return { x: b.left + V.offset.x + V.clip.w / 2 + tx + px, y: b.top + V.offset.y + V.clip.h / 2 + ty + py }; };
	const zoomTo = (z, at) => {
		z = Math.max(0.2, Math.min(6, z));
		const c = centre(), f = z / zoom;
		if (at) { px += (at.x - c.x) * (1 - f); py += (at.y - c.y) * (1 - f); }
		zoom = z;
		pct.textContent = Math.round(zoom * 100) + '%';
		apply();
		clearTimeout(zoomTo.t); zoomTo.t = setTimeout(() => { if (mode === 'specs') buildCallouts(); }, 160);
	};
	const fitView = () => { zoom = 1; px = 0; py = 0; pct.textContent = '100%'; apply(); if (mode === 'specs') setTimeout(buildCallouts, 60); };
	canvas.addEventListener('wheel', (e) => { e.preventDefault(); stack.classList.add('fast'); zoomTo(zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), { x: e.clientX, y: e.clientY }); clearTimeout(canvas.t); canvas.t = setTimeout(() => stack.classList.remove('fast'), 120); }, { passive: false });
	root.querySelectorAll('.zb').forEach((b) => b.addEventListener('click', () => { const z = b.dataset.z; if (z === 'fit') fitView(); else zoomTo(zoom * (z === 'in' ? 1.25 : 0.8), centre()); }));
	const views = [...root.querySelectorAll('.vb')];
	views.forEach((b) => b.classList.toggle('on', b.dataset.v === mode));
	const setView = (name) => {
		views.forEach((b) => b.classList.toggle('on', b.dataset.v === name));
		const was = { tx, ty, sc };
		// where it will sit, measured with transitions off, then animated there
		const all2 = [stack, ...planes];
		all2.forEach((e) => (e.style.transition = 'none'));
		mode = name;
		zoom = 1; px = 0; py = 0; pct.textContent = '100%';
		v.classList.toggle('specs', name === 'specs');
		clearCallouts();
		({ ry, rx, rz } = name === 'specs' ? { ry: 0, rx: 0, rz: 0 } : ANGLES[name]);
		flat = name === 'specs'; flatBtn.textContent = 'Flatten';
		tx = 0; ty = 0; sc = 1; apply(); refit(); refit();
		const to = { tx, ty, sc };
		({ tx, ty, sc } = was); apply();
		stack.getBoundingClientRect();
		all2.forEach((e) => (e.style.transition = ''));
		requestAnimationFrame(() => { ({ tx, ty, sc } = to); apply(); if (name === 'specs') setTimeout(buildCallouts, 1050); });
	};
	views.forEach((b) => b.addEventListener('click', () => setView(b.dataset.v)));
	// the spread slider: drag anywhere along it, arrows step it
	const sld = $('.sld'), sfill = sld.querySelector('.fill'), sval = sld.querySelector('em');
	const showSpread = () => {
		const w = sld.clientWidth || 236, min = 76;
		sfill.style.width = Math.round(min + (w - min) * spread) + 'px';
		sval.textContent = (0.2 + spread * 2.3).toFixed(1) + '×';
		sld.setAttribute('aria-valuenow', String(Math.round(spread * 100)));
		sld.querySelectorAll('.dots i').forEach((d) => { const x = d.getBoundingClientRect().left - sld.getBoundingClientRect().left; d.style.opacity = x < sfill.offsetWidth - 4 ? '0' : '1'; });
	};
	const setSpread = (v) => { spread = Math.max(0, Math.min(1, v)); flat = false; flatBtn.textContent = 'Flatten'; showSpread(); apply(); };
	const fromX = (x) => { const b = sld.getBoundingClientRect(), min = 76; return (x - b.left - min / 2) / (b.width - min); };
	sld.addEventListener('pointerdown', (e) => { sld.setPointerCapture(e.pointerId); sld.classList.add('drag'); setSpread(fromX(e.clientX)); });
	sld.addEventListener('pointermove', (e) => { if (sld.classList.contains('drag')) setSpread(fromX(e.clientX)); });
	sld.addEventListener('pointerup', () => sld.classList.remove('drag'));
	sld.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); setSpread(spread + 0.05); } if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); setSpread(spread - 0.05); } });
	requestAnimationFrame(showSpread);
	const flatBtn = $('[data-a=flat]');
	flatBtn.addEventListener('click', () => { flat = !flat; flatBtn.textContent = flat ? 'Spread out' : 'Flatten'; apply(); });
	$('[data-a=all]').addEventListener('click', (e) => { const t = V.all || V.layers.map((l) => l.prompt).filter(Boolean).join('\n\n---\n\n'); if (t) copy(t, e.currentTarget, 'Copy whole thing'); else { e.currentTarget.textContent = 'Writing prompt…'; setTimeout(() => (e.currentTarget.textContent = 'Copy whole thing'), 1400); } });
	const loop = () => { if (!host.isConnected) return; lines(); requestAnimationFrame(loop); };
	requestAnimationFrame(loop);
	// when the motion arrives: new card rows and prompts, in place
	// sizes: ready ones can be shown; the one on screen is lit
	const szBtns = [...root.querySelectorAll('.sz')];
	const paintSizes = () => szBtns.forEach((b) => {
		const id = b.dataset.z, d = id === mine ? 'mine' : V.sizes[id];
		b.classList.toggle('on', id === (V.sizeId ?? mine));
		b.classList.toggle('wait', !d);
		b.classList.toggle('none', !!d && d !== 'mine' && (d.missing || d.hidden));
		b.title = d?.hidden ? 'Hidden at this size' : d?.missing ? 'Not found at this size' : !d ? 'Laying it out at this size…' : '';
	});
	paintSizes();
	szBtns.forEach((b) => b.addEventListener('click', () => {
		const id = b.dataset.z;
		if (id === (V.sizeId ?? mine)) return;
		const d = id === mine ? V.sizes.__mine : V.sizes[id];
		if (!d || d.missing || d.hidden) return;
		const base = V.sizes.__mine ?? V;
		window.__spView = { ...d, el, title: base.title, all: base.all, mirror: id === mine ? base.mirror : null, sizes: V.sizes, sizeId: id, mineSize: mine, width: V.width, was, again: true, spread, angle: { ry, rx, rz }, view: mode };
		window.__spViewer();
	}));
	V.sizes.__mine ??= { ...V };
	window.__spViewUpdate = (patch) => {
		if (patch.size) { V.sizes[patch.size.id] = patch.size.data; paintSizes(); }
		if (patch.all) V.all = patch.all;
		const target = V.sizeId && V.sizeId !== mine ? V.sizes.__mine?.layers ?? [] : V.layers;
		(patch.layers ?? []).forEach((p, k) => { if (target[k]) Object.assign(target[k], p); });
		if (patch.all && V.sizes.__mine) V.sizes.__mine.all = patch.all;
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
	const onKey = (e) => { if ((e.key === '+' || e.key === '=') && !e.metaKey) { e.preventDefault(); zoomTo(zoom * 1.25, centre()); return; } if (e.key === '-' && !e.metaKey) { e.preventDefault(); zoomTo(zoom * 0.8, centre()); return; } if (e.key === '0' && !e.metaKey) { e.preventDefault(); fitView(); return; } if ((e.key === 'v' || e.key === 'V') && !e.metaKey && !e.ctrlKey) { setView(views.find((b) => !b.classList.contains('on')).dataset.v); return; } if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
	addEventListener('keydown', onKey, true);
	$('[data-a=close]').addEventListener('click', close);
	window.__spViewClose = close;
	window.__spViewState = () => ({ tx, ty, sc, rx, ry, rz, flat, hot, transform: stack.style.transform });
}

/**
 * In the page, the moment Break it down is pressed: the pick exactly as it is on screen now (read-only), grouped into
 * layers, and the view opened on it. Returns what the server needs to build the lesson from the same picture.
 */
export async function instant(el, title, area = null, show = true, pre = null) {
	// taken when they clicked (a menu open on hover, a state that has gone since): show that, not what is there now
	if (pre && show) {
		const V = { ...pre, el: null, title, area, mirror: pre.mirror ?? [], partDetail: pre.partDetail, width: pre.width };
		window.__spView = V;
		window.__spViewer();
		return { html: pre.html, rules: pre.rules, fonts: pre.fonts ?? [], bg: pre.bg, size: pre.size, why: pre.why ?? {}, fromClick: true, layers: pre.layers.map(({ specs, type, layout, holds, parts, why: w, design, eng, authored, ...l }) => ({ ...l, authored })) };
	}
	const K = window.__spKit;
	if (!K || !window.__spSnap || !el) return null;
	// a transition still running (a menu sliding open) settles first: the copy is of where it comes to rest
	try {
		const running = el.getAnimations({ subtree: true }).filter((an) => an.constructor.name === 'CSSTransition' && an.playState === 'running');
		if (running.length) await Promise.race([Promise.all(running.map((an) => an.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 700))]);
	} catch {}
	el.setAttribute('data-sp-picked', '1');
	let snap = null;
	try { snap = window.__spSnap('[data-sp-picked]'); } finally { el.removeAttribute('data-sp-picked'); }
	if (!snap) return null;
	const live = new Map([el, ...el.querySelectorAll('[data-sp-n]')].map((e) => [+e.getAttribute('data-sp-n'), e]));
	const a = K.anatomyOf(el, (e) => { const v = e.getAttribute('data-sp-n'); return v == null ? null : +v; }, area);
	// what is moving right now, whatever moves it (CSS, Web Animations, a script): two frames apart, what changed
	const look = (e) => { const c = getComputedStyle(e); return `${c.transform}|${c.opacity}|${c.filter}|${c.clipPath}|${c.translate}|${c.scale}|${c.rotate}|${c.strokeDashoffset}|${c.strokeDasharray}|${c.stroke}|${c.fill}|${c.offsetDistance}|${c.backgroundPosition}|${c.getPropertyValue('d')}`; };
	const before = new Map([...live].map(([i, e]) => [i, look(e)]));
	await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30))));
	const moving = new Set(), bigMoving = new Set();
	for (const [i, e] of live) if (i !== 0 && before.get(i) !== look(e)) moving.add(i);
	for (const [i, e] of live) if (i !== 0 && e.getAnimations().some((an) => an.effect?.target === e && an.constructor.name !== 'CSSTransition' && an.playState === 'running')) moving.add(i);
	// a canvas is drawn by a script: it plays live (its pixels are copied into the view every frame)
	for (const [i, e] of live) if (i !== 0 && e.tagName === 'CANVAS' && e.width * e.height >= 1600) moving.add(i);
	// a moving part's own moving children move with it: keep the top-most
	// a big container that moves (the whole panel sliding in) is not background motion: its parts group as they are
	const rootArea = Math.max(1, a.nodes[0].box.w * a.nodes[0].box.h);
	const paintsUnder = (e) => [...e.querySelectorAll('[data-sp-n]')].length;
	for (const i of [...moving]) { const n = a.nodes.find((x) => x.i === i), e = live.get(i); if (n && e && e.tagName !== 'CANVAS' && (n.box.w * n.box.h > rootArea * 0.25 || paintsUnder(e) >= 8)) { moving.delete(i); bigMoving.add(i); } }
	const movingTop = new Set([...moving].filter((i) => { for (let x = live.get(i)?.parentElement; x && x !== el; x = x.parentElement) { const j = x.getAttribute('data-sp-n'); if (j != null && moving.has(+j)) return false; } return true; }));
	// what can actually be seen: a part entirely covered by others (an icon behind a card) is not torn out of the picture
	const R = { left: a.vis.x, top: a.vis.y };
	const covered = new Set();
	const seenOp = new Map();
	const blocks = (t) => {
		if (/^(CANVAS|svg)$/i.test(t.tagName) || t.closest?.('svg') && t.tagName.toLowerCase() !== 'svg' || t.closest('site-prompt-ui,site-prompt-view')) return false;
		const j = t.getAttribute?.('data-sp-n');
		if (j != null && moving.has(+j)) return false;
		const c = getComputedStyle(t);
		if (c.visibility === 'hidden') return false;
		// how see-through it really is: its own opacity times every parent's (a hidden panel stacked over this one)
		let op = 1;
		for (let x = t; x && x !== document.documentElement; x = x.parentElement) { if (seenOp.has(x)) { op *= seenOp.get(x); break; } op *= parseFloat(getComputedStyle(x).opacity); if (op < 0.6) break; }
		if (op < 0.6) return false;
		if (/^(IMG|VIDEO|PICTURE|IFRAME)$/.test(t.tagName)) return true;
		const v = (c.backgroundColor.match(/[\d.]+/g) ?? []).map(Number);
		return v.length >= 3 && (v[3] ?? 1) > 0.6 || /url\(/.test(c.backgroundImage);
	};
	const pe = document.createElement('style');
	pe.textContent = '[data-sp-n]{pointer-events:auto!important}';
	document.head.appendChild(pe);
	try {
		for (const n of a.nodes) {
			if (n === a.nodes[0] || moving.has(n.i) || !(n.paint.length || Object.values(n.pseudos).some((v) => v.paint.length)) || n.box.w < 2 || n.box.h < 2) continue;
			const e = live.get(n.i);
			if (!e) continue;
			let hits = 0;
			for (let gy = 1; gy <= 4 && !hits; gy++) for (let gx = 1; gx <= 4 && !hits; gx++) {
				const x = R.left + n.box.x + (n.box.w * gx) / 5, y = R.top + n.box.y + (n.box.h * gy) / 5;
				if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) { hits++; continue; } // off screen: cannot tell, keep it
				// look down through what lies above it: only something that really hides it (a filled box, a picture) counts;
				// a see-through canvas, an outline, a text layer or a moving overlay on top does not
				for (const t of document.elementsFromPoint(x, y)) {
					// reaching it, a part of it, or what holds it (painted underneath it) means nothing above hides it here
					if (t === e || e.contains(t) || t.contains(e)) { hits++; break; }
					if (blocks(t)) break;
				}
			}
			if (!hits) covered.add(n.i);
		}
	} finally { pe.remove(); }
	// a safety net: when much of what they picked would count as hidden, the check is fooled (an overlay, a stacking
	// trick), not the picture: keep every part rather than lose what they can see
	const candidates = a.nodes.filter((n) => n !== a.nodes[0] && !moving.has(n.i) && (n.paint.length || Object.values(n.pseudos).some((v) => v.paint.length)) && n.box.w >= 2 && n.box.h >= 2 && n.op > 0.04).length;
	if (covered.size > Math.max(3, candidates / 3)) covered.clear();
	const seenNodes = a.nodes.map((n) => (covered.has(n.i) ? { ...n, paint: [], pseudos: {} } : moving.has(n.i) ? { ...n, anim: true } : n));
	// motion as background (a few floating parts) gets its own layer; motion that IS the drawing (most of it moves, or
	// it is an svg) stays in its groups and plays there: the mirror animates every copy wherever it sits
	const paintingCount = a.nodes.filter((n) => n.paint.length || Object.values(n.pseudos).some((v) => v.paint.length)).length || 1;
	const motionIsTheThing = el.tagName.toLowerCase() === 'svg' || el.querySelector(':scope > svg') && el.children.length === 1 || (moving.size >= 6 && moving.size / paintingCount > 0.5);
	let groups = K.groupLayers(seenNodes, [], 12, motionIsTheThing ? null : movingTop);
	// background motion sits low in the stack, just above the panel
	const mv = groups.find((g) => g.moving);
	if (mv) { groups = groups.filter((g) => g !== mv); groups.splice(groups[0]?.name === 'Panel' ? 1 : 0, 0, mv); }
	const why = { ...K.why(a.nodes), covered: covered.size, moving: moving.size };
	console.debug('[site-prompt] break it down', why, groups.map((g) => g.name));
	// the details a card needs beyond its look: type, layout, what it holds, why it works
	const rgb = (c) => (String(c).match(/[\d.]+/g) ?? []).map(Number);
	const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
	const bgOf = (e) => { for (let x = e; x; x = x.parentElement) { const c = getComputedStyle(x).backgroundColor; const v = rgb(c); if (v.length >= 3 && (v[3] ?? 1) > 0.5) return v; } return [255, 255, 255]; };
	const detail = (g) => {
		const e = live.get(g.i);
		if (!e) return {};
		const cs = getComputedStyle(e);
		const out = {};
		const textEl = g.members.map((i) => live.get(i)).find((m) => m && [...m.childNodes].some((t) => t.nodeType === 3 && t.textContent.trim())) || ([...e.childNodes].some((t) => t.nodeType === 3 && t.textContent.trim()) ? e : [...e.querySelectorAll('*')].find((m) => [...m.childNodes].some((t) => t.nodeType === 3 && t.textContent.trim())));
		if (textEl) {
			const t = getComputedStyle(textEl);
			const fg = rgb(t.color), back = bgOf(textEl);
			const L1 = lum(fg), L2 = lum(back), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
			out.type = [
				{ k: 'Font', v: t.fontFamily.split(',')[0].replace(/["']/g, '') },
				{ k: 'Size / line', v: `${t.fontSize} / ${t.lineHeight}` },
				{ k: 'Weight', v: t.fontWeight },
				...(t.letterSpacing !== 'normal' && t.letterSpacing !== '0px' ? [{ k: 'Tracking', v: t.letterSpacing }] : []),
				{ k: 'Colour', v: t.color.replace(/\s+/g, ''), sw: t.color },
				{ k: 'Contrast', v: `${ratio.toFixed(1)} : 1 ${ratio >= 4.5 ? '(AA)' : ratio >= 3 ? '(AA large)' : '(low)'}` },
			];
		}
		const flex = /flex/.test(cs.display), grid = /grid/.test(cs.display);
		const pad = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft];
		const padV = pad.every((x) => x === pad[0]) ? pad[0] : pad[0] === pad[2] && pad[1] === pad[3] ? `${pad[0]} ${pad[1]}` : pad.join(' ');
		out.layout = [
			{ k: 'Layout', v: flex ? `flex, ${cs.flexDirection}` : grid ? `grid, ${cs.gridTemplateColumns.split(' ').length} column${cs.gridTemplateColumns.split(' ').length > 1 ? 's' : ''}` : cs.display },
			...((flex || grid) && cs.rowGap !== 'normal' && cs.rowGap !== '0px' ? [{ k: 'Gap', v: cs.rowGap === cs.columnGap ? cs.rowGap : `${cs.rowGap} ${cs.columnGap}` }] : []),
			...(padV !== '0px' ? [{ k: 'Padding', v: padV }] : []),
			...(flex || grid ? [{ k: 'Align', v: `${cs.alignItems}${cs.justifyContent !== 'normal' ? `, ${cs.justifyContent}` : ''}` }] : []),
			...(cs.position !== 'static' ? [{ k: 'Position', v: `${cs.position}${cs.zIndex !== 'auto' ? `, z ${cs.zIndex}` : ''}` }] : []),
		];
		const words = [...new Set(g.members.map((i) => live.get(i)).filter(Boolean).flatMap((m) => [...m.childNodes].filter((t) => t.nodeType === 3).map((t) => t.textContent.trim())).filter((t) => /[A-Za-z0-9]{2}/.test(t)))];
		if (g.sub && words.length) out.holds = words.slice(0, 5);
		// why it works: the technique, in one line each
		const W = [];
		const sh = cs.boxShadow === 'none' ? [] : cs.boxShadow.split(/,(?![^(]*\))/).map((x) => x.trim()).filter((x) => !/^rgba\([^)]*,\s*0\)/.test(x));
		const ring = sh.find((x) => /\b0px 0px 0px 1px\b/.test(x));
		if (ring && /inset/.test(ring)) W.push('Its edge is an inset 1px shadow, so it has a border that takes no space and never shifts the layout.');
		else if (ring) W.push('A 1px shadow ring stands in for a border: it draws the edge without adding to the size.');
		const outer = sh.filter((x) => !/inset/.test(x) && !/\b0px 0px 0px 1px\b/.test(x));
		if (outer.length >= 3) W.push(`${outer.length} shadows stacked: tight ones draw the contact edge, wide soft ones (negative spread) give lift without a heavy halo.`);
		if (/gradient/.test(cs.backgroundImage) && sh.some((x) => /inset/.test(x) && /255, 255, 255/.test(x))) W.push('A vertical gradient plus a 1px white inner highlight makes it look slightly convex, like a physical key.');
		const bw = parseFloat(cs.borderTopWidth) || 0;
		if (bw > 1 && e.parentElement) { const sib = [...e.parentElement.children].filter((x) => x !== e && x.tagName === e.tagName).map((x) => parseFloat(getComputedStyle(x).borderTopWidth) || 0); if (sib.length && sib.every((x) => x < bw)) W.push(`Selected: shown by a heavier ${bw}px border in a darker colour, not by fill or size, so nothing around it moves.`); }
		if (cs.overflow !== 'visible' && parseFloat(cs.borderTopLeftRadius) > 0) W.push('It clips everything inside to its rounded corners.');
		if (cs.maskImage && cs.maskImage !== 'none' && /gradient/.test(cs.maskImage)) W.push('A gradient mask fades it out instead of cutting it off.');
		if (cs.aspectRatio && cs.aspectRatio !== 'auto') W.push(`Locked to an aspect ratio (${cs.aspectRatio}), so it scales without stretching.`);
		if (cs.zIndex !== 'auto' && +cs.zIndex > 0) W.push(`z-index ${cs.zIndex} keeps it above what floats behind it.`);
		const op = parseFloat(cs.opacity);
		if (op > 0 && op < 0.5) W.push(`Kept faint (opacity ${op}) so it stays in the background.`);
		if (g.moving) W.push('It moves on its own on the page; here it plays live, in step with the page.');
		out.why = W.slice(0, 3);
		// ---- design details
		const D = [];
		const px = (v) => parseFloat(v) || 0;
		const spacing = [...new Set([...pad, cs.rowGap, cs.columnGap].map(px).filter((v) => v > 0))];
		if (spacing.length) { const grid = spacing.every((v) => v % 8 === 0) ? 8 : spacing.every((v) => v % 4 === 0) ? 4 : 0; D.push({ k: 'Spacing', v: `${spacing.sort((x, y) => x - y).join(' / ')}px${grid ? `, on a ${grid}px grid` : ', off-grid'}` }); }
		const rad = px(cs.borderTopLeftRadius);
		if (rad && e.parentElement) {
			const pcs = getComputedStyle(e.parentElement), pr = px(pcs.borderTopLeftRadius), pp = Math.min(px(pcs.paddingTop), px(pcs.paddingLeft));
			if (pr && pp) D.push({ k: 'Corner nesting', v: Math.abs(pr - pp - rad) <= 1 ? `concentric (${pr} − ${pp} = ${rad})` : `outer ${pr}, inner ${rad} (concentric would be ${Math.max(0, pr - pp)})` });
		}
		const outerSh = sh.filter((x) => !/inset/.test(x));
		if (outerSh.length) { const maxBlur = Math.max(...outerSh.map((x) => { const n = x.replace(/rgba?\([^)]*\)/g, '').trim().split(/\s+/).map(px); return n[2] || 0; })); D.push({ k: 'Elevation', v: `${maxBlur >= 32 ? 'high (floating)' : maxBlur >= 12 ? 'medium (raised)' : maxBlur > 0 ? 'low (resting)' : 'flat'}, ${outerSh.length} shadow${outerSh.length > 1 ? 's' : ''}` }); }
		// ---- the site's own rules for it: as written, with variables, media queries and states
		const rules = [];
		const walk = (list, cond) => {
			for (const r of list) {
				if (r.constructor.name === 'CSSStyleRule') {
					for (const part of r.selectorText.split(',')) {
						const state = (part.match(/:(hover|focus-visible|focus-within|focus|active|checked|disabled|aria-[\w-]+)/) || [])[1] || null;
						const pseudo = (part.match(/::?(before|after)\b/) || [])[1] || null;
						const base = part.replace(/::?(hover|focus-visible|focus-within|focus|active|checked|disabled|before|after|placeholder|marker|selection)\b(\([^)]*\))?/g, '').trim() || '*';
						let m = false; try { m = e.matches(base); } catch {}
						// only rules aimed at it (a class, an id, an attribute), not resets for every element
						if (m && /[.#\[]/.test(base) && !/^[\s*]*$/.test(base)) {
							const css = [...r.style].filter((p) => !/^--tw-/.test(p)).map((p) => `${p}: ${r.style.getPropertyValue(p)}${r.style.getPropertyPriority(p) ? ' !important' : ''}`).join('; ');
							if (css) rules.push({ sel: part.trim(), state, pseudo, cond: cond.join(' › '), css });
							break;
						}
					}
				} else if (r.cssRules) walk(r.cssRules, [...cond, `@${r.constructor.name.replace(/^CSS|Rule$/g, '').toLowerCase()}${r.conditionText || r.media?.mediaText ? ' ' + (r.conditionText || r.media.mediaText) : r.name ? ' ' + r.name : ''}`]);
			}
		};
		let blocked = 0;
		for (const sheet of document.styleSheets) { let list; try { list = sheet.cssRules; } catch { blocked++; continue; } walk(list, []); }
		const authored = rules.filter((r) => r.css).slice(0, 40);
		out.authored = authored.map((r) => `${r.cond ? `/* ${r.cond} */ ` : ''}${r.sel} { ${r.css} }`).join('\n').slice(0, 6000);
		const tokens = [...new Set(authored.flatMap((r) => [...r.css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1])))].filter((t) => !/^--tw-/.test(t)).slice(0, 10);
		for (const t of tokens) D.push({ k: t, v: (cs.getPropertyValue(t).trim() || '?').slice(0, 40), sw: /^(#|rgb|hsl|oklch|lab|color)/.test(cs.getPropertyValue(t).trim()) ? cs.getPropertyValue(t).trim() : undefined });
		out.design = D;
		// ---- engineering
		const E = [];
		const tag = e.tagName.toLowerCase();
		const role = e.getAttribute('role'), aria = [...e.attributes].filter((x) => x.name.startsWith('aria-')).map((x) => `${x.name}="${x.value.slice(0, 20)}"`);
		E.push({ k: 'Element', v: `<${tag}${role ? ` role="${role}"` : ''}${e.getAttribute('type') ? ` type="${e.getAttribute('type')}"` : ''}>${aria.length ? ' ' + aria.slice(0, 2).join(' ') : ''}` });
		const cls = typeof e.className === 'string' ? e.className.trim().split(/\s+/).filter(Boolean) : [];
		if (cls.length) { const tw = cls.filter((c) => /^(-?[a-z]+:)*-?(p[xytrbl]?|m[xytrbl]?|gap|w|h|min-w|max-w|rounded|shadow|text|bg|border|flex|grid|items|justify|font|leading|tracking|opacity|z|inset|top|left|right|bottom|transition|duration|ease)-?/.test(c) || /\[.+\]/.test(c)); E.push({ k: tw.length >= Math.max(2, cls.length / 2) ? 'Tailwind classes' : 'Classes', v: cls.slice(0, 8).join(' ').slice(0, 120) }); }
		const states = [...new Set(rules.filter((r) => r.state).map((r) => r.state))];
		E.push({ k: 'States in CSS', v: states.length ? states.map((x) => ':' + x).join(' ') : 'none written' });
		const media = [...new Set(rules.map((r) => r.cond).filter((c) => /@media|@container/.test(c)))];
		if (media.length) E.push({ k: 'Responsive', v: media.slice(0, 3).map((m) => m.replace(/^@(media|container) /, '')).join(' · ').slice(0, 120) });
		if (cs.transitionDuration && cs.transitionDuration !== '0s') {
			const props = cs.transitionProperty.split(',').map((x) => x.trim());
			const cheap = props.every((x) => /^(transform|opacity|translate|scale|rotate|filter)$/.test(x));
			E.push({ k: 'Transitions', v: `${props.join(', ')} (${cs.transitionDuration.split(',')[0].trim()}, ${cs.transitionTimingFunction.split(/,(?![^(]*\))/)[0].trim()})${cheap ? ', GPU-friendly' : props.includes('all') ? ', all properties (costly)' : ', animates layout or paint'}` });
		}
		if (cs.willChange !== 'auto') E.push({ k: 'will-change', v: cs.willChange });
		const interactive = e.matches('a[href],button,input,select,textarea,summary,[role=button],[tabindex]');
		if (interactive) {
			const rr = e.getBoundingClientRect();
			E.push({ k: 'Hit size', v: `${Math.round(rr.width)} × ${Math.round(rr.height)}${Math.min(rr.width, rr.height) >= 44 ? ', comfortable' : Math.min(rr.width, rr.height) >= 24 ? ', meets 24px minimum' : ', below 24px'}` });
			E.push({ k: 'Focus style', v: states.some((x) => /focus/.test(x)) ? 'written (:focus / :focus-visible)' : 'none written (browser default)' });
		}
		if (blocked) E.push({ k: 'Note', v: `${blocked} stylesheet${blocked > 1 ? 's' : ''} from another origin could not be read` });
		out.eng = E;
		return out;
	};
	const fonts = [];
	for (const sh of document.styleSheets) {
		let rules = null;
		try { rules = sh.cssRules; } catch { continue; }
		for (const r of rules) if (r.constructor.name === 'CSSFontFaceRule' && snap.families.some((f) => r.cssText.includes(f))) fonts.push(r.cssText.replace(/url\(["']?([^"')]+)["']?\)/g, (m, u) => { try { return `url("${new URL(u, sh.href || location.href).href}")`; } catch { return m; } }));
	}
	const details = groups.map(detail);
	document.querySelectorAll('[data-sp-n]').forEach((e) => e.removeAttribute('data-sp-n'));
	let bg = null;
	for (let x = el; x && !bg; x = x.parentElement) { const c = getComputedStyle(x).backgroundColor; if (c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c)) bg = c; }
	bg ??= '#ffffff';
	const r0 = el.getBoundingClientRect(), r = { width: a.vis.w, height: a.vis.h };
	// measured in the same moment as the anatomy (the page may still be scrolling smoothly)
	const visOff = a.visOff ?? { x: 0, y: 0 };
	const hiddenNote = covered.size ? { k: 'Hidden behind others', v: `${covered.size} ${covered.size > 1 ? 'parts' : 'part'}` } : null;
	// what each layer holds, as a tree a person can open (a card → its title, its text, its drawing → the drawing's
	// lines and circles); drawings group by what they draw, and a run of alike parts (digits, list rows) folds into one
	const nodeOf = new Map(a.nodes.map((n) => [n.i, n]));
	const paintsN = (n) => n && (n.paint.length || Object.values(n.pseudos).some((v) => v.paint.length));
	const unionBox = (idx) => { const xs = idx.map((i) => nodeOf.get(i)?.box).filter((b) => b && b.w > 0 && b.h > 0); if (!xs.length) return null; const x = Math.min(...xs.map((b) => b.x)), y = Math.min(...xs.map((b) => b.y)); return { x, y, w: Math.max(...xs.map((b) => b.x + b.w)) - x, h: Math.max(...xs.map((b) => b.y + b.h)) - y }; };
	let partId = 0;
	const kindOf = (n) => { const has = (k) => n.paint.some((q) => q.k === k); if (has('text')) return 'Text'; if (n.tag === 'circle' || n.tag === 'ellipse') return 'Circles'; if (n.tag === 'rect') return 'Rectangles'; if (has('stroke') && n.paint.some((q) => q.k === 'stroke' && /dashed/.test(q.v))) return 'Dashed lines'; if (has('stroke') && !has('vfill')) return 'Lines'; if (has('media')) return 'Images'; return 'Shapes'; };
	const partsOf = (members) => {
		const M = new Set(members);
		const up = (i) => { for (let p = nodeOf.get(i)?.p; p != null; p = nodeOf.get(p)?.p) if (M.has(p)) return p; return null; };
		const kidsM = new Map();
		for (const i of members) { const u = up(i); (kidsM.get(u) ?? kidsM.set(u, []).get(u)).push(i); }
		const all = (i) => [i, ...(kidsM.get(i) ?? []).flatMap(all)];
		const item = (i, depth) => {
			const n = nodeOf.get(i);
			const it = { id: ++partId, i, idx: [i], name: K.nameOf(n, []), box: n.box, kids: [] };
			const under = kidsM.get(i) ?? [];
			if (n.tag === 'svg') {
				// a drawing: its shapes by what they draw
				const shapes = under.flatMap(all).filter((j) => paintsN(nodeOf.get(j)));
				const kinds = new Map();
				for (const j of shapes) { const k2 = kindOf(nodeOf.get(j)); (kinds.get(k2) ?? kinds.set(k2, []).get(k2)).push(j); }
				it.name = n.alt || (n.box.w <= 32 && n.box.h <= 32 ? 'Icon' : 'Drawing');
				it.idx = [i, ...shapes];
				it.note = `svg, ${shapes.length} shape${shapes.length === 1 ? '' : 's'}`;
				for (const [k2, js] of kinds) it.kids.push({ id: ++partId, i: js[0], idx: js, name: `${k2} (${js.length})`, box: unionBox(js), kids: [] });
				return it;
			}
			if (depth > 5) { it.idx = all(i); return it; }
			// a run of alike parts folds into one row
			const byKey = new Map();
			for (const j of under) { const c = nodeOf.get(j); const key = `${c.tag}|${c.paint.map((q) => q.k).sort().join(',')}|${(kidsM.get(j) ?? []).length}`; (byKey.get(key) ?? byKey.set(key, []).get(key)).push(j); }
			for (const j of under) {
				const c = nodeOf.get(j), key = `${c.tag}|${c.paint.map((q) => q.k).sort().join(',')}|${(kidsM.get(j) ?? []).length}`, run = byKey.get(key);
				if (run.length >= 4) { if (run[0] !== j) continue; const idx = run.flatMap(all); it.kids.push({ id: ++partId, i: j, idx, name: `${run.length} × ${K.nameOf(c, []).replace(/ ".*$/, '')}`, box: unionBox(idx), kids: [] }); continue; }
				it.kids.push(item(j, depth + 1));
			}
			it.idx = all(i);
			return it;
		};
		let top = (kidsM.get(null) ?? []).map((i) => item(i, 0));
		// the layer itself is not a level of its own: start at what it holds
		if (top.length === 1 && !top[0].kids.length) return [];
		if (top.length === 1 && nodeOf.get(top[0].i)?.tag !== 'svg') top = top[0].kids;
		return top;
	};
	const layers = groups.map((g, k) => ({
		parts: g.moving ? [] : partsOf(g.members),
		n: k + 1, i: g.i, sub: g.sub, members: g.members, name: g.name, box: g.box, moving: !!g.moving, force: !g.moving && g.n.fx.opacity === '0',
		specs: g.moving ? [{ k: 'Plays', v: 'live, in step with the page' }, { k: 'Moving parts', v: String(movingTop.size) }] : [...K.groupSpecs({ ...g.n, sub: g.sub, members: g.members }, undefined), ...(k === 0 && hiddenNote ? [hiddenNote] : [])],
		...details[k],
	}));
	const partDetail = (idx) => {
		const n = nodeOf.get(idx[0]);
		if (!n) return null;
		const g = { i: n.i, n, members: idx, sub: idx.length > 1 };
		let d = {};
		try { d = detail(g); } catch {}
		return { specs: K.groupSpecs({ ...n, sub: g.sub, members: idx }, undefined), ...d };
	};
	// the view mirrors the moving parts from the page every frame (the page keeps animating underneath)
	const mirror = [...moving, ...bigMoving].map((i) => ({ i, el: live.get(i) })).filter((m) => m.el);
	const V = { el, title, area, mirror, html: snap.html, rules: snap.rules, bg, rootW: Math.round(r0.width * 100) / 100, size: { w: r.width, h: r.height }, offset: visOff, clip: { w: r.width, h: r.height }, layers };
	// at another width (the server lays it out there): the view's data only, nothing shown
	if (!show) {
		const out = { title, html: snap.html, rules: snap.rules, fonts: [...new Set(fonts)], why, bg, rootW: V.rootW, size: V.size, offset: V.offset, clip: V.clip, layers, width: innerWidth };
		Object.defineProperty(out, 'mirror', { value: mirror, enumerable: false }); // live elements: kept in the page, never sent
		Object.defineProperty(out, 'partDetail', { value: partDetail, enumerable: false });
		return out;
	}
	V.width = innerWidth;
	V.partDetail = partDetail;
	window.__spView = V;
	window.__spViewer();
	return { html: snap.html, rules: snap.rules, fonts: [...new Set(fonts)], bg, size: V.size, why, layers: layers.map(({ specs, type, layout, holds, parts, why: w, design, eng, authored, ...l }) => ({ ...l, authored })) };
}
