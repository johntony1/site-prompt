// A component the agent built, in the person's running app, against the element they picked: screenshot it and
// compare, aligned to the nearest pixel (a component's own position is not part of its design).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { alignedScore } from './compare.mjs';
import { goto, launch, shot, wait } from './chrome.mjs';
import { ToolError } from './mcp.mjs';

const pngSize = (buf) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];

export async function match(originalPng, url, selector) {
	const orig = readFileSync(originalPng);
	const [w, h] = pngSize(orig);
	const { page, close } = await launch({ width: 1440, height: 900 });
	try {
		await goto(page, url, { settle: 4000 });
		const b = await page.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; })()`);
		if (!b) throw new ToolError(`Nothing on ${url} matches ${selector}.`);
		await page.eval(`(() => { const s = document.createElement('style'); s.textContent = '*,*::before,*::after{transition:none!important;animation-play-state:paused!important}'; document.head.appendChild(s); })()`);
		await wait(150);
		// text anti-aliasing follows the sub-pixel position: in this check only, nudge the element to the original's
		// fraction (and a few others) with `translate`, and keep the best
		const meta = (() => { try { return JSON.parse(readFileSync(path.join(path.dirname(originalPng), 'pick.json'), 'utf8')); } catch { return null; } })();
		const frac = (v) => v - Math.floor(v);
		const canNudge = await page.eval(`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).translate === 'none'`);
		const P = 3, tries = [];
		const fxs = canNudge ? [...new Set([meta ? frac(meta.box.x) : frac(b.x), 0, 0.25, 0.5, 0.75])] : [frac(b.x)];
		const fys = canNudge ? [...new Set([meta ? frac(meta.box.y) : frac(b.y), 0, 0.5])] : [frac(b.y)];
		for (const fx of fxs) for (const fy of fys) {
			const dx = fx - frac(b.x), dy = fy - frac(b.y);
			if (canNudge) await page.eval(`document.querySelector(${JSON.stringify(selector)}).style.setProperty('translate', '${dx}px ${dy}px', 'important')`);
			await wait(40);
			tries.push(await shot(page, { x: Math.max(0, Math.floor(b.x) - P), y: Math.max(0, Math.floor(b.y) - P), width: w + P * 2, height: h + P * 2, format: 'png' }));
		}
		let s = null;
		for (const t of tries) { const sc = await alignedScore(page, orig, t, P); if (!s || sc.diff < s.diff) s = sc; }
		return { ...s, original: [w, h], yours: [Math.round(b.width), Math.round(b.height)], sizeOk: Math.abs(b.width - w) <= 2 && Math.abs(b.height - h) <= 2, sheet: Buffer.from(s.sheet.split(',')[1], 'base64') };
	} finally {
		close();
	}
}
