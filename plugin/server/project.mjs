// The project the person is building (the folder their agent runs in), so a picked component can go straight into
// it: its framework, styling, language and where components live. Read from package.json and the folder layout only.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function project(dir = process.env.SITE_PROMPT_PROJECT || process.cwd()) {
	const pkgFile = path.join(dir, 'package.json');
	const has = (...p) => p.some((x) => existsSync(path.join(dir, x)));
	if (!existsSync(pkgFile)) {
		if (has('index.html', 'src/index.html', 'public/index.html')) return { dir, name: path.basename(dir), framework: 'plain HTML', styling: 'CSS', ts: false, components: null, dev: null };
		return null;
	}
	let pkg = {};
	try { pkg = JSON.parse(readFileSync(pkgFile, 'utf8')); } catch { return null; }
	const deps = { ...pkg.dependencies, ...pkg.devDependencies };
	const v = (n) => deps[n] ? `${n} ${String(deps[n]).replace(/^[^\d]*/, '')}` : null;
	const framework = deps.next ? `Next.js${has('app', 'src/app') ? ' (App Router)' : has('pages', 'src/pages') ? ' (Pages Router)' : ''}` : deps.nuxt ? 'Nuxt' : deps['@sveltejs/kit'] ? 'SvelteKit' : deps.astro ? 'Astro' : deps['@remix-run/react'] || deps['react-router'] ? 'Remix / React Router' : deps.vue ? 'Vue' : deps.svelte ? 'Svelte' : deps['solid-js'] ? 'Solid' : deps['@angular/core'] ? 'Angular' : deps.react ? 'React' : null;
	if (!framework && !has('index.html', 'src/index.html')) return null;
	const styling = [deps.tailwindcss && `Tailwind ${String(deps.tailwindcss).replace(/^[^\d]*/, '').split('.')[0]}`, deps['styled-components'] && 'styled-components', deps['@emotion/react'] && 'Emotion', deps.sass && 'Sass', has('components.json') && 'shadcn/ui'].filter(Boolean);
	const components = ['src/components', 'components', 'app/components', 'src/lib/components', 'src/app/components'].find((c) => has(c)) ?? null;
	return {
		dir, name: pkg.name || path.basename(dir), framework: framework ?? 'plain HTML/JS', styling: styling.length ? styling.join(' + ') : 'plain CSS',
		ts: has('tsconfig.json'), components, dev: pkg.scripts?.dev ? 'npm run dev' : pkg.scripts?.start ? 'npm start' : null,
		versions: [v('next'), v('react'), v('vue'), v('svelte'), v('tailwindcss')].filter(Boolean),
		motion: [deps['framer-motion'] && 'framer-motion', deps.motion && 'motion', deps.gsap && 'gsap'].filter(Boolean),
	};
}
