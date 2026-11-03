// What the site is built with, from what its pages give away: framework globals and markup, script paths, class
// patterns, response headers. A browser only ever receives the built output, so this names the stack; the source
// code (and whether it was TypeScript) is not in the page and is never claimed.

export function stackOf(signals, headers = {}) {
	const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
	const gen = signals.generator ?? '';
	const found = { framework: null, ui: null, styling: [], motion: [], builder: null, hosting: null, fonts: [], other: [], evidence: [] };
	const say = (what, why) => found.evidence.push(`${what}: ${why}`);

	// site builders first: they decide everything else
	for (const [k, name] of [['framer', 'Framer'], ['webflow', 'Webflow'], ['wix', 'Wix'], ['squarespace', 'Squarespace'], ['shopify', 'Shopify'], ['wordpress', 'WordPress']]) {
		if (signals[k]) { found.builder = name; say(name, 'its markup or scripts'); break; }
	}
	if (!found.builder && /wordpress|webflow|framer|wix|squarespace|ghost|hubspot|drupal|joomla/i.test(gen)) { found.builder = gen.split(/\s/)[0]; say(found.builder, `meta generator "${gen}"`); }

	if (signals.next) { found.framework = signals.nextApp ? 'Next.js (App Router)' : 'Next.js'; say('Next.js', signals.nextApp ? '/_next/ app chunks (React Server Components payload)' : '__NEXT_DATA__ or /_next/ scripts'); }
	else if (signals.nuxt) { found.framework = 'Nuxt'; say('Nuxt', '__NUXT__ or /_nuxt/ scripts'); }
	else if (signals.remix) { found.framework = 'Remix / React Router'; say('Remix', '__remixContext'); }
	else if (signals.gatsby) { found.framework = 'Gatsby'; say('Gatsby', '#___gatsby'); }
	else if (signals.sveltekit) { found.framework = 'SvelteKit'; say('SvelteKit', '/_app/immutable/ or data-sveltekit attributes'); }
	else if (signals.astro) { found.framework = 'Astro'; say('Astro', 'astro-island or data-astro-cid'); }
	else if (signals.qwik) { found.framework = 'Qwik'; say('Qwik', 'q:container'); }
	else if (signals.angular) { found.framework = `Angular${signals.angularVersion ? ' ' + signals.angularVersion.split('.')[0] : ''}`; say('Angular', `ng-version ${signals.angularVersion}`); }
	else if (/hugo|jekyll|eleventy/i.test(gen)) { found.framework = gen; say(gen, 'meta generator'); }

	found.ui = signals.react ? 'React' : signals.vue ? 'Vue' : signals.svelte || signals.sveltekit ? 'Svelte' : signals.solid ? 'Solid' : signals.angular ? 'Angular' : null;
	if (found.ui && !found.evidence.some((e) => e.startsWith(found.ui))) say(found.ui, 'its runtime in the page');

	if (signals.tailwind) { found.styling.push('Tailwind CSS'); say('Tailwind', `${signals.tailwindHits} utility classes${signals.tailwindHits <= 40 ? ', --tw- variables' : ''}`); }
	if (signals.shadcn) found.styling.push('shadcn/ui');
	if (signals.radix) found.styling.push('Radix UI');
	if (signals.styledComponents) found.styling.push('styled-components');
	if (signals.emotion) found.styling.push('Emotion');
	if (signals.cssModules) found.styling.push('CSS Modules');
	if (signals.chakra) found.styling.push('Chakra UI');
	if (signals.mui) found.styling.push('Material UI');
	if (signals.bootstrap) found.styling.push('Bootstrap');

	if (signals.gsap) found.motion.push(signals.scrollTrigger ? 'GSAP + ScrollTrigger' : 'GSAP');
	if (signals.framerMotion) found.motion.push('Framer Motion');
	if (signals.lenis) found.motion.push('Lenis smooth scroll');
	if (signals.locomotive) found.motion.push('Locomotive Scroll');
	if (signals.lottie) found.motion.push('Lottie');
	if (signals.three) found.motion.push('Three.js');
	else if (signals.webgl) found.motion.push('WebGL canvas');
	if (signals.spline) found.motion.push('Spline');
	if (signals.rive) found.motion.push('Rive');
	if (signals.swiper) found.other.push('Swiper');
	if (signals.splide) found.other.push('Splide');
	if (signals.alpine) found.other.push('Alpine.js');
	if (signals.htmx) found.other.push('htmx');
	if (signals.jquery) found.other.push('jQuery');
	if (signals.googleFonts) found.fonts.push('Google Fonts');
	if (signals.typekit) found.fonts.push('Adobe Fonts');

	if (h['x-vercel-id'] || h['x-vercel-cache'] || signals.vercelAnalytics) found.hosting = 'Vercel';
	else if (h['x-nf-request-id'] || /netlify/i.test(h.server ?? '')) found.hosting = 'Netlify';
	else if (/cloudflare/i.test(h.server ?? '') && h['cf-ray']) found.hosting = h['x-pages'] || /pages/.test(h['cf-ray'] ?? '') ? 'Cloudflare' : 'Cloudflare (CDN)';
	else if (h['x-github-request-id']) found.hosting = 'GitHub Pages';
	else if (/amazons3|cloudfront/i.test((h.server ?? '') + (h.via ?? ''))) found.hosting = 'AWS';
	if (h['x-powered-by']) say('x-powered-by', h['x-powered-by']);
	return found;
}

/** The stack to rebuild in: the original's where it can be named, else a sensible modern default. */
export function buildStack(s) {
	if (s.builder && ['Framer', 'Webflow', 'Wix', 'Squarespace'].includes(s.builder)) {
		return { line: `The original is a ${s.builder} site. Rebuild it as code: Next.js (App Router) with TypeScript and Tailwind CSS${s.motion.length ? `, ${s.motion.join(', ')} for motion` : ', Framer Motion for motion'}.`, original: false };
	}
	const fw = s.framework ?? (s.ui ? `${s.ui} (Vite)` : null);
	if (!fw) return { line: `No framework could be named (likely static HTML${s.other.length ? ' with ' + s.other.join(', ') : ''}). Rebuild it as plain HTML, CSS and a little JavaScript, or Next.js with Tailwind if it will grow.`, original: false };
	const lang = /Next|Nuxt|Remix|SvelteKit|Astro|Angular|Qwik|Vite/.test(fw) ? 'TypeScript' : 'JavaScript';
	const styling = s.styling.length ? s.styling.join(' + ') : 'plain CSS (CSS Modules or a single stylesheet)';
	return { line: `Use the original's stack: ${fw}, ${lang}, ${styling}${s.motion.length ? `, ${s.motion.join(', ')}` : ''}.`, original: true };
}
