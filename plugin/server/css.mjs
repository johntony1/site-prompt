// The page's compiled CSS, mined for what a rebuild needs verbatim: @font-face, @keyframes, breakpoints, variables.

/** Top-level blocks `@name ... { ... }` with balanced braces. */
function blocks(text, at) {
	const out = [];
	const re = new RegExp(`@${at}\\b`, 'g');
	let m;
	while ((m = re.exec(text))) {
		const open = text.indexOf('{', m.index);
		if (open < 0) break;
		let depth = 0, i = open;
		for (; i < text.length; i++) {
			if (text[i] === '{') depth++;
			else if (text[i] === '}' && --depth === 0) break;
		}
		out.push(text.slice(m.index, i + 1));
		re.lastIndex = i + 1;
	}
	return out;
}

export const absolutise = (block, base) => (base ? block.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (all, q, u) => {
	if (/^(data:|https?:|\/\/)/.test(u)) return all;
	try { return `url("${new URL(u, base).href}")`; } catch { return all; }
}) : block);

export function mine(sheets) {
	const fontFaces = [], keyframes = new Map(), widths = new Map(), vars = new Map();
	for (const { href, text } of sheets) {
		if (!text) continue;
		for (const b of blocks(text, 'font-face')) fontFaces.push(absolutise(b, href));
		for (const b of blocks(text, '(?:-webkit-)?keyframes')) {
			const name = b.match(/keyframes\s+([^\s{]+)/)?.[1];
			if (name && !keyframes.has(name)) keyframes.set(name, b.replace(/\s+/g, ' ').slice(0, 2500));
		}
		for (const m of text.matchAll(/@media[^{]*?\((?:min|max)-width:\s*([\d.]+)(px|em|rem)\)/g)) {
			const px = Math.round(+m[1] * (m[2] === 'px' ? 1 : 16));
			widths.set(px, (widths.get(px) ?? 0) + 1);
		}
		for (const m of text.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)[;}]/g)) if (!vars.has(m[1]) && vars.size < 400) vars.set(m[1], m[2].trim().slice(0, 160));
	}
	const families = new Map();
	for (const f of fontFaces) {
		const fam = f.match(/font-family:\s*["']?([^;"']+)/)?.[1]?.trim();
		if (!fam) continue;
		const v = families.get(fam) ?? { weights: new Set(), sources: new Set() };
		const w = f.match(/font-weight:\s*([^;]+)/)?.[1]?.trim();
		if (w) v.weights.add(w);
		const src = f.match(/url\("?([^")]+)"?\)/)?.[1];
		if (src) v.sources.add(src);
		families.set(fam, v);
	}
	return {
		fontFaces: fontFaces.slice(0, 60),
		families: [...families.entries()].map(([family, v]) => ({ family, weights: [...v.weights], sources: [...v.sources].slice(0, 6) })),
		keyframes: Object.fromEntries([...keyframes.entries()].slice(0, 40)),
		breakpoints: [...widths.entries()].filter(([w, n]) => n >= 2 && w >= 320 && w <= 2560).sort((a, b) => a[0] - b[0]).map(([w, n]) => ({ px: w, rules: n })),
		vars: Object.fromEntries(vars),
	};
}

/** Fetch the stylesheets the page could not let us read (cross-origin). */
export async function fetchExternal(urls, referer) {
	const out = [];
	for (const href of [...new Set(urls)].slice(0, 30)) {
		try {
			const r = await fetch(href, { headers: { referer, 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' }, signal: AbortSignal.timeout(15_000) });
			if (r.ok) out.push({ href, text: (await r.text()).slice(0, 1_500_000) });
		} catch {}
	}
	return out;
}
