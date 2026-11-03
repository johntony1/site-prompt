// The build prompt, written from the measurements: everything a builder (Claude Code, Codex, Cursor, v0) needs to
// rebuild the page 1:1, in the order it will need it. The agent adds what only eyes can tell (imagery, depth, feel)
// in the VISUAL NOTES of each section after looking at the shots.
import { buildStack } from './stack.mjs';

const list = (xs, f = (x) => x) => (xs?.length ? xs.map((x) => `- ${f(x)}`).join('\n') : '- none found');

export function compose(spec, { notes = {}, overall = '' } = {}) {
	const s = spec.stack, t = spec.tokens, v = spec.views;
	const host = new URL(spec.url).host;
	const stack = buildStack(s);
	const L = [];
	L.push(`# Rebuild ${host} 1:1`);
	L.push('');
	L.push(`Rebuild the page at ${spec.url} so that, side by side at 1440, 768 and 390 px wide, nobody can tell the two apart: same layout, spacing, type, colours, depth, copy, states and motion. Every number below was measured from the live page in Chrome; use them as given, never round them to a nicer scale. The screenshots in shots/ are the ground truth: when this text and a screenshot disagree, the screenshot wins.`);
	L.push('');
	L.push('## Pixel perfect: exact.html is the truth');
	const ex = spec.exact && !spec.exact.error ? ` It was checked against the live page: ${spec.exact.map((x) => `${x.width} px SSIM ${x.mean}`).join(', ')} (1 = identical).` : '';
	L.push(`exact.html, next to this prompt, is the page exactly as the browser rendered it, with the site's own compiled CSS inlined in cascade order: every element's size, position, spacing, colour, font and breakpoint is the original's.${ex} Rebuild so that yours renders identically to exact.html at every width: same box for every element, nothing moved, nothing resized, nothing restyled, nothing "improved". Take values from exact.html and css/, never from memory or a design system. Where this prompt and exact.html disagree, exact.html wins.`);
	L.push('');
	L.push('## Stack');
	L.push(stack.line);
	const named = [s.builder && `builder: ${s.builder}`, s.framework && `framework: ${s.framework}`, s.ui && `UI: ${s.ui}`, s.styling.length && `styling: ${s.styling.join(', ')}`, s.motion.length && `motion: ${s.motion.join(', ')}`, s.other.length && `also: ${s.other.join(', ')}`, s.hosting && `hosted on ${s.hosting}`, s.fonts.length && `fonts from ${s.fonts.join(', ')}`].filter(Boolean);
	L.push(`Detected on the live site: ${named.join(' · ') || 'nothing conclusive'}. (Read from the built page: the original source and its language are never sent to browsers.)`);
	L.push('');
	if (overall) { L.push('## The page at a glance'); L.push(overall.trim()); L.push(''); }

	L.push('## Design tokens (measured)');
	L.push(`Page background ${spec.meta.pageBackground}${spec.meta.colorScheme && spec.meta.colorScheme !== 'normal' ? `, color-scheme ${spec.meta.colorScheme}` : ''}. Content container: ${spec.container.join(', ') || 'no centred max-width found (full bleed or padded)'}.`);
	L.push('');
	L.push('**Text colours** (by amount of text):');
	L.push(list(t.text, (c) => c.colour));
	L.push('**Background colours** (by area):');
	L.push(list(t.background, (c) => c.colour));
	if (t.border.length) { L.push('**Border colours:**'); L.push(list(t.border, (c) => c.colour)); }
	if (t.gradients.length) { L.push('**Gradients:**'); L.push(list(t.gradients)); }
	L.push('**Corner radius:**'); L.push(list(t.radii));
	if (t.shadows.length) { L.push('**Shadows (depth):**'); L.push(list(t.shadows)); }
	if (t.blurs.length) { L.push('**Blur and filters:**'); L.push(list(t.blurs)); }
	L.push(`**Spacing values in use (px):** ${t.spacing.join(', ')}`);
	const vars = Object.entries(spec.css.vars).filter(([k]) => !k.startsWith('--tw-')).slice(0, 60);
	if (vars.length) { L.push('**CSS variables the site defines** (reuse the names):'); L.push('```css'); L.push(':root {'); for (const [k, val] of vars) L.push(`  ${k}: ${val};`); L.push('}'); L.push('```'); }
	L.push('');

	L.push('## Typography (measured)');
	L.push(list(spec.css.families, (f) => `${f.family}: weights ${f.weights.join(', ') || '?'}; files ${f.sources.slice(0, 2).join(' , ') || 'system font'}`));
	L.push('');
	L.push('Every text style on the page, most used first (family | size | weight | line height | letter spacing | case | colour | where):');
	for (const ty of t.type) L.push(`- ${ty.family} | ${ty.size} | ${ty.weight} | ${ty.lineHeight} | ${ty.letterSpacing} | ${ty.transform}${ty.style !== 'normal' ? ' ' + ty.style : ''} | ${ty.colour} | ${ty.tags}: "${ty.sample}"`);
	L.push('Load the same font files where the licence allows (the @font-face rules are in spec.json); otherwise use the closest free match and keep the metrics (size, weight, line height, tracking) exactly.');
	L.push('');

	L.push('## Layout and responsive behaviour');
	L.push(`Breakpoints in the CSS: ${spec.css.breakpoints.map((b) => `${b.px}px`).join(', ') || 'none found'}.`);
	for (const [name, x] of Object.entries(v)) {
		if (!x?.width) continue;
		L.push(`- ${name} (${x.width} px): page ${x.pageHeight} px tall; h1 ${x.h1 ? `${x.h1.size}/${x.h1.lineHeight}` : 'none'}; body text ${x.body}; header shows ${x.headerLinks} links${x.menuButton ? ' and a menu button' : ''}; widest grid ${x.maxGridColumns || 'n/a'} columns${x.shot ? `; see ${x.shot}` : ''}`);
	}
	if (spec.fixed.length) L.push(`Fixed or sticky: ${spec.fixed.map((f) => `${f.el} (${f.position}, z ${f.z}, ${f.box})`).join('; ')}.`);
	L.push('');

	L.push('## Sections, top to bottom');
	L.push('Each section: its box on the 1440 px page, its background, its exact copy, and its structure as measured (tag.class [layout; size; padding; colours; radius; shadow; font] "text"). Rebuild the structure, not the class names.');
	for (const sec of spec.sections) {
		L.push('');
		L.push(`### ${sec.n}. ${sec.headings[0] ? `"${sec.headings[0]}"` : sec.tag} (${sec.selector})`);
		L.push(`Box ${sec.box.width}×${sec.box.height} at y ${sec.box.y}; background ${sec.background ?? 'transparent (page background)'}${sec.backgroundImage ? `; background-image ${sec.backgroundImage}` : ''}. Screenshot: ${sec.shots.join(', ') || 'none'}.`);
		if (notes[sec.n]) { L.push(''); L.push(`**Visual notes:** ${notes[sec.n].trim()}`); }
		L.push('');
		L.push('Copy, exactly:');
		L.push('```text');
		L.push(sec.text || '(no text)');
		L.push('```');
		L.push('Structure:');
		L.push('```text');
		L.push(sec.outline);
		L.push('```');
	}
	L.push('');

	L.push('## States and motion (measured)');
	if (spec.header?.scrolled && JSON.stringify(spec.header.atTop) !== JSON.stringify(spec.header.scrolled)) {
		const a = spec.header.atTop, b = spec.header.scrolled;
		const diffs = Object.keys(a).filter((k) => a[k] !== b[k]).map((k) => `${k} ${hexs(a[k])} → ${hexs(b[k])}`);
		L.push(`**Header on scroll:** ${diffs.join('; ')}.`);
	}
	L.push('**Hover states** (forced :hover in Chrome; the transition is the element\'s own):');
	L.push(list(spec.hovers, (h) => `${h.el}${h.text ? ` "${h.text}"` : ''}: ${h.changes.join('; ')}${h.transition ? `; transition ${hexs(h.transition)}` : ''}`));
	L.push('**Transitions in use:**'); L.push(list(t.transitions));
	if (spec.reveals.length) {
		L.push(`**Scroll reveals** (${spec.reveals.length} elements change as they scroll into view):`);
		L.push(list(spec.reveals.slice(0, 14), (r) => `${r.el}: opacity ${r.from.opacity} → ${r.to.opacity}${r.from.transform !== r.to.transform ? `, transform ${r.from.transform} → ${r.to.transform}` : ''}${r.from.filter !== r.to.filter ? `, filter ${r.from.filter} → ${r.to.filter}` : ''}${r.transition && r.transition !== 'all 0s ease 0s' ? `; transition ${r.transition}` : ''}${r.animation ? `; animation ${r.animation}` : ''}`));
	} else L.push('**Scroll reveals:** none detected.');
	if (t.animations.length) { L.push('**Animations running:**'); L.push(list(t.animations)); }
	const kf = Object.entries(spec.css.keyframes).filter(([name]) => t.animations.some((a) => a.startsWith(name + ' ')) || Object.keys(spec.css.keyframes).length <= 8);
	if (kf.length) { L.push('**Keyframes, verbatim:**'); L.push('```css'); for (const [, body] of kf.slice(0, 16)) L.push(body); L.push('```'); }
	if (spec.meta.smoothScroll === 'smooth' || s.motion.some((m) => /Lenis|Locomotive/.test(m))) L.push(`Smooth scrolling: ${s.motion.find((m) => /Lenis|Locomotive/.test(m)) ?? 'scroll-behavior: smooth'}.`);
	L.push('');

	L.push('## Assets');
	L.push(`Images (${spec.assets.images.length}), with their rendered size:`);
	L.push(list(spec.assets.images.slice(0, 30), (im) => `${im.src} (${im.width}×${im.height}${im.alt ? `, alt "${im.alt}"` : ''})`));
	if (spec.assets.bgImages.length) { L.push('Background images:'); L.push(list(spec.assets.bgImages.slice(0, 15))); }
	if (spec.assets.videos.length) { L.push('Videos:'); L.push(list(spec.assets.videos, (vd) => `${vd.src}${vd.poster ? ` poster ${vd.poster}` : ''}${vd.autoplay ? ' autoplay' : ''}${vd.loop ? ' loop' : ''}${vd.muted ? ' muted' : ''}`)); }
	L.push(`Inline SVG icons and logos: ${spec.assets.svgs.length} (their exact markup is in spec.json under assets.svgs; reuse it).`);
	L.push('');

	L.push('## Reference files next to this prompt');
	L.push('- shots/: desktop, tablet and phone full pages, and every section at 1440 px. Look at them before building each section.');
	L.push('- spec.json: every measurement above in full (all SVG markup, @font-face rules, CSS variables).');
	L.push('- exact.html: the pixel-perfect page (rendered markup + the site\'s own CSS). Open it in a browser next to your build.');
	L.push('- css/: the site\'s compiled stylesheets, for any value this prompt does not spell out.');
	L.push('');
	L.push('## Done means');
	L.push('1. Build section by section, top to bottom, checking each against its screenshot at 1440 px before the next.');
	L.push('2. Then check 768 and 390 px against the tablet and phone shots.');
	L.push('3. Then the hover states, the header on scroll, the scroll reveals and the keyframes, with the measured durations and easings.');
	L.push('4. Compare the finished page with the original at 1440, 768 and 390 px (with the site-prompt plugin: site_compare, which scores it band by band) and fix whatever differs, until every width scores 0.95 or more and the page heights match. Fix from the top down: one wrong height shifts everything below it.');
	L.push('');
	L.push(`_Measured from ${spec.url} on ${spec.read.slice(0, 10)}. For learning, a redesign, or a site you own: if you publish it, use your own name, logo, copy and images._`);
	return L.join('\n');
}

const hexs = (x) => String(x ?? '').replace(/rgba?\(([^)]+)\)/g, (m, inner) => {
	const p = inner.split(/[,\s/]+/).filter(Boolean).map(Number);
	const h = '#' + p.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
	return p.length > 3 && p[3] < 0.99 ? `${h} @${Math.round(p[3] * 100)}%` : h;
});
