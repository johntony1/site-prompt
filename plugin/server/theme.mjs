// The look of everything site-prompt puts on a page (picker toolbar, note card, placer): dark, Linear-like, crisp
// hairlines, one indigo accent, and a border beam that runs slowly at rest and quickly while the agent works.
// Injected as window.__spTheme so the in-page functions (serialised with toString) share one stylesheet.

export const THEME = String.raw`
:host{all:initial}
[hidden]{display:none!important}
*{box-sizing:border-box;margin:0;font-family:"Inter Variable",Inter,ui-sans-serif,-apple-system,"SF Pro Text",system-ui,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;font-feature-settings:"cv11","ss01";letter-spacing:-.006em}
:host{--bg:#0e0e10;--panel:#131315;--raised:#1a1a1d;--line:rgba(255,255,255,.075);--line2:rgba(255,255,255,.12);--text:#f7f8f8;--text2:#d0d3d9;--muted:#8a8f98;--faint:#5c6068;--accent:#7170ff;--accent2:#5e6ad2;--danger:#eb5757}

/* on the page: what the pointer is over, and what is picked */
.hl{position:fixed;pointer-events:none;border:1px solid var(--accent);background:rgba(113,112,255,.06);border-radius:6px;display:none;box-shadow:0 0 0 3px rgba(113,112,255,.14);transition:left 80ms cubic-bezier(.2,0,0,1),top 80ms cubic-bezier(.2,0,0,1),width 80ms cubic-bezier(.2,0,0,1),height 80ms cubic-bezier(.2,0,0,1)}
.chip{position:fixed;pointer-events:none;display:none;align-items:center;gap:6px;height:24px;padding:0 8px;background:var(--panel);color:var(--text);border:1px solid var(--line2);border-radius:7px;font-size:11.5px;font-weight:550;line-height:1;white-space:nowrap;box-shadow:0 6px 16px -4px rgba(0,0,0,.5)}
.chip:before{content:"";width:6px;height:6px;border-radius:2px;background:var(--accent)}
.chip i{font-style:normal;color:var(--muted);font-weight:450;font-variant-numeric:tabular-nums}
.ring{position:fixed;pointer-events:none;border:1px solid var(--accent);border-radius:6px;box-shadow:0 0 0 3px rgba(113,112,255,.12)}
.badge{appearance:none;border:0;padding:0;cursor:pointer;font-family:inherit;transition:transform 120ms cubic-bezier(.2,0,0,1);position:fixed;pointer-events:auto;width:20px;height:20px;border-radius:6px;background:var(--accent2);color:#fff;font-size:11px;font-weight:650;display:grid;place-items:center;font-variant-numeric:tabular-nums;box-shadow:0 0 0 1.5px var(--bg),0 4px 10px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.2)}

.badge:hover{transform:scale(1.12)}
/* surfaces */
.surface{position:fixed;pointer-events:auto;background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,0) 40%),var(--panel);border:1px solid var(--line);color:var(--text);box-shadow:0 0 0 1px rgba(0,0,0,.55),0 1px 0 rgba(255,255,255,.04) inset,0 24px 48px -12px rgba(0,0,0,.6),0 8px 16px -8px rgba(0,0,0,.4)}

/* border beam: a short bright arc travelling round the border */
.beam{position:absolute;inset:-1px;border-radius:inherit;padding:1px;pointer-events:none;overflow:hidden;
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;
  mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
.beam:after{content:"";position:absolute;width:var(--beam,120px);aspect-ratio:1;offset-anchor:90% 50%;offset-path:rect(0 auto auto 0 round var(--r,14px));
  background:linear-gradient(to left,#fff,#c4c3ff 12%,#7170ff 40%,rgba(113,112,255,0) 85%);filter:drop-shadow(0 0 4px rgba(113,112,255,.9));animation:sp-beam var(--speed,8s) linear infinite;opacity:var(--beamo,.9)}
.busy .beam{--speed:2.2s;--beamo:1}
@keyframes sp-beam{to{offset-distance:100%}}
@media (prefers-reduced-motion:reduce){.beam:after{animation:none;offset-distance:12%}}

/* the toolbar */
.bar{right:20px;bottom:20px;display:flex;align-items:center;gap:2px;height:44px;padding:5px;border-radius:13px;font-size:13px;user-select:none;--r:13px}
.mark{width:28px;height:32px;display:grid;place-items:center;margin:0 2px 0 4px;color:var(--text)}
.mark svg{width:14px;height:14px}
.sep{width:1px;height:18px;background:var(--line);margin:0 5px}
.btn{flex:none;appearance:none;border:0;height:32px;padding:0 11px;border-radius:8px;font-size:13px;font-weight:510;color:var(--text2);background:transparent;cursor:pointer;display:inline-flex;align-items:center;gap:7px;white-space:nowrap;transition:background-color 120ms,color 120ms}
.btn:hover{background:rgba(255,255,255,.055);color:var(--text)}
.btn:active{background:rgba(255,255,255,.08)}
.btn:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.btn svg{width:14px;height:14px;flex:none;opacity:.85}
.btn.on{color:var(--text);background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px var(--line)}
.btn.on svg{opacity:1}
.btn.primary{background:var(--accent2);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 0 0 1px rgba(0,0,0,.25),0 2px 6px -1px rgba(94,106,210,.45)}
.btn.primary:hover{background:#6b76db}
.btn[disabled]{opacity:.38;cursor:default;pointer-events:none;box-shadow:none}
.btn.primary[disabled]{background:rgba(255,255,255,.07);color:var(--text2)}
.count{min-width:18px;height:18px;padding:0 5px;margin-right:-3px;border-radius:5px;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px var(--line);color:var(--muted);font-size:11.5px;font-weight:600;display:grid;place-items:center;font-variant-numeric:tabular-nums}
.count.has{color:var(--text);background:rgba(255,255,255,.1)}
.seg{display:flex;padding:2px;gap:1px;border-radius:8px;background:rgba(255,255,255,.035);box-shadow:inset 0 0 0 1px var(--line);margin:0 3px}
.seg button{white-space:nowrap;appearance:none;border:0;height:26px;padding:0 9px;border-radius:6px;font-size:12px;font-weight:510;color:var(--muted);background:transparent;cursor:pointer;transition:background-color 120ms,color 120ms}
.seg button:hover{color:var(--text2)}
.seg button.on{background:var(--raised);color:var(--text);box-shadow:0 0 0 1px var(--line2),0 1px 2px rgba(0,0,0,.4)}
.status{display:inline-flex;align-items:center;gap:7px;padding:0 10px 0 6px;color:var(--muted);font-size:12.5px;white-space:nowrap}
.status:before{content:"";width:6px;height:6px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px rgba(113,112,255,.18);animation:sp-pulse 1.2s ease-in-out infinite}
.status.ok:before{background:#4cb782;box-shadow:0 0 0 3px rgba(76,183,130,.18);animation:none}
@keyframes sp-pulse{50%{opacity:.35}}
kbd{font:500 10.5px/1 ui-sans-serif,-apple-system,system-ui,sans-serif;color:var(--muted);min-width:17px;height:17px;padding:0 4px;border-radius:4px;display:inline-grid;place-items:center;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px var(--line)}

/* a quiet text button (Clear) */
.btn.quiet{color:var(--muted);height:28px;padding:0 8px;font-size:12px}
.btn.quiet:hover{color:var(--text)}

/* the note card: header, hairline, a plain writing area, footer */
.pop{width:288px;border-radius:12px;display:none;--r:12px;--beam:60px;animation:sp-in 160ms cubic-bezier(.2,0,0,1)}
@keyframes sp-in{from{opacity:0;transform:translateY(4px) scale(.985)}}
.head{display:flex;align-items:center;gap:7px;height:36px;padding:0 8px 0 10px}
.head .num{width:18px;height:18px;font-size:10.5px!important;border-radius:6px;background:var(--accent2);color:#fff;font-size:11px;font-weight:650;display:grid;place-items:center;font-variant-numeric:tabular-nums;box-shadow:inset 0 1px 0 rgba(255,255,255,.2)}
.head b{font-size:12.5px;font-weight:590;color:var(--text)}
.head .dim{font-size:11.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.head kbd{margin-left:auto}
.rule{height:1px;background:var(--line)}
.pop textarea{display:block;width:100%;height:52px;resize:none;border:0;outline:0;background:transparent;color:var(--text);caret-color:var(--accent);padding:9px 10px;font-size:13px;line-height:1.5;letter-spacing:-.008em}
.pop textarea::placeholder{color:var(--faint)}
.foot{display:flex;align-items:center;justify-content:space-between;padding:6px}
.btn.ghost{color:var(--muted);height:26px;padding:0 7px;gap:5px;font-size:12px}
.btn.ghost svg{width:13px;height:13px}
.btn.ghost:hover{color:var(--danger);background:rgba(235,87,87,.08)}
.btn.done{height:26px;padding:0 4px 0 9px;gap:6px;font-size:12px;color:var(--text);background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px var(--line)}
.btn.done:hover{background:rgba(255,255,255,.09)}
.go{display:flex;gap:4px}
.pop .btn.done{background:var(--accent2);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 0 0 1px rgba(0,0,0,.25)}
.pop .btn.done:hover{background:#6b76db}
.pop .btn.done kbd{background:rgba(255,255,255,.14);color:rgba(255,255,255,.85);box-shadow:none}
.btn.ghost-n{height:26px;padding:0 9px;font-size:12px;color:var(--text2);box-shadow:inset 0 0 0 1px var(--line)}
.btn.done kbd{background:rgba(255,255,255,.06)}

.hint{position:fixed;left:50%;bottom:78px;transform:translateX(-50%);pointer-events:none;display:flex;align-items:center;gap:8px;height:34px;padding:0 14px;border-radius:10px;font-size:12.5px;color:var(--text2);white-space:nowrap;transition:opacity .3s}
.hint b{color:var(--text);font-weight:550}

/* placing: where a pick goes in their site */
.hl.place{border-style:dashed;background:transparent;box-shadow:none}
.hl.rep{border-style:solid;background:rgba(113,112,255,.1);box-shadow:0 0 0 3px rgba(113,112,255,.14)}
.line{position:fixed;pointer-events:none;height:2px;border-radius:2px;background:var(--accent);display:none;box-shadow:0 0 0 2px rgba(14,14,16,.6),0 0 12px rgba(113,112,255,.6)}
.line:before,.line:after{content:"";position:absolute;top:-3px;width:8px;height:8px;border-radius:50%;background:var(--bg);box-shadow:inset 0 0 0 2px var(--accent)}
.line:before{left:-4px}.line:after{right:-4px}
.pin{position:fixed;pointer-events:none;height:2px;border-radius:2px;background:var(--accent)}
.pin b{position:absolute;left:-12px;top:-9px;width:20px;height:20px;border-radius:6px;background:var(--accent2);color:#fff;font-size:11px;font-weight:650;display:grid;place-items:center;box-shadow:0 0 0 1.5px var(--bg)}
.q{display:inline-flex;align-items:center;gap:8px;padding:0 8px 0 4px;color:var(--text2);font-size:13px;white-space:nowrap}
.q b{color:var(--text);font-weight:590}
.q span{color:var(--muted);font-size:12px;display:inline-flex;align-items:center;gap:5px}
`;

export const ICONS = {
	cursor: '<svg viewBox="0 0 16 16" fill="none"><path d="M3.2 2.3l9.6 5.1-4.1 1.2-1.7 4.3L3.2 2.3z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/></svg>',
	pick: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 3.5l3.6 9.2 1.4-3.8 3.8-1.4-8.8-4z"/><path d="M9 9l3.5 3.5"/></svg>',
	prompt: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="2.5" width="11" height="11" rx="2.5"/><path d="M5.5 6.5l2 1.5-2 1.5M8.5 10h2"/></svg>',
	add: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 3.5v9M3.5 8h9"/></svg>',
	trash: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.1a1 1 0 001 .9h3.8a1 1 0 001-.9l.6-8.1"/></svg>',
};
