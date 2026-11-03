// Chrome over the DevTools protocol with nothing installed: Node ≥ 22's own WebSocket talks to the Chrome (or
// Chromium, Edge, Brave) already on the machine. Headless for reading and comparing; a real window for picking.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ToolError } from './mcp.mjs';

const CANDIDATES = {
	darwin: [
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
		'/Applications/Chromium.app/Contents/MacOS/Chromium',
		'/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
		'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
		'/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
	],
	linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium', '/usr/bin/microsoft-edge'],
	win32: [
		'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
		'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
		'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
	],
};

export function findChrome() {
	if (process.env.SITE_PROMPT_CHROME && existsSync(process.env.SITE_PROMPT_CHROME)) return process.env.SITE_PROMPT_CHROME;
	return (CANDIDATES[process.platform] ?? []).find((p) => existsSync(p)) ?? null;
}

export class Page {
	constructor(ws) {
		this.ws = ws;
		this.seq = 0;
		this.waiting = new Map();
		this.listeners = new Map();
		ws.addEventListener('message', (ev) => {
			const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
			if (msg.method) for (const fn of this.listeners.get(msg.method) ?? []) fn(msg.params);
			const w = msg.id !== undefined && this.waiting.get(msg.id);
			if (!w) return;
			this.waiting.delete(msg.id);
			if (msg.error) w.reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`.trim()));
			else w.resolve(msg.result);
		});
		ws.addEventListener('close', () => {
			for (const w of this.waiting.values()) w.reject(new Error('Chrome went away'));
			this.waiting.clear();
		});
	}
	on(method, fn) {
		if (!this.listeners.has(method)) this.listeners.set(method, new Set());
		this.listeners.get(method).add(fn);
		return () => this.listeners.get(method).delete(fn);
	}
	once(method, timeoutMs = 30_000) {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => (off(), reject(new Error(`${method} did not come`))), timeoutMs);
			const off = this.on(method, (p) => (clearTimeout(timer), off(), resolve(p)));
		});
	}
	send(method, params = {}, timeoutMs = 60_000) {
		const id = ++this.seq;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.waiting.delete(id);
				reject(new Error(`${method} timed out`));
			}, timeoutMs);
			this.waiting.set(id, {
				resolve: (v) => (clearTimeout(timer), resolve(v)),
				reject: (e) => (clearTimeout(timer), reject(e)),
			});
			this.ws.send(JSON.stringify({ id, method, params }));
		});
	}
	/** Evaluate an expression in the page (awaiting promises) and return its JSON value. */
	async eval(expression, timeoutMs = 60_000) {
		const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeoutMs);
		if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
		return r.result?.value;
	}
	/** Run fn(arg) in the page; fn must be self-contained. */
	run(fn, arg, timeoutMs) {
		return this.eval(`(${fn.toString()})(${JSON.stringify(arg ?? null)})`, timeoutMs);
	}
}

/** A Chrome of its own (closed with .close()). headless: false opens a real window the person can use. */
export async function launch({ headless = true, width = 1440, height = 900 } = {}) {
	const exe = findChrome();
	if (!exe) throw new ToolError('site-prompt needs Chrome (or Chromium, Edge, Brave) and found none. Install Google Chrome, or set SITE_PROMPT_CHROME to a Chromium-based browser.');
	const profile = mkdtempSync(path.join(os.tmpdir(), 'site-prompt-chrome-'));
	const proc = spawn(exe, [
		...(headless ? ['--headless=new', '--hide-scrollbars', '--mute-audio'] : [`--window-size=${width},${height + 90}`, '--new-window']),
		'--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
		'--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
		'--force-color-profile=srgb', '--disable-blink-features=AutomationControlled', 'about:blank',
	], { stdio: ['ignore', 'ignore', 'pipe'] });
	const endpoint = await new Promise((resolve, reject) => {
		let err = '';
		const timer = setTimeout(() => reject(new Error('Chrome did not start in 20 s')), 20_000);
		proc.stderr.on('data', (d) => {
			err += d;
			const m = err.match(/DevTools listening on (ws:\/\/\S+)/);
			if (m) (clearTimeout(timer), resolve(m[1]));
		});
		proc.on('exit', (code) => reject(new Error(`Chrome exited (${code}): ${err.slice(-400)}`)));
	});
	const port = new URL(endpoint).port;
	let target;
	for (let k = 0; k < 40 && !target; k++) {
		target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
		if (!target) await new Promise((r) => setTimeout(r, 100));
	}
	const ws = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise((resolve, reject) => {
		ws.addEventListener('open', resolve, { once: true });
		ws.addEventListener('error', () => reject(new Error('could not attach to Chrome')), { once: true });
	});
	const page = new Page(ws);
	await page.send('Page.enable');
	await page.send('Runtime.enable');
	await page.send('Network.enable');
	await page.send('DOM.enable');
	await page.send('CSS.enable');
	// a normal browser's user agent: some sites serve an empty shell to "HeadlessChrome"
	const ua = (await page.eval('navigator.userAgent')).replace('HeadlessChrome', 'Chrome');
	await page.send('Network.setUserAgentOverride', { userAgent: ua });
	if (headless) await viewport(page, width, height);
	const close = () => {
		try { proc.kill('SIGKILL'); } catch {}
		try { rmSync(profile, { recursive: true, force: true }); } catch {}
	};
	open.add(close);
	return { page, close: () => (open.delete(close), close()) };
}

const open = new Set();
for (const sig of ['exit', 'SIGINT', 'SIGTERM', 'SIGHUP']) {
	process.on(sig, () => {
		for (const c of open) c();
		if (sig !== 'exit') process.exit(0);
	});
}

export async function viewport(page, width, height, mobile = false) {
	await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
	await page.send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
}

/** Navigate and wait for the load event, then for the network to go quiet (at most `settle` ms more). */
export async function goto(page, url, { settle = 8000 } = {}) {
	let inflight = 0, last = Date.now(), doc = null;
	const offs = [
		page.on('Network.requestWillBeSent', () => (inflight++, (last = Date.now()))),
		page.on('Network.loadingFinished', () => (inflight = Math.max(0, inflight - 1), (last = Date.now()))),
		page.on('Network.loadingFailed', () => (inflight = Math.max(0, inflight - 1), (last = Date.now()))),
		page.on('Network.responseReceived', (p) => { if (p.type === 'Document' && !doc) doc = p.response; }),
	];
	try {
		const loaded = page.once('Page.loadEventFired', 45_000).catch(() => null);
		const nav = await page.send('Page.navigate', { url });
		if (nav.errorText) throw new ToolError(`Could not open ${url}: ${nav.errorText}`);
		await loaded;
		const t0 = Date.now();
		while (Date.now() - t0 < settle) {
			if (inflight <= 2 && Date.now() - last > 700) break;
			await new Promise((r) => setTimeout(r, 100));
		}
		await document_fonts(page);
	} finally {
		offs.forEach((off) => off());
	}
	return doc;
}

const document_fonts = (page) => page.eval('document.fonts ? Promise.race([document.fonts.ready.then(() => true), new Promise((r) => setTimeout(r, 3000))]) : true').catch(() => null);

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Scroll the whole page slowly (lazy images load, scroll reveals fire), then back to the top. */
export async function scrollThrough(page, { step = 0.7, pause = 220 } = {}) {
	const H = await page.eval('Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)');
	const vh = await page.eval('innerHeight');
	for (let y = 0; y < Math.min(H, 30000); y += vh * step) {
		await page.eval(`window.scrollTo(0, ${Math.round(y)})`);
		await wait(pause);
	}
	await page.eval('window.scrollTo(0, document.documentElement.scrollHeight)');
	await wait(500);
	await page.eval('window.scrollTo(0, 0)');
	await wait(600);
}

/** A screenshot of a region of the page in page coordinates (beyond the viewport too). */
export async function shot(page, { x = 0, y = 0, width, height, scale = 1, format = 'jpeg', quality = 82 }) {
	const r = await page.send('Page.captureScreenshot', {
		format, ...(format === 'jpeg' ? { quality } : {}),
		clip: { x, y, width: Math.max(1, width), height: Math.max(1, height), scale }, captureBeyondViewport: true, fromSurface: true,
	}, 90_000);
	return Buffer.from(r.data, 'base64');
}

export async function pageSize(page) {
	const m = await page.send('Page.getLayoutMetrics');
	const c = m.cssContentSize ?? m.contentSize;
	return { width: Math.ceil(c.width), height: Math.ceil(c.height) };
}
