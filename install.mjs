#!/usr/bin/env node
// Installs Site Prompt into every coding agent on this machine that speaks MCP: Claude Code, Codex, Cursor,
// Gemini CLI, Grok CLI, Windsurf, VS Code (Copilot), Claude Desktop, opencode and Zed. Each gets the site-prompt
// MCP server, and the skill where the agent reads skills or rules. Only agents that are installed are touched,
// every file it edits is backed up first (.bak), and it can be run again to update.
//
//   node install.mjs                 all agents found
//   node install.mjs --only codex,cursor
//   node install.mjs --dry-run       say what it would do
//   node install.mjs --uninstall     take it out of every agent again
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { telemetryOff, track } from './plugin/server/telemetry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const HOME = os.homedir();
const MAC = process.platform === 'darwin', WIN = process.platform === 'win32';
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run'), UNINSTALL = args.includes('--uninstall');
const onlyAt = args.findIndex((a) => a === '--only' || a.startsWith('--only='));
const ONLY = onlyAt < 0 ? [] : (args[onlyAt].includes('=') ? args[onlyAt].split('=')[1] : args[onlyAt + 1] ?? '').split(',').filter(Boolean);
const NAME = 'site-prompt';

const major = Number(process.versions.node.split('.')[0]);
if (major < 22) { console.log(`Site Prompt needs Node 22 or newer (this is ${process.version}): https://nodejs.org`); process.exit(1); }

