// site-prompt's usage counter: anonymous events in (POST /e), a private dashboard out (GET /?key=…).
// What is stored is exactly the columns in schema.sql: no URLs, no page content, no names, no IP addresses.

const EVENTS = new Set(['install', 'uninstall', 'first_run', 'tool', 'page_copy'])
const PAGE_ORIGINS = new Set(['https://orevbajohn.me', 'https://www.orevbajohn.me'])
const TOOLS = new Set(['site_read', 'site_prompt', 'site_pick', 'site_component', 'site_match', 'site_compare', 'break_down', 'add_to_project'])
const clean = (v, max = 40) => (typeof v === 'string' ? v.replace(/[^\w.,:@/+ -]/g, '').slice(0, max) : null)
const DAY = 86400000

export default {
	async fetch(req, env, ctx) {
		const url = new URL(req.url)
		const origin = req.headers.get('origin')
		const cors = origin && PAGE_ORIGINS.has(origin) ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' } : {}
		if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
		if (req.method === 'POST' && url.pathname === '/e') {
			const res = await ingest(req, env, !!cors['access-control-allow-origin'])
			for (const [k, v] of Object.entries(cors)) res.headers.set(k, v)
			return res
		}
		if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/api')) {
			if (!env.DASH_KEY || url.searchParams.get('key') !== env.DASH_KEY) return new Response('Not found', { status: 404 })
			// ?refresh=1: skip the caches and save GitHub's traffic now (instead of waiting for the daily run)
			let note = null
			if (url.searchParams.get('refresh') === '1') {
				await caches.default.delete(new Request('https://cache.local/gh-site-prompt-v2')).catch(() => {})
				await caches.default.delete(new Request('https://cache.local/npm-site-prompt')).catch(() => {})
				note = await saveTraffic(env).then((r) => r, (e) => String(e?.message ?? e))
			}
			const data = await stats(env, ctx)
			data.refresh = note
			if (url.pathname === '/api') return Response.json(data)
			return new Response(page(data, url.searchParams.get('key')), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
		}
		return new Response('site-prompt stats', { status: 200 })
	},

	// once a day: GitHub's traffic for the last 14 days, kept for good (only with a GH_TOKEN secret)
	async scheduled(_event, env, ctx) {
		ctx.waitUntil(saveTraffic(env))
	},
}

async function saveTraffic(env) {
	if (!env.GH_TOKEN) return 'no GH_TOKEN set'
	let why = ''
	const gh = (p) => fetch('https://api.github.com/repos/johntony1/site-prompt/traffic/' + p, { headers: { authorization: `Bearer ${env.GH_TOKEN.trim()}`, 'user-agent': 'site-prompt-stats', accept: 'application/vnd.github+json' } }).then(async (r) => { if (r.ok) return r.json(); why = `${r.status} ${((await r.json().catch(() => ({}))).message ?? '').slice(0, 120)}`; return null })
	const [clones, views] = await Promise.all([gh('clones'), gh('views')])
	if (!clones && !views) return `GitHub refused the token: ${why}`
	const days = new Map()
	for (const c of clones?.clones ?? []) days.set(c.timestamp.slice(0, 10), { ...(days.get(c.timestamp.slice(0, 10)) ?? {}), clones: c.count, cloners: c.uniques })
	for (const v of views?.views ?? []) days.set(v.timestamp.slice(0, 10), { ...(days.get(v.timestamp.slice(0, 10)) ?? {}), views: v.count, visitors: v.uniques })
	const stmt = env.DB.prepare('INSERT INTO gh_traffic (day, clones, cloners, views, visitors) VALUES (?, ?, ?, ?, ?) ON CONFLICT(day) DO UPDATE SET clones = excluded.clones, cloners = excluded.cloners, views = excluded.views, visitors = excluded.visitors')
	const rows = [...days].map(([day, d]) => stmt.bind(day, d.clones ?? 0, d.cloners ?? 0, d.views ?? 0, d.visitors ?? 0))
	if (rows.length) await env.DB.batch(rows)
	return `saved ${rows.length} days`
}

