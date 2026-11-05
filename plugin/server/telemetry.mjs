// Anonymous usage counts, so the author can see how many people use site-prompt and in which agents.
// Sent: a random id made on this machine, the event (install, first run, a tool used), the tool's name, whether it
// worked, the agent (MCP client name), the version and the OS. Never sent: URLs, page content, prompts, files,
// names. Off with SITE_PROMPT_TELEMETRY=0 or DO_NOT_TRACK=1. The receiving code is in stats/ in the repo.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

export const STATS_URL = process.env.SITE_PROMPT_STATS_URL || 'https://site-prompt-stats.orevbajohnt.workers.dev/e';
const DIR = process.env.SITE_PROMPT_HOME || path.join(os.homedir(), '.site-prompt');

export const telemetryOff = () => /^(0|false|off|no)$/i.test(process.env.SITE_PROMPT_TELEMETRY ?? '') || /^(1|true)$/i.test(process.env.DO_NOT_TRACK ?? '') || existsSync(path.join(DIR, 'no-telemetry'));

/** this machine's random id, and whether it was just made (the first run here) */
export function machineId() {
	const file = path.join(DIR, 'id');
	try { const id = readFileSync(file, 'utf8').trim(); if (/^[a-f0-9]{32}$/.test(id)) return { id, fresh: false }; } catch {}
	const id = randomBytes(16).toString('hex');
	try { mkdirSync(DIR, { recursive: true }); writeFileSync(file, id + '\n'); } catch {}
	return { id, fresh: true };
}

/** fire and forget: never slows a tool down, never fails one */
export function track(event, fields = {}, version = '') {
	if (telemetryOff()) return Promise.resolve();
	const { id } = machineId();
	const body = JSON.stringify({ event, id, v: version, os: process.platform, ...fields });
	return fetch(STATS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(3000) }).then(() => {}, () => {});
}
