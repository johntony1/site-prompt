#!/bin/sh
# Installs Site Prompt into every coding agent on this machine (Claude Code, Codex, Cursor, Gemini CLI, Grok CLI,
# Windsurf, VS Code, Claude Desktop, opencode, Zed). Options: --only codex,cursor  --dry-run  --uninstall
set -e
here="$(cd "$(dirname "$0")" && pwd)"
command -v node >/dev/null || { echo "Site Prompt needs Node 22 or newer: https://nodejs.org"; exit 1; }
exec node "$here/install.mjs" "$@"
