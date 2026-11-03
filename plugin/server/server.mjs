#!/usr/bin/env node
// site-prompt: any website, or any part of one, into a build prompt precise enough to rebuild it 1:1, measured from
// the live page in Chrome, and a check that the rebuild matches. An MCP server over stdio; plain Node ≥ 22, nothing to install.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { clone } from './component.mjs';
import { compare, PASS } from './compare.mjs';
import { image, serve, text, ToolError } from './mcp.mjs';
import { compose } from './prompt.mjs';
import { read } from './read.mjs';
import { buildStack } from './stack.mjs';
import * as pick from './pick.mjs';

const VERSION = '0.1.0';
// everything lands in the person's Documents, one folder per site (the prompt with its reference files beside it)
const base = () => process.env.SITE_PROMPT_OUT || path.join(os.homedir(), 'Documents', 'Site Prompts');
const slug = (u) => {
	const x = new URL(u);
	return (x.host + x.pathname).replace(/^www\./, '').replace(/\/+$/, '').replace(/[^\w.-]+/g, '-').slice(0, 80) || 'site';
};
const urlOf = (u) => {
	let s = String(u ?? '').trim();
	if (!s) throw new ToolError('url: the website to read, e.g. https://linear.app');
	if (!/^[a-z]+:\/\//i.test(s)) s = 'https://' + s;
	try { return new URL(s).href; } catch { throw new ToolError(`url: "${u}" is not a web address`); }
};
const dirFor = (u, sub = '') => path.join(base(), slug(u) + sub);
const rel = (p) => p.replace(os.homedir(), '~');
const link = (p) => pathToFileURL(p).href;

/** On the clipboard, ready to paste into any builder. */
const clipboard = (t) => new Promise((res) => {
	if (process.env.SITE_PROMPT_NO_CLIPBOARD === '1') return res(false);
	const cmd = process.platform === 'darwin' ? ['pbcopy', []] : process.platform === 'win32' ? ['clip', []] : ['xclip', ['-selection', 'clipboard']];
	try { const p = spawn(cmd[0], cmd[1]); p.on('error', () => res(false)); p.on('close', (c) => res(c === 0)); p.stdin.end(t); } catch { res(false); }
});

const INSTRUCTIONS = `site-prompt turns a website into a build prompt that rebuilds it 1:1. Whole page: site_read (measures and photographs it), look at every section shot, then site_prompt with a visual note per section (what only eyes can tell: imagery, depth, the feel) to finish PROMPT.md. Point at parts of a site and get a prompt for each (a button, a line of type, an illustration, a section): site_pick (it opens the site in the person's own Chrome when remote debugging is on, else a Chrome window, with a picker toolbar). One part by selector: site_component. After a rebuild: site_compare against the original. Only the sites the person names.`;

const tools = [
	{
		name: 'site_read',
		description: 'Read a website so it can be rebuilt 1:1. Opens it in Chrome like a person (scrolls it, waits for it to settle, clicks away a cookie banner) and measures everything: the stack it was built with (framework, styling, motion libraries, host), every colour, type style, radius, shadow, blur and spacing value, each section top to bottom with its exact copy and structure, hover states, the header on scroll, scroll reveals, keyframes, fonts, breakpoints, and how it changes at tablet and phone width. Writes ~/Documents/Site Prompts/<site>/ (PROMPT.md, exact.html, spec.json, css/, shots/) and returns the measurements with a screenshot of every section. Then look at the shots and call site_prompt with your visual notes to finish the prompt.',
		inputSchema: { type: 'object', properties: { url: { type: 'string', description: 'the page, e.g. https://linear.app or stripe.com/payments' } }, required: ['url'] },
		run: async (a) => {
			const url = urlOf(a.url);
			const dir = dirFor(url);
			const { spec, sectionImages } = await read(url, dir);
			// the exact copy, proven: exact.html against the live page at desktop and phone width
			const proof = await compare(url, pathToFileURL(path.join(dir, 'exact.html')).href, { widths: [1440, 390] }).catch((e) => ({ error: String(e.message ?? e) }));
			spec.exact = proof.error ? { error: proof.error } : proof.map((x) => ({ width: x.width, mean: x.mean, min: x.min, heights: x.heights }));
			writeFileSync(path.join(dir, 'spec.json'), JSON.stringify(spec, null, '\t'));
			writeFileSync(path.join(dir, 'PROMPT.md'), compose(spec));
			const s = spec.stack;
			const out = [text(`Read ${spec.url} → ${rel(dir)}/
STACK: ${[s.builder, s.framework, s.ui, ...s.styling, ...s.motion, ...s.other].filter(Boolean).join(', ') || 'nothing conclusive'}${s.hosting ? ` · hosted on ${s.hosting}` : ''}
  evidence: ${s.evidence.join('; ') || 'none'}
  rebuild in: ${buildStack(s).line}
PAGE: "${spec.meta.title}" · ${spec.views.desktop.pageHeight} px tall at 1440 · ${spec.sections.length} sections · ${spec.tokens.type.length} text styles · ${spec.hovers.length} hover states · ${spec.reveals.length} scroll reveals · ${Object.keys(spec.css.keyframes).length} keyframes · fonts ${spec.css.families.map((f) => f.family).join(', ') || spec.tokens.fonts.map((f) => f.family).join(', ')}
COLOURS: text ${spec.tokens.text.slice(0, 5).map((c) => c.colour).join(' ')} · backgrounds ${spec.tokens.background.slice(0, 5).map((c) => c.colour).join(' ')}

SECTIONS:
${spec.sections.map((x) => `${x.n}. ${x.selector} ${x.box.width}×${x.box.height} at y ${x.box.y}${x.headings[0] ? ` "${x.headings[0]}"` : ''}`).join('\n')}

EXACT COPY: exact.html, the page as rendered with the site's own CSS (every size, position and breakpoint as the original). ${spec.exact.error ? `It could not be checked: ${spec.exact.error}` : `Against the live page: ${spec.exact.map((x) => `${x.width} px SSIM ${x.mean} (lowest band ${x.min}; height ${x.heights.clone} vs ${x.heights.original})`).join(' · ')}${spec.exact.every((x) => x.mean >= PASS) ? ', pixel for pixel.' : '. Where it falls short is what scripts draw after load (canvas, WebGL, players, script-made layout): say so.'}`}

PROMPT.md is written from the measurements. Finish it: look at each section shot below (and shots/phone-full.jpg), then call site_prompt with url and notes: { "<section n>": "what the eye sees that numbers miss: the imagery and what it shows, depth and layering, glow, texture, illustration style, how dense it feels" } and overall: one paragraph on the page's look and feel. Keep notes factual; never invent copy or features.`)];
			for (const im of sectionImages.slice(0, 14)) { out.push(text(`section ${im.n} (${im.file})`)); out.push(image(im.jpeg)); }
			if (sectionImages.length > 14) out.push(text(`${sectionImages.length - 14} more section shots are in ${rel(dir)}/shots/.`));
			return out;
		},
	},
	{
		name: 'site_prompt',
		description: 'Finish the build prompt for a site already read with site_read: adds your visual notes per section and an overall paragraph, and rewrites ~/Documents/Site Prompts/<site>/PROMPT.md. Copies it to the clipboard and returns it in full, with a link to the file: show both to the person.',
		inputSchema: {
			type: 'object', required: ['url'],
			properties: {
				url: { type: 'string', description: 'the same url given to site_read' },
				overall: { type: 'string', description: 'one paragraph: the look and feel of the whole page' },
				notes: { type: 'object', description: 'section number → what the eye sees in it', additionalProperties: { type: 'string' } },
			},
		},
		run: async (a) => {
			const url = urlOf(a.url);
			const dir = dirFor(url);
			const specFile = path.join(dir, 'spec.json');
			if (!existsSync(specFile)) throw new ToolError(`${url} has not been read yet: call site_read first.`);
			const spec = JSON.parse(readFileSync(specFile, 'utf8'));
			const notes = Object.fromEntries(Object.entries(a.notes ?? {}).map(([k, v]) => [String(k).replace(/\D/g, ''), String(v)]));
			const md = compose(spec, { notes, overall: a.overall ? String(a.overall) : '' });
			writeFileSync(path.join(dir, 'PROMPT.md'), md);
			const missing = spec.sections.filter((x) => !notes[x.n]).map((x) => x.n);
			const copied = await clipboard(md);
			const file = path.join(dir, 'PROMPT.md');
			return [
				text(`PROMPT.md is ready${copied ? ' and on the clipboard' : ''}: ${rel(file)} (${Math.round(md.length / 1000)}k characters, ${spec.sections.length} sections${missing.length ? `; no visual notes for section ${missing.join(', ')}` : ''}).
Link: ${link(file)}
Folder: ${link(dir)}

Show the person, in this order:
1. The prompt below IN FULL, inside one \`\`\`markdown block, exactly as written (never shortened or summarised).
2. Then: "Saved to [${rel(file)}](${link(file)})${copied ? ', and copied to your clipboard' : ''}." and one line: what the site was built with.
3. Then how to use it: paste it into Claude Code, Codex, Cursor or v0; for pixel perfect, open the folder ${rel(dir)} in Claude Code or Codex and say "Build PROMPT.md" (exact.html and the shots beside it are what make it exact). After a rebuild, site_compare scores it against the original.`),
				text(md),
			];
		},
	},
	{
		name: 'site_pick',
		description: 'Let the person point at what they like on a website (a button, a line of type, an illustration, a section, any component) and get a prompt that builds exactly that. First call with url: opens the site with a picker toolbar, in the person\'s own Chrome if remote debugging is on (chrome://inspect/#remote-debugging; Chrome asks them to allow it), else in a Chrome window site-prompt opens; returns at once so you can tell them how to pick. Then call with no url to wait for their picks: they hover, click what they like (optionally typing what they like about it), and press Get prompts. Each pick comes back as a prompt with its exact code, its states, its type or artwork, saved in ~/Documents/Site Prompts/<site>/picks/, with a screenshot. They can keep browsing and picking; call again to wait for more. stop: true closes it.',
		inputSchema: {
			type: 'object',
			properties: {
				url: { type: 'string', description: 'the site to open (first call); omit to wait for picks in the open session' },
				mode: { type: 'string', enum: ['auto', 'own', 'window'], description: 'auto (default): their own Chrome when reachable, else a window' },
				wait: { type: 'number', description: 'seconds to wait for picks (default 240, at most 600)' },
				stop: { type: 'boolean', description: 'close the picking session' },
			},
		},
		run: async (a) => {
			if (a.stop) { await pick.stop(); return 'Closed the picker.'; }
			if (a.url || !pick.active()) {
				if (!a.url) throw new ToolError('url: the site to pick from (no picking session is open).');
				const url = urlOf(a.url);
				const o = await pick.open(url, { mode: a.mode });
				return `The picker is open on ${url} in ${o.own ? 'your own Chrome (a new tab, or the one already on that site)' : 'a Chrome window site-prompt opened (sign in there once if the site needs it; it remembers)'}.

Tell the person, in a few short lines: hover anything on the page (it says what it is: Button, Text, Illustration, Section); click what they like, optionally type what they like about it; ↑ picks the bigger thing around it, Esc pauses picking so they can use the site normally; then press Get prompts in the toolbar (bottom right). They can pick several things at once, and move to other pages.${o.own ? '' : `\nIf they want this in their own Chrome next time (their tabs and logins): turn on remote debugging at chrome://inspect/#remote-debugging (Chrome 144 or later).`}

Then call site_pick with no url to wait for the picks.`;
			}
			const batch = await pick.next(Math.min(600, Math.max(5, Number(a.wait) || 240)));
			if (!batch) return 'Nothing picked yet; the picker is still open. Call site_pick again (no url) to keep waiting, or stop: true to close it.';
			const results = await pick.processBatch(batch, base());
			const good = results.filter((x) => !x.error);
			const all = good.map((x) => x.md).join('\n\n---\n\n');
			const copied = good.length ? await clipboard(all) : false;
			const out = [text(`${good.length} prompt${good.length === 1 ? '' : 's'} from ${batch.url}${copied ? ` (all ${good.length > 1 ? 'of them ' : ''}copied to the clipboard)` : ''}.${results.filter((x) => x.error).map((x) => `\nCould not read ${x.n} (${x.label}): ${x.error}`).join('')}

Show the person each prompt below IN FULL inside its own \`\`\`markdown block, exactly as written, each followed by "Saved to [path](link)" and one line on how close the copy is. Keep your own words short. The picker stays open: they can pick more and press Get prompts again (call site_pick with no url to wait).`)];
			for (const x of good) {
				const file = path.join(x.dir, 'PROMPT.md');
				const match = x.r.size.ok && (x.r.ssim >= 0.97 || x.r.diff <= 0.015);
				out.push(text(`── ${x.n}. ${x.label}${x.note ? ` · "${x.note}"` : ''}
Saved: ${rel(file)}  (link: ${link(file)})
Copy check: ${match ? 'matches the original' : 'close, not exact'} (${(x.r.diff * 100).toFixed(1)}% pixel difference, size ${x.r.size.original.join('×')} → ${x.r.size.clone.join('×')})`));
				out.push(text(x.md));
				for (const f of ['original.png', 'original-hover.png']) if (existsSync(path.join(x.dir, f))) out.push(image(readFileSync(path.join(x.dir, f)), 'image/png'));
			}
			return out;
		},
	},
	{
		name: 'site_component',
		description: 'Clone one part of a website exactly: a button, a card, a nav bar, a hero, a pricing table. Without a selector, a Chrome window opens on the page and the person hovers and clicks the part they want (↑ picks its parent); tell them that first. With a selector, it is taken directly. Snapshots its whole subtree with every computed style, its :hover, :focus-visible and :active states, keyframes and fonts into a standalone component.html that renders like the original, checks the clone against the original pixel by pixel, and writes COMPONENT.md, a prompt to rebuild it in any stack.',
		inputSchema: {
			type: 'object', required: ['url'],
			properties: {
				url: { type: 'string', description: 'the page the component is on' },
				selector: { type: 'string', description: 'a CSS selector for it (skips the picker)' },
				name: { type: 'string', description: 'a short name for it, e.g. "hero button"' },
				wait: { type: 'number', description: 'seconds to wait for the click (default 180)' },
			},
		},
		run: async (a) => {
			const url = urlOf(a.url);
			const name = String(a.name ?? '').trim().toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || `component-${Date.now().toString(36)}`;
			const dir = path.join(dirFor(url), 'components', name);
			const r = await clone(url, dir, { selector: a.selector ? String(a.selector) : undefined, wait: Math.min(600, Math.max(20, Number(a.wait) || 180)) });
			const stateLines = Object.entries(r.states).flatMap(([i, st]) => Object.entries(st).map(([s, d]) => `.c${i}:${s}: ${Object.entries(d).map(([j, decls]) => `${+j === +i ? '' : `.c${j} `}${decls.slice(0, 6).join('; ')}`).join(' | ')}`));
			const md = componentPrompt(url, r, stateLines, name);
			writeFileSync(path.join(dir, 'COMPONENT.md'), md);
			const pct = (r.diff * 100).toFixed(1);
			const match = r.size.ok && (r.ssim >= 0.97 || r.diff <= 0.015);
			const verdict = match ? `The clone matches the original: same size ${r.size.clone.join('×')}, ${pct}% average pixel difference${r.ssim < 0.97 ? ' (text anti-aliasing only)' : ''}, SSIM ${r.ssim}.` : `The clone is close but not exact (${pct}% average pixel difference, SSIM ${r.ssim}; size ${r.size.original.join('×')} → ${r.size.clone.join('×')}). Look at the sheet below (original | clone | difference) and fix component.html, usually a font that did not load or an image from another origin.`;
			const out = [text(`Cloned the ${r.snap.tag}${r.snap.text ? ` "${r.snap.text.slice(0, 60)}"` : ''} from ${url} → ${rel(dir)}/
${r.snap.nodes} elements · ${r.snap.rules.length} style rules · ${stateLines.length} state rules (hover, focus, press) · ${r.faces} font faces · ${r.keyframes} keyframes
${verdict}

Files: component.html (open it: the exact component, standalone), COMPONENT.md (the prompt to rebuild it in any stack), original.png${existsSync(path.join(dir, 'original-hover.png')) ? ', original-hover.png' : ''}, clone.png.
Tell the person what it is, its states, and how to use it: drop component.html into Claude Code or Codex with "rebuild this as a React + Tailwind component" (or their stack), or paste COMPONENT.md.`)];
			for (const f of ['original.png', 'original-hover.png', 'clone.png']) if (existsSync(path.join(dir, f))) { out.push(text(f)); out.push(image(readFileSync(path.join(dir, f)), 'image/png')); }
			if (r.sheet && !match) { out.push(text('original | clone | difference')); out.push(image(r.sheet)); }
			return out;
		},
	},
	{
		name: 'site_compare',
		description: `Score a rebuild against the original site: both pages loaded and scrolled at each width, compared band by band (SSIM, 1 = identical). Returns the scores, the page heights, and for each band under ${PASS} a sheet of original | clone | difference (bright = different) with its y position. Fix the worst first and compare again.`,
		inputSchema: {
			type: 'object', required: ['original', 'clone'],
			properties: {
				original: { type: 'string', description: 'the original site' },
				clone: { type: 'string', description: 'the rebuild, e.g. http://localhost:3000' },
				widths: { type: 'array', items: { type: 'number' }, description: 'default [1440, 390]' },
			},
		},
		run: async (a) => {
			const widths = (Array.isArray(a.widths) && a.widths.length ? a.widths : [1440, 390]).map(Number).filter((w) => w >= 320 && w <= 2560).slice(0, 4);
			const r = await compare(urlOf(a.original), urlOf(a.clone), { widths });
			const pass = r.every((x) => x.mean >= PASS && Math.abs(x.heights.clone - x.heights.original) / x.heights.original < 0.03);
			const out = [text(`${r.map((x) => `${x.width} px: mean ${x.mean}, lowest ${x.min}; height original ${x.heights.original} px, clone ${x.heights.clone} px${Math.abs(x.heights.clone - x.heights.original) / x.heights.original >= 0.03 ? ' ✗ (more than 3% off: a section is missing, extra or the wrong height)' : ''}
  bands (y: ssim): ${x.bands.map((b) => `${b.y}: ${b.ssim}${b.ssim < PASS ? '✗' : ''}`).join(' · ')}`).join('\n')}

${pass ? `It passes: every width at ${PASS} or above and the same height. Say so.` : `Not there yet. The sheets below are original | clone | difference at the worst bands. Fix those (layout, spacing, type, colour, an image), then compare again. Bands are cut at the same y, so once one section's height is off, everything below it scores low: fix the first ✗ from the top first.`}`)];
			for (const x of r) for (const s of x.sheets) { out.push(text(`${x.width} px, y ${s.y}, SSIM ${s.ssim}: original | clone | difference`)); out.push(image(s.jpeg)); }
			return out;
		},
	},
];

function componentPrompt(url, r, stateLines, name) {
	const s = r.snap;
	return [
		`# Rebuild this ${s.tag}${name.startsWith('component-') ? '' : ` (${name})`} from ${new URL(url).host} exactly`,
		'',
		`component.html next to this file is the exact component, cloned from ${url}: open it and it renders like the original (${r.size.original.join('×')} px, SSIM ${r.ssim} against the live element). Every style in it is the browser's computed value, so the numbers are exact; class names c0, c1… are positional, not meaningful.`,
		'',
		'Rebuild it as a clean component in the stack of this project (React + Tailwind by default):',
		'1. Same markup structure and the same copy.',
		'2. Every size, spacing, colour, radius, shadow, font and line height exactly as in component.html. Use the project\'s tokens only where they are the same value.',
		'3. The states below, with the transitions declared in component.html (durations and easings exactly).',
		'4. Keyframes and @font-face are at the top of component.html; keep them.',
		'5. Render yours next to original.png and original-hover.png, and fix until they match.',
		'',
		'## States (measured by forcing each state in Chrome)',
		stateLines.length ? stateLines.map((l) => `- ${l}`).join('\n') : '- none: it does not change on hover, focus or press',
		'',
		`## Copy`,
		s.text ? `"${s.text}"` : '(none)',
		'',
		`_For learning, a redesign, or your own product: if you ship it, make the copy and any logo your own._`,
	].join('\n');
}

serve({ name: 'site-prompt', version: VERSION, instructions: INSTRUCTIONS, tools });