// one stable copy every agent points at, so deleting the clone breaks nothing
const APP = path.join(process.env.SITE_PROMPT_HOME || path.join(HOME, '.site-prompt'), 'app');
const SERVER = path.join(APP, 'server', 'server.mjs');
const SKILL = readFileSync(path.join(here, 'plugin', 'skills', NAME, 'SKILL.md'), 'utf8');
// the node on PATH by its stable name (/opt/homebrew/bin/node, not a versioned Cellar path that an upgrade removes),
// as a full path so agents started from a GUI, without a shell's PATH, still find it
const NODE = (() => { try { const p = execFileSync(WIN ? 'where' : 'which', ['node'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim(); if (p) return p; } catch {} return process.execPath; })();

const appData = (...p) => (MAC ? path.join(HOME, 'Library', 'Application Support', ...p) : WIN ? path.join(process.env.APPDATA || HOME, ...p) : path.join(HOME, '.config', ...p));
const has = (cmd) => { try { execFileSync(WIN ? 'where' : 'which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; } };
const done = [], doneIds = [], skipped = [], manual = [];

function write(file, text) {
	if (DRY) return;
	mkdirSync(path.dirname(file), { recursive: true });
	if (existsSync(file) && !existsSync(file + '.bak')) copyFileSync(file, file + '.bak');
	writeFileSync(file, text);
}
/** a JSON settings file: read, change it, write it back. A file with comments (Zed, VS Code) is never rewritten:
 *  the new top-level key is inserted as text before its last brace, so every comment stays; if that key is already
 *  there, it is left alone and the person is told what to add. */
function editJson(file, change) {
	let data = {};
	if (existsSync(file)) {
		const raw = readFileSync(file, 'utf8');
		try { data = raw.trim() ? JSON.parse(raw) : {}; } catch {
			let loose;
			try { loose = JSON.parse(raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1').replace(/,(\s*[}\]])/g, '$1')); } catch { return false; }
			const fresh = {};
			change(fresh);
			const [key] = Object.keys(fresh).filter((k) => !(k in loose));
			if (!key || UNINSTALL) return false;
			const end = raw.lastIndexOf('}');
			const before = raw.slice(0, end).replace(/\s*$/, '');
			const sep = /[{,]$/.test(before.replace(/\/\/[^\n]*$/, '').trimEnd()) ? '' : ',';
			const block = JSON.stringify({ [key]: fresh[key] }, null, 2).slice(1, -1).replace(/^\n|\n$/g, '');
			write(file, `${before}${sep}\n${block}\n${raw.slice(end)}`);
			return true;
		}
	}
	change(data);
	write(file, JSON.stringify(data, null, 2) + '\n');
	return true;
}
function skillTo(dir) {
	if (UNINSTALL) { if (!DRY) rmSync(path.join(dir, NAME), { recursive: true, force: true }); return; }
	write(path.join(dir, NAME, 'SKILL.md'), SKILL);
}
const stdio = (wait) => ({ command: NODE, args: [SERVER], ...(wait ? { env: { SITE_PROMPT_WAIT: String(wait) } } : {}) });

// each agent: where it keeps MCP servers, and how long it lets a tool call run (site_pick waits while you pick)
const AGENTS = [
	{
		id: 'claude', name: 'Claude Code', found: () => has('claude') || existsSync(path.join(HOME, '.claude')),
		run() {
			if (has('claude') && !DRY) {
				try { execFileSync('claude', ['mcp', 'remove', '--scope', 'user', NAME], { stdio: 'ignore' }); } catch {}
				if (!UNINSTALL) execFileSync('claude', ['mcp', 'add', '--scope', 'user', NAME, '--', NODE, SERVER], { stdio: 'ignore' });
			} else if (!has('claude')) manual.push('Claude Code: claude mcp add --scope user site-prompt -- node ' + SERVER);
			const extra = `\n## When called as /site-prompt\n\n$ARGUMENTS is the link (and maybe what to do). A link alone: run the whole-page flow above and finish with site_prompt. "pick", "hover", "component" or a named part (button, illustration, text, section): pick mode with site_pick (in a project, the toolbar can add picks straight to it). Two links: site_compare.\n`;
			if (UNINSTALL) skillTo(path.join(HOME, '.claude', 'skills'));
			else write(path.join(HOME, '.claude', 'skills', NAME, 'SKILL.md'), SKILL + extra);
			return '~/.claude.json (user MCP) + ~/.claude/skills/site-prompt';
		},
	},
	{
		id: 'codex', name: 'Codex', found: () => has('codex') || existsSync(path.join(process.env.CODEX_HOME || path.join(HOME, '.codex'))),
		run() {
			const conf = path.join(process.env.CODEX_HOME || path.join(HOME, '.codex'), 'config.toml');
			const old = existsSync(conf) ? readFileSync(conf, 'utf8') : '';
			// drop any earlier [mcp_servers.site-prompt] block (and its sub-tables), then add the current one
			const kept = [];
			let skip = false;
			for (const line of old.split('\n')) {
				if (/^\s*\[mcp_servers\.("?)site-prompt\1(\]|\.)/.test(line)) { skip = true; continue; }
				if (/^\s*\[/.test(line)) skip = false;
				if (!skip) kept.push(line);
			}
			let text = kept.join('\n').replace(/\n+$/, '\n');
			if (!UNINSTALL) text += `\n[mcp_servers.site-prompt]\ncommand = ${JSON.stringify(NODE)}\nargs = [${JSON.stringify(SERVER)}]\nstartup_timeout_sec = 20\ntool_timeout_sec = 600\n`;
			write(conf, text);
			skillTo(path.join(HOME, '.agents', 'skills'));
			return `${conf} ([mcp_servers.site-prompt]) + ~/.agents/skills/site-prompt`;
		},
	},
	{
		id: 'cursor', name: 'Cursor', found: () => existsSync(path.join(HOME, '.cursor')),
		run() {
			const file = path.join(HOME, '.cursor', 'mcp.json');
			const ok = editJson(file, (d) => { d.mcpServers ??= {}; if (UNINSTALL) delete d.mcpServers[NAME]; else d.mcpServers[NAME] = stdio(50); });
			if (!ok) return manual.push(`Cursor: add to ${file} under mcpServers: ${JSON.stringify({ [NAME]: stdio(50) })}`), null;
			skillTo(path.join(HOME, '.cursor', 'skills'));
			return `${file} + ~/.cursor/skills/site-prompt`;
		},
	},
	{
		id: 'gemini', name: 'Gemini CLI', found: () => has('gemini') || existsSync(path.join(HOME, '.gemini')),
		run() {
			// an extension: the server and the skill as its context file, in one folder
			const dir = path.join(HOME, '.gemini', 'extensions', NAME);
			if (UNINSTALL) { if (!DRY) rmSync(dir, { recursive: true, force: true }); return dir; }
			write(path.join(dir, 'gemini-extension.json'), JSON.stringify({ name: NAME, version: '0.2.0', contextFileName: 'GEMINI.md', mcpServers: { [NAME]: { ...stdio(), timeout: 600000 } } }, null, 2) + '\n');
			write(path.join(dir, 'GEMINI.md'), SKILL.replace(/^---[\s\S]*?---\n/, ''));
			return `${dir} (extension)`;
		},
	},
	{
		id: 'grok', name: 'Grok CLI', found: () => has('grok') || existsSync(path.join(HOME, '.grok')),
		run() {
			const file = path.join(HOME, '.grok', 'user-settings.json');
			const ok = editJson(file, (d) => { d.mcpServers ??= {}; if (UNINSTALL) delete d.mcpServers[NAME]; else d.mcpServers[NAME] = { name: NAME, transport: 'stdio', ...stdio(50) }; });
			if (!ok) return manual.push(`Grok CLI: grok mcp add site-prompt --transport stdio --command node --args ${SERVER}`), null;
			return file;
		},
	},
	{
		id: 'windsurf', name: 'Windsurf', found: () => existsSync(path.join(HOME, '.codeium', 'windsurf')),
		run() {
			const file = path.join(HOME, '.codeium', 'windsurf', 'mcp_config.json');
			const ok = editJson(file, (d) => { d.mcpServers ??= {}; if (UNINSTALL) delete d.mcpServers[NAME]; else d.mcpServers[NAME] = stdio(50); });
			if (!ok) return manual.push(`Windsurf: add to ${file} under mcpServers: ${JSON.stringify({ [NAME]: stdio(50) })}`), null;
			return file;
		},
	},
	{
		id: 'vscode', name: 'VS Code (Copilot)', found: () => existsSync(appData('Code', 'User')),
		run() {
			const file = appData('Code', 'User', 'mcp.json');
			const ok = editJson(file, (d) => { d.servers ??= {}; if (UNINSTALL) delete d.servers[NAME]; else d.servers[NAME] = { type: 'stdio', ...stdio(50) }; });
			if (!ok) return manual.push(`VS Code: add to ${file} under servers: ${JSON.stringify({ [NAME]: { type: 'stdio', ...stdio(50) } })}`), null;
			return file;
		},
	},
	{
		id: 'claude-desktop', name: 'Claude Desktop', found: () => existsSync(appData('Claude')),
		run() {
			const file = appData('Claude', 'claude_desktop_config.json');
			const ok = editJson(file, (d) => { d.mcpServers ??= {}; if (UNINSTALL) delete d.mcpServers[NAME]; else d.mcpServers[NAME] = stdio(50); });
			if (!ok) return manual.push(`Claude Desktop: add to ${file} under mcpServers: ${JSON.stringify({ [NAME]: stdio(50) })}`), null;
			return file;
		},
	},
	{
		id: 'opencode', name: 'opencode', found: () => has('opencode') || existsSync(path.join(HOME, '.config', 'opencode')),
		run() {
			const file = path.join(HOME, '.config', 'opencode', 'opencode.json');
			const ok = editJson(file, (d) => { d.$schema ??= 'https://opencode.ai/config.json'; d.mcp ??= {}; if (UNINSTALL) delete d.mcp[NAME]; else d.mcp[NAME] = { type: 'local', command: [NODE, SERVER], enabled: true, environment: { SITE_PROMPT_WAIT: '50' } }; });
			if (!ok) return manual.push(`opencode: add to ${file} under mcp: ${JSON.stringify({ [NAME]: { type: 'local', command: ['node', SERVER], enabled: true } })}`), null;
			skillTo(path.join(HOME, '.config', 'opencode', 'skills'));
			return `${file} + ~/.config/opencode/skills/site-prompt`;
		},
	},
	{
		id: 'zed', name: 'Zed', found: () => existsSync(MAC ? path.join(HOME, '.config', 'zed') : appData('zed')),
		run() {
			const file = path.join(MAC ? path.join(HOME, '.config', 'zed') : appData('zed'), 'settings.json');
			const ok = editJson(file, (d) => { d.context_servers ??= {}; if (UNINSTALL) delete d.context_servers[NAME]; else d.context_servers[NAME] = { source: 'custom', ...stdio(50) }; });
			if (!ok) return manual.push(`Zed: add to ${file} under context_servers: ${JSON.stringify({ [NAME]: { source: 'custom', ...stdio(50) } })}`), null;
			return file;
		},
	},
];

// the copy every agent points at
if (!UNINSTALL && !DRY) {
	rmSync(APP + '.new', { recursive: true, force: true });
	mkdirSync(APP + '.new', { recursive: true });
	cpSync(path.join(here, 'plugin'), APP + '.new', { recursive: true });
	rmSync(APP, { recursive: true, force: true });
	cpSync(APP + '.new', APP, { recursive: true });
	rmSync(APP + '.new', { recursive: true, force: true });
}

for (const a of AGENTS) {
	if (ONLY.length && !ONLY.includes(a.id)) continue;
	if (!a.found()) { skipped.push(a.name); continue; }
	try { const where = a.run(); if (where) { done.push(`${a.name.padEnd(18)} ${where}`); doneIds.push(a.id); } } catch (e) { manual.push(`${a.name}: ${e.message}`); }
}
if (UNINSTALL && !DRY && !ONLY.length) rmSync(APP, { recursive: true, force: true });

console.log(`${DRY ? 'Would ' + (UNINSTALL ? 'remove' : 'install') : UNINSTALL ? 'Removed' : 'Installed'} Site Prompt${UNINSTALL ? '' : ` (${APP})`}:`);
for (const d of done) console.log('  ✓ ' + d);
if (skipped.length) console.log(`  not found, skipped: ${skipped.join(', ')}`);
for (const m of manual) console.log('  ! ' + m);
if (!DRY && doneIds.length) {
	await track(UNINSTALL ? 'uninstall' : 'install', { agents: doneIds }, '0.2.0');
	if (!UNINSTALL && !telemetryOff()) console.log('\nSite Prompt counts installs and tool use anonymously (no URLs, no content). Off: SITE_PROMPT_TELEMETRY=0');
}
if (!UNINSTALL) {
	console.log('\nRestart the agent, then ask it: "pick from https://linear.app" (or /site-prompt pick <link> in Claude Code).');
	console.log('Any other MCP client: run  node ' + SERVER + '  as a stdio server.');
}
