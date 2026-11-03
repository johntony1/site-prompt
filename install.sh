#!/bin/sh
# Installs Site Prompt for Claude Code as /site-prompt: the tool server (user scope) and the skill.
#   sh install.sh
set -e
here="$(cd "$(dirname "$0")" && pwd)"
command -v node >/dev/null || { echo "Site Prompt needs Node 22 or newer: https://nodejs.org"; exit 1; }
claude mcp remove --scope user site-prompt >/dev/null 2>&1 || true
claude mcp add --scope user site-prompt -- node "$here/plugin/server/server.mjs"
mkdir -p "$HOME/.claude/skills/site-prompt"
{
	cat "$here/plugin/skills/site-prompt/SKILL.md"
	printf '\n## When called as /site-prompt\n\n$ARGUMENTS is the link (and maybe what to do). A link alone: run the whole-page flow above and finish with site_prompt. "component" or a named part: site_component. Two links: site_compare.\n'
} > "$HOME/.claude/skills/site-prompt/SKILL.md"
echo "Installed. In Claude Code: /site-prompt https://linear.app"
