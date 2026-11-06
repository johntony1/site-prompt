#!/usr/bin/env node
// site-prompt from npm.
//   npx site-prompt            the MCP server (what agents run)
//   npx site-prompt install    add it to every coding agent on this machine (--only, --dry-run as in install.mjs)
//   npx site-prompt uninstall  take it out again
import { readFileSync } from 'node:fs';
const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'install' || cmd === 'uninstall') {
	process.env.SITE_PROMPT_VIA_NPX = '1';
	process.argv = [process.argv[0], process.argv[1], ...rest, ...(cmd === 'uninstall' ? ['--uninstall'] : [])];
	await import('../install.mjs');
} else if (cmd === '--version' || cmd === '-v') {
	console.log(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
} else if (cmd === '--help' || cmd === '-h') {
	console.log('site-prompt: point at any part of a website, get the prompt that rebuilds it.\n\n  npx site-prompt install     add it to every coding agent on this machine\n  npx site-prompt uninstall   remove it\n  npx site-prompt             run the MCP server (agents do this)\n\nhttps://github.com/johntony1/site-prompt');
} else {
	await import('../plugin/server/server.mjs');
}
