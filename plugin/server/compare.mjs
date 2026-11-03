// The clone against the original, side by side: full pages at each width, scored band by band with SSIM (computed in
// Chrome's canvas, so nothing has to be installed), the worst bands returned as original | clone | difference.
import { goto, launch, pageSize, scrollThrough, shot, viewport, wait } from './chrome.mjs';
import { dismissConsent } from './inpage.mjs';

export const PASS = 0.95;

async function capture(page, url, width, height) {
	await viewport(page, width, height, width < 600);
	await goto(page, url, { settle: 6000 });
	if (await page.run(dismissConsent).catch(() => false)) await wait(500);
	await scrollThrough(page, { step: 0.9, pause: 160 });
	const size = await pageSize(page);
	const h = Math.min(size.height, 14000);
	const scale = Math.min(1, 720 / width);
	return { jpeg: await shot(page, { width, height: h, scale, quality: 90 }), height: size.height, scale };
}

/** Runs in a blank page: decode both, score bands, draw the worst. */
function score({ a, b, band }) {
	const load = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
	return Promise.all([load(a), load(b)]).then(([A, B]) => {
		const w = Math.min(A.naturalWidth, B.naturalWidth);
		const draw = (im) => { const c = document.createElement('canvas'); c.width = w; c.height = Math.round(im.naturalHeight * (w / im.naturalWidth)); const x = c.getContext('2d'); x.drawImage(im, 0, 0, c.width, c.height); return c; };
		const ca = draw(A), cb = draw(B);
		const h = Math.min(ca.height, cb.height);
		const ga = ca.getContext('2d').getImageData(0, 0, w, h).data, gb = cb.getContext('2d').getImageData(0, 0, w, h).data;
		const ssim = (y0, y1) => {
			const C1 = 6.5025, C2 = 58.5225;
			let tot = 0, n = 0;
			for (let ch = 0; ch < 3; ch++) for (let y = y0; y + 8 <= y1; y += 4) for (let x = 0; x + 8 <= w; x += 4) {
				let ma = 0, mb = 0;
				for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const k = ((y + j) * w + x + i) * 4 + ch; ma += ga[k]; mb += gb[k]; }
				ma /= 64; mb /= 64;
				let va = 0, vb = 0, cv = 0;
				for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const k = ((y + j) * w + x + i) * 4 + ch, da = ga[k] - ma, db = gb[k] - mb; va += da * da; vb += db * db; cv += da * db; }
				va /= 63; vb /= 63; cv /= 63;
				tot += ((2 * ma * mb + C1) * (2 * cv + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
				n++;
			}
			return n ? tot / n : 1;
		};
		const bands = [];
		for (let y = 0; y < h; y += band) bands.push({ y, h: Math.min(band, h - y), ssim: ssim(y, Math.min(h, y + band)) });
		// mean absolute difference, 0..1: what a person sees (SSIM punishes anti-aliasing on small text hard)
		let ad = 0;
		for (let i = 0; i < w * h * 4; i += 4) ad += Math.abs(ga[i] - gb[i]) + Math.abs(ga[i + 1] - gb[i + 1]) + Math.abs(ga[i + 2] - gb[i + 2]);
		const diff = ad / (w * h * 3 * 255);
		const sheet = (bd) => {
			const c = document.createElement('canvas');
			c.width = w * 3 + 16; c.height = bd.h;
			const x = c.getContext('2d');
			x.fillStyle = '#ff2d55'; x.fillRect(0, 0, c.width, c.height);
			x.drawImage(ca, 0, bd.y, w, bd.h, 0, 0, w, bd.h);
			x.drawImage(cb, 0, bd.y, w, bd.h, w + 8, 0, w, bd.h);
			const da = ca.getContext('2d').getImageData(0, bd.y, w, bd.h), db = cb.getContext('2d').getImageData(0, bd.y, w, bd.h);
			const d = x.createImageData(w, bd.h);
			for (let i = 0; i < d.data.length; i += 4) { const v = Math.min(255, (Math.abs(da.data[i] - db.data[i]) + Math.abs(da.data[i + 1] - db.data[i + 1]) + Math.abs(da.data[i + 2] - db.data[i + 2])) * 2); d.data[i] = v; d.data[i + 1] = v; d.data[i + 2] = v; d.data[i + 3] = 255; }
			x.putImageData(d, w * 2 + 16, 0);
			return c.toDataURL('image/jpeg', 0.82);
		};
		const worst = [...bands].sort((p, q) => p.ssim - q.ssim).slice(0, 3);
		return { width: w, diff: Math.round(diff * 10000) / 10000, heights: [ca.height, cb.height], bands: bands.map((bd) => ({ y: bd.y, ssim: Math.round(bd.ssim * 1000) / 1000 })), sheets: worst.map((bd) => ({ y: bd.y, ssim: Math.round(bd.ssim * 1000) / 1000, jpeg: sheet(bd) })) };
	});
}