async function ingest(req, env, fromPage) {
	const text = await req.text()
	if (text.length > 2000) return new Response(null, { status: 413 })
	let b
	try { b = JSON.parse(text) } catch { return new Response(null, { status: 400 }) }
	if (!EVENTS.has(b.event) || !/^[a-f0-9]{16,64}$/.test(b.id ?? '')) return new Response(null, { status: 400 })
	// page events only from the case study, tool events only from the tool
	if ((b.event === 'page_copy') !== fromPage) return new Response(null, { status: 400 })
	// at most 60 events a minute from one id: nobody can pump the numbers
	const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM events WHERE id = ? AND ts > ?').bind(b.id, Date.now() - 60000).first()
	if ((recent?.n ?? 0) >= 60) return new Response(null, { status: 429 })
	const tool = b.event === 'tool' && TOOLS.has(b.tool) ? b.tool : b.event === 'page_copy' ? clean(b.tool, 40) : null
	if (b.event === 'tool' && !tool) return new Response(null, { status: 400 })
	await env.DB.prepare('INSERT INTO events (ts, event, id, v, os, agent, tool, ok, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
		.bind(Date.now(), b.event, b.id, clean(b.v, 16), clean(b.os, 12), clean(Array.isArray(b.agents) ? b.agents.join(',') : b.agent, 120), tool, b.ok === false ? 0 : 1, clean(req.cf?.country, 2))
		.run()
	return new Response(null, { status: 204 })
}

async function stats(env, ctx) {
	const now = Date.now()
	const q = (sql, ...a) => env.DB.prepare(sql).bind(...a).all().then((r) => r.results)
	const one = async (sql, ...a) => (await q(sql, ...a))[0] ?? {}
	const [totals, active7, active30, daily, installsInto, inUse, tools, os, versions, countries, recent] = await Promise.all([
		one(`SELECT
			(SELECT COUNT(DISTINCT id) FROM events) AS machines,
			(SELECT COUNT(*) FROM events WHERE event = 'install') AS installs,
			(SELECT COUNT(*) FROM events WHERE event = 'first_run') AS first_runs,
			(SELECT COUNT(*) FROM events WHERE event = 'uninstall') AS uninstalls,
			(SELECT COUNT(*) FROM events WHERE event = 'tool') AS tool_calls`),
		one(`SELECT COUNT(DISTINCT id) AS n FROM events WHERE event = 'tool' AND ts > ?`, now - 7 * DAY),
		one(`SELECT COUNT(DISTINCT id) AS n FROM events WHERE event = 'tool' AND ts > ?`, now - 30 * DAY),
		// new machines per day: the day each id was first seen
		q(`SELECT CAST(first / 86400000 AS INTEGER) AS day, COUNT(*) AS n FROM (SELECT id, MIN(ts) AS first FROM events GROUP BY id) WHERE first > ? GROUP BY day ORDER BY day`, now - 30 * DAY),
		q(`SELECT agent FROM events WHERE event = 'install'`),
		q(`SELECT agent, COUNT(DISTINCT id) AS machines, COUNT(*) AS calls FROM events WHERE event IN ('tool', 'first_run') AND agent IS NOT NULL AND agent != '' GROUP BY agent ORDER BY machines DESC LIMIT 12`),
		q(`SELECT tool, COUNT(*) AS n, SUM(ok) AS ok FROM events WHERE event = 'tool' AND ts > ? GROUP BY tool ORDER BY n DESC`, now - 30 * DAY),
		q(`SELECT os, COUNT(DISTINCT id) AS n FROM events GROUP BY os ORDER BY n DESC`),
		q(`SELECT v, COUNT(DISTINCT id) AS n FROM events WHERE ts > ? GROUP BY v ORDER BY n DESC LIMIT 6`, now - 30 * DAY),
		q(`SELECT country, COUNT(DISTINCT id) AS n FROM events WHERE country IS NOT NULL GROUP BY country ORDER BY n DESC LIMIT 12`),
		q(`SELECT ts, event, agent, tool, os, country FROM events ORDER BY ts DESC LIMIT 20`),
	])
	const [traffic, copies, npm] = await Promise.all([
		q(`SELECT day, clones, cloners, views, visitors FROM gh_traffic ORDER BY day DESC LIMIT 60`),
		q(`SELECT tool AS tab, COUNT(*) AS n FROM events WHERE event = 'page_copy' AND ts > ? GROUP BY tool ORDER BY n DESC`, now - 30 * DAY),
		npmDownloads(ctx),
	])
	const into = {}
	for (const r of installsInto) for (const a of String(r.agent ?? '').split(',').filter(Boolean)) into[a] = (into[a] ?? 0) + 1
	const github = await githubStats(ctx, env).catch(() => null)
	return { at: now, traffic: traffic.reverse(), copies, npm, totals, active7: active7.n ?? 0, active30: active30.n ?? 0, daily, installedInto: Object.entries(into).sort((a, b) => b[1] - a[1]), inUse, tools, os, versions, countries, recent, github }
}

/** npm's public download counts for the last 30 days (none until the package is published) */
async function npmDownloads(ctx) {
	const cache = caches.default
	const key = new Request('https://cache.local/npm-site-prompt')
	const hit = await cache.match(key).catch(() => null)
	if (hit) return hit.json()
	const r = await fetch('https://api.npmjs.org/downloads/range/last-month/site-prompt').catch(() => null)
	const j = r?.ok ? await r.json() : null
	const out = j?.downloads ? { total: j.downloads.reduce((a, d) => a + d.downloads, 0), days: j.downloads.map((d) => ({ day: d.day, n: d.downloads })) } : null
	if (out) ctx.waitUntil(cache.put(key, new Response(JSON.stringify(out), { headers: { 'cache-control': 'max-age=1800' } })))
	return out
}

async function githubStats(ctx, env) {
	const cache = caches.default
	const key = new Request('https://cache.local/gh-site-prompt-v2')
	const hit = await cache.match(key).catch(() => null)
	if (hit) return hit.json()
	let out = null
	if (env.GH_TOKEN) {
		// with a read-only token: the repo's numbers and GitHub's 14-day traffic (clones include plugin installs)
		const gh = (p) => fetch('https://api.github.com/repos/johntony1/site-prompt' + p, { headers: { authorization: `Bearer ${env.GH_TOKEN}`, 'user-agent': 'site-prompt-stats', accept: 'application/vnd.github+json' } }).then((r) => (r.ok ? r.json() : null))
		const [repo, clones, views] = await Promise.all([gh(''), gh('/traffic/clones'), gh('/traffic/views')])
		if (repo) out = { stars: repo.stargazers_count, forks: repo.forks_count, watchers: repo.subscribers_count, clones: clones?.count, cloners: clones?.uniques, views: views?.count, visitors: views?.uniques }
	}
	if (!out) {
		// without one: GitHub limits anonymous API calls per IP and Cloudflare's IPs are shared, so ask shields.io
		const sh = (p) => fetch(`https://img.shields.io/github/${p}/johntony1/site-prompt.json`, { headers: { 'user-agent': 'site-prompt-stats' } }).then((r) => (r.ok ? r.json() : null)).then((j) => (j ? Number(String(j.value).replace(/[^\d.k]/g, '').replace(/k$/, '000')) : null)).catch(() => null)
		const [stars, forks, watchers] = await Promise.all([sh('stars'), sh('forks'), sh('watchers')])
		if (stars != null) out = { stars, forks: forks ?? 0, watchers: watchers ?? 0 }
	}
	if (out) ctx.waitUntil(cache.put(key, new Response(JSON.stringify(out), { headers: { 'cache-control': 'max-age=600' } })))
	return out
}

/* ── the dashboard ─────────────────────────────────────── */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const NAMES = { claude: 'Claude Code', 'claude-code': 'Claude Code', codex: 'Codex', 'codex-mcp-client': 'Codex', cursor: 'Cursor', 'cursor-vscode': 'Cursor', gemini: 'Gemini CLI', 'gemini-cli-mcp-client': 'Gemini CLI', grok: 'Grok CLI', windsurf: 'Windsurf', vscode: 'VS Code', 'Visual Studio Code': 'VS Code', 'claude-desktop': 'Claude Desktop', 'claude-ai': 'Claude Desktop', opencode: 'opencode', zed: 'Zed' }
const nice = (a) => NAMES[a] ?? a

function bars(rows, label, value, total) {
	const max = Math.max(1, ...rows.map(value))
	if (!rows.length) return '<p class="empty">Nothing yet.</p>'
	return `<div class="bars">${rows.map((r) => `<div class="bar"><span class="bl">${esc(label(r))}</span><span class="track"><i style="width:${(value(r) / max) * 100}%"></i></span><b>${value(r)}${total ? `<em>${total(r)}</em>` : ''}</b></div>`).join('')}</div>`
}

function chart(points) {
	const max = Math.max(1, ...points.map((p) => p.n))
	return `<div class="chart">${points.map((p) => `<i class="${p.n ? '' : 'z'}" title="${esc(p.label)}: ${p.n}" style="height:${p.n ? Math.max(4, (p.n / max) * 100) : 2}%"></i>`).join('')}</div><div class="axis"><span>${esc(points[0]?.label ?? '')}</span><span>${esc(points[points.length - 1]?.label ?? '')}</span></div>`
}

function page(d, key) {
	const t = d.totals
	const days = []
	const today = Math.floor(d.at / DAY)
	const byDay = new Map(d.daily.map((r) => [r.day, r.n]))
	for (let i = 29; i >= 0; i--) days.push({ day: today - i, n: byDay.get(today - i) ?? 0 })
	const maxDay = Math.max(1, ...days.map((x) => x.n))
	const fmtDay = (day) => new Date(day * DAY).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
	const ago = (ts) => { const s = Math.round((d.at - ts) / 1000); return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d` }
	const tile = (label, value, sub) => `<div class="tile"><small>${label}</small><strong>${value}</strong>${sub ? `<span>${sub}</span>` : ''}</div>`
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Site Prompt stats</title>
<style>
:root{--bg:#0b0b0c;--panel:#131315;--line:rgba(255,255,255,.08);--ink:#f7f8f8;--ink2:#d0d3d9;--muted:#8a8f98;--faint:#5c6068;--blue:#3d7bff}
*{box-sizing:border-box;margin:0}
body{background:var(--bg);color:var(--ink2);font:14px/20px Inter,-apple-system,system-ui,sans-serif;-webkit-font-smoothing:antialiased;padding:40px 16px 80px}
main{max-width:980px;margin:0 auto}
header{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:28px}
h1{font-size:19px;font-weight:620;color:var(--ink);letter-spacing:-.015em}
header span{font-size:12.5px;color:var(--muted)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:10px}
.tile,.card{background:var(--panel);border-radius:12px;box-shadow:0 0 0 1px var(--line)}
.tile{padding:14px 16px}
.tile small,.card h2{display:block;font:500 10.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--faint)}
.tile strong{display:block;margin-top:10px;font-size:26px;font-weight:600;color:var(--ink);letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.tile span{display:block;margin-top:4px;font-size:12px;color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px}
.card{padding:16px}
.card h2{margin-bottom:14px}
.chart{display:flex;align-items:flex-end;gap:3px;height:120px}
.chart i{flex:1;background:var(--blue);border-radius:3px 3px 0 0;min-height:2px;opacity:.9}
.chart i.z{background:rgba(255,255,255,.06)}
.axis{display:flex;justify-content:space-between;margin-top:8px;font-size:11px;color:var(--faint)}
.bars{display:flex;flex-direction:column;gap:8px}
.bar{display:grid;grid-template-columns:120px 1fr 64px;align-items:center;gap:10px;font-size:12.5px}
.bl{color:var(--ink2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.track{height:6px;border-radius:3px;background:rgba(255,255,255,.05);overflow:hidden}
.track i{display:block;height:100%;background:var(--blue);border-radius:3px}
.bar b{text-align:right;font-weight:550;color:var(--ink);font-variant-numeric:tabular-nums}
.bar em{font-style:normal;color:var(--faint);font-weight:400;margin-left:6px}
.empty{color:var(--faint);font-size:12.5px}
table{width:100%;border-collapse:collapse;font-size:12.5px}
td{padding:7px 0;border-top:1px solid var(--line);color:var(--ink2)}
td:last-child{text-align:right;color:var(--faint)}
.wide{grid-column:1/-1}
footer{margin-top:20px;font-size:12px;color:var(--faint)}
</style></head><body><main>
<header><h1>Site Prompt</h1><span>updated ${new Date(d.at).toUTCString().replace(' GMT', ' UTC')}${d.refresh ? ` · ${esc(d.refresh)}` : ''} · <a href="?key=${esc(key)}&refresh=1" style="color:var(--muted)">refresh</a></span></header>
<div class="tiles">
${tile('Machines', t.machines ?? 0, 'that installed or ran it')}
${tile('Active, 7 days', d.active7, `${d.active30} in 30 days`)}
${tile('Installs', t.installs ?? 0, `${t.first_runs ?? 0} plugin first runs`)}
${tile('Tool calls', t.tool_calls ?? 0, `${t.uninstalls ?? 0} uninstalls`)}
${d.github ? tile('GitHub stars', d.github.stars, `${d.github.forks} forks · ${d.github.watchers} watching`) : ''}
${d.github?.clones != null ? tile('Clones, 14 days', d.github.clones, `${d.github.cloners} unique · ${d.github.visitors} visitors`) : ''}
${tile('npm downloads, 30 days', d.npm ? d.npm.total : '0', d.npm ? 'npx site-prompt' : 'not published yet')}
${tile('Install copies, 30 days', d.copies.reduce((a, c) => a + c.n, 0), 'from orevbajohn.me/site-prompt')}
</div>
<div class="grid">
<div class="card wide"><h2>New machines, last 30 days</h2><div class="chart">${days.map((x) => `<i class="${x.n ? '' : 'z'}" title="${fmtDay(x.day)}: ${x.n}" style="height:${x.n ? Math.max(4, (x.n / maxDay) * 100) : 2}%"></i>`).join('')}</div><div class="axis"><span>${fmtDay(days[0].day)}</span><span>today</span></div></div>
${d.npm ? `<div class="card wide"><h2>npm downloads per day</h2>${chart(d.npm.days.map((x) => ({ label: x.day, n: x.n })))}</div>` : ''}
${d.traffic.length ? `<div class="card wide"><h2>GitHub clones per day (views ${d.traffic.reduce((a, t) => a + t.views, 0)})</h2>${chart(d.traffic.map((x) => ({ label: x.day, n: x.clones })))}</div>` : ''}
<div class="card"><h2>Installed into</h2>${bars(d.installedInto, (r) => nice(r[0]), (r) => r[1])}</div>
<div class="card"><h2>Agents in use (machines · calls)</h2>${bars(d.inUse, (r) => nice(r.agent), (r) => r.machines, (r) => r.calls)}</div>
<div class="card"><h2>Tools, last 30 days (calls · ok)</h2>${bars(d.tools, (r) => r.tool.replace(/^site_/, ''), (r) => r.n, (r) => `${Math.round((r.ok / Math.max(1, r.n)) * 100)}%`)}</div>
<div class="card"><h2>Install box copies, by tab</h2>${bars(d.copies, (r) => r.tab ?? '?', (r) => r.n)}</div>
<div class="card"><h2>Countries</h2>${bars(d.countries, (r) => r.country, (r) => r.n)}</div>
<div class="card"><h2>Systems</h2>${bars(d.os, (r) => ({ darwin: 'macOS', linux: 'Linux', win32: 'Windows' })[r.os] ?? r.os ?? '?', (r) => r.n)}</div>
<div class="card"><h2>Versions, last 30 days</h2>${bars(d.versions, (r) => r.v ?? '?', (r) => r.n)}</div>
<div class="card wide"><h2>Latest</h2>${d.recent.length ? `<table>${d.recent.map((r) => `<tr><td>${esc(r.event === 'tool' ? r.tool : r.event)}</td><td>${esc(nice(r.agent ?? '') || '')}</td><td>${esc(r.country ?? '')}</td><td>${ago(r.ts)} ago</td></tr>`).join('')}</table>` : '<p class="empty">Nothing yet.</p>'}</div>
</div>
<footer>Anonymous counts only: a random id per machine, the agent, the tool, the system and the country. No URLs, no page content, no names.</footer>
</main></body></html>`
}
