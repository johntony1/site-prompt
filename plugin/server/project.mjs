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

const DEFAULT_PORTS = { 'Next.js': [3000, 3001], Nuxt: [3000], SvelteKit: [5173], Astro: [4321], 'Remix / React Router': [5173, 3000], Vue: [5173, 8080], Svelte: [5173], Solid: [3000, 5173], Angular: [4200], React: [5173, 3000] };

/** Where their site is running in dev, if it is: the port in their dev script, the framework's default, then the usual ones. */
export async function devUrl(proj) {
	if (process.env.SITE_PROMPT_DEV_URL) return process.env.SITE_PROMPT_DEV_URL;
	if (!proj) return null;
	let script = '';
	try { const pkg = JSON.parse(readFileSync(path.join(proj.dir, 'package.json'), 'utf8')); script = `${pkg.scripts?.dev ?? ''} ${pkg.scripts?.start ?? ''}`; } catch {}
	const fromScript = [...script.matchAll(/(?:--port|-p)[ =](\d{2,5})/g)].map((m) => +m[1]);
	const fw = Object.keys(DEFAULT_PORTS).find((k) => proj.framework?.startsWith(k));
	const ports = [...new Set([...fromScript, ...(DEFAULT_PORTS[fw] ?? []), 3000, 5173, 4321, 3001, 5174, 8080, 4200, 8000, 5500])];
	const tries = ports.map(async (port) => {
		for (const h of ['localhost', '127.0.0.1']) {
			try {
				const r = await fetch(`http://${h}:${port}/`, { signal: AbortSignal.timeout(900) });
				if (/html/.test(r.headers.get('content-type') ?? '')) return `http://localhost:${port}/`;
			} catch {}
		}
		return null;
	});
	const found = await Promise.all(tries);
	return found.find(Boolean) ?? null;
}