/** Score two images (JPEG/PNG buffers) in a page. */
export async function scoreImages(page, a, b, band = 480) {
	await page.send('Page.navigate', { url: 'about:blank' });
	await wait(100);
	const uri = (buf) => `data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}`;
	return page.run(score, { a: uri(a), b: uri(b), band }, 180_000);
}

export async function compare(original, clone, { widths = [1440, 390] } = {}) {
	const { page, close } = await launch();
	try {
		const out = [];
		for (const width of widths) {
			const height = width < 600 ? 844 : width < 1000 ? 1024 : 900;
			const A = await capture(page, original, width, height);
			const B = await capture(page, clone, width, height);
			const r = await scoreImages(page, A.jpeg, B.jpeg, Math.round(600 * A.scale));
			const mean = r.bands.reduce((s, x) => s + x.ssim, 0) / Math.max(1, r.bands.length);
			const toPage = (y) => Math.round(y / A.scale);
			out.push({
				width, mean: Math.round(mean * 1000) / 1000, min: Math.min(...r.bands.map((x) => x.ssim)),
				heights: { original: A.height, clone: B.height },
				bands: r.bands.map((x) => ({ y: toPage(x.y), ssim: x.ssim })),
				sheets: r.sheets.filter((s) => s.ssim < PASS).map((s) => ({ y: toPage(s.y), ssim: s.ssim, jpeg: Buffer.from(s.jpeg.split(',')[1], 'base64') })),
			});
		}
		return out;
	} finally {
		close();
	}
}

/** Runs in a blank page: `b` is `a`'s size plus `pad` on every side; find the offset where they line up best and
 *  score there (a standalone component's own position is not part of its design). */
function aligned({ a, b, pad }) {
	const load = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
	return Promise.all([load(a), load(b)]).then(([A, B]) => {
		const px = (im) => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return { c, d: x.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height }; };
		const pa = px(A), pb = px(B), w = pa.w, h = pa.h;
		const at = (dx, dy) => { let s = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, j = ((y + dy) * pb.w + x + dx) * 4; s += Math.abs(pa.d[i] - pb.d[j]) + Math.abs(pa.d[i + 1] - pb.d[j + 1]) + Math.abs(pa.d[i + 2] - pb.d[j + 2]); } return s / (w * h * 3 * 255); };
		let best = { dx: pad, dy: pad, diff: Infinity };
		for (let dy = 0; dy <= pad * 2 && dy + h <= pb.h; dy++) for (let dx = 0; dx <= pad * 2 && dx + w <= pb.w; dx++) { const d = at(dx, dy); if (d < best.diff) best = { dx, dy, diff: d }; }
		const C1 = 6.5025, C2 = 58.5225;
		let tot = 0, n = 0;
		for (let ch = 0; ch < 3; ch++) for (let y = 0; y + 8 <= h; y += 2) for (let x = 0; x + 8 <= w; x += 2) {
			let ma = 0, mb = 0;
			for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { ma += pa.d[((y + j) * w + x + i) * 4 + ch]; mb += pb.d[((y + j + best.dy) * pb.w + x + i + best.dx) * 4 + ch]; }
			ma /= 64; mb /= 64;
			let va = 0, vb = 0, cv = 0;
			for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const da = pa.d[((y + j) * w + x + i) * 4 + ch] - ma, db = pb.d[((y + j + best.dy) * pb.w + x + i + best.dx) * 4 + ch] - mb; va += da * da; vb += db * db; cv += da * db; }
			va /= 63; vb /= 63; cv /= 63;
			tot += ((2 * ma * mb + C1) * (2 * cv + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2)); n++;
		}
		const sheet = document.createElement('canvas');
		sheet.width = w * 3 + 16; sheet.height = h;
		const x = sheet.getContext('2d');
		x.fillStyle = '#ff2d55'; x.fillRect(0, 0, sheet.width, h);
		x.drawImage(pa.c, 0, 0);
		x.drawImage(pb.c, best.dx, best.dy, w, h, w + 8, 0, w, h);
		const dimg = x.createImageData(w, h);
		for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) { const i = (y * w + xx) * 4, j = ((y + best.dy) * pb.w + xx + best.dx) * 4; const v = Math.min(255, (Math.abs(pa.d[i] - pb.d[j]) + Math.abs(pa.d[i + 1] - pb.d[j + 1]) + Math.abs(pa.d[i + 2] - pb.d[j + 2])) * 2); dimg.data[i] = dimg.data[i + 1] = dimg.data[i + 2] = v; dimg.data[i + 3] = 255; }
		x.putImageData(dimg, w * 2 + 16, 0);
		return { ssim: n ? Math.round((tot / n) * 1000) / 1000 : 1, diff: Math.round(best.diff * 10000) / 10000, offset: [best.dx - pad, best.dy - pad], sheet: sheet.toDataURL('image/jpeg', 0.9) };
	});
}

export async function alignedScore(page, a, b, pad) {
	await page.send('Page.navigate', { url: 'about:blank' });
	await wait(100);
	const uri = (buf) => `data:image/png;base64,${Buffer.from(buf).toString('base64')}`;
	return page.run(aligned, { a: uri(a), b: uri(b), pad }, 180_000);
}
