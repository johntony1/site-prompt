# Site Prompt

Paste any website and get what it takes to rebuild it pixel perfect: a build prompt with every measurement, an exact
copy of the page, and a check that your rebuild matches. Click any part of a page to clone just that component.

A skill for coding agents: Claude Code, Codex, Cursor, Gemini CLI, Grok CLI, Windsurf, VS Code (Copilot), Claude
Desktop, opencode, Zed, and anything else that speaks MCP. Plain Node 22+ and the Chrome already on your machine;
nothing else to install.

## Install

    git clone https://github.com/johntony1/site-prompt && node site-prompt/install.mjs

It finds every agent on your machine and adds site-prompt to each one (the MCP server, and the skill where the agent
reads skills). Only installed agents are touched, every file it edits is backed up first (`.bak`), and running it
again updates. `--only codex,cursor` picks agents, `--dry-run` shows what it would do, `--uninstall` takes it out.

Then restart your agent and ask: "pick from https://linear.app". In Claude Code: `/site-prompt pick https://linear.app`.

| Agent | Where it goes |
| --- | --- |
| Claude Code | user MCP server + `~/.claude/skills/site-prompt` (or `/plugin marketplace add johntony1/site-prompt`, then `/plugin install site-prompt@site-prompt`) |
| Codex | `~/.codex/config.toml` + `~/.agents/skills/site-prompt` |
| Cursor | `~/.cursor/mcp.json` + `~/.cursor/skills/site-prompt` |
| Gemini CLI | an extension in `~/.gemini/extensions/site-prompt` |
| Grok CLI | `~/.grok/user-settings.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| VS Code (Copilot) | your user `mcp.json` |
| Claude Desktop | `claude_desktop_config.json` |
| opencode | `~/.config/opencode/opencode.json` + its skills folder |
| Zed | `context_servers` in your settings (comments kept) |

**Any other MCP client:** add a stdio server that runs `node ~/.site-prompt/app/server/server.mjs` (after running the
installer once), for example:

```json
{ "mcpServers": { "site-prompt": { "command": "node", "args": ["/Users/you/.site-prompt/app/server/server.mjs"], "env": { "SITE_PROMPT_WAIT": "50" } } } }
```

`SITE_PROMPT_WAIT` is how long pick mode waits inside one tool call (default 240 s). Set it below your client's tool
timeout; the agent is told to call again while you are still picking.

## What you get

`~/Documents/Site Prompts/<site>/` (the prompt is also shown in the chat and copied to the clipboard)

- **PROMPT.md**: the build prompt. Stack it was built with (framework, styling, motion libraries, host, with the
  evidence), every colour, type style, radius, shadow, blur and spacing value, each section with its exact copy and
  structure, hover states, the header on scroll, scroll reveals, keyframes, fonts, breakpoints, tablet and phone.
- **exact.html**: the page as the browser rendered it, with the site's own CSS inlined in cascade order. Every size,
  position and breakpoint is the original's. Checked against the live page (SSIM per band; Linear scores 1.0 at
  1440 px and 0.997 at 390 px).
- **shots/**: desktop, tablet and phone full pages, every section at 1440 px.
- **spec.json**, **css/**: every measurement, and the compiled stylesheets.

`~/Documents/Site Prompts/<site>/components/<name>/` for a component: **component.html** (standalone, exact, with its hover,
focus and press states, keyframes and embedded fonts), **COMPONENT.md**, and screenshots of the original and the
clone, checked pixel by pixel.

## Pick mode: point at what you like

`/site-prompt pick <link>` puts a small toolbar on the live site. Hover anything and it says what it is (Button,
Text, Illustration, Section, Component); click what you like, optionally say what you like about it, pick as many as
you want, press **Get prompts**. Each pick becomes a prompt with its exact code, states, type or artwork, shown in
the chat, saved under `picks/`, and copied to the clipboard.

- **Area.** Press Area (or A) and drag a rectangle to take everything inside it.
- **Bigger, smaller.** ↑ picks what holds the hovered thing, ↓ goes back.
- **Hold.** A menu that opens on hover closes when the pointer leaves. Open it, press Hold (or H) and the page stays
  as it is while you pick inside it; H again lets go.

No extension and no app: it runs in **your own Chrome** when remote debugging is on (`chrome://inspect/#remote-debugging`,
Chrome 144 or later; Chrome asks you to allow each session), and otherwise in a Chrome window it opens for you.

## While you build

Run it inside your project and the toolbar also offers **Add to <your project>**. Pick the button, card or section
you like (the note box takes "put it on my pricing page"), press Add, and your agent builds it into your code in
your stack (Next.js, React, Vue, Svelte, Tailwind, TypeScript...) with the original's exact values, then checks it
in your running dev server against the original with `site_match` and fixes what is off.

- **Show where it goes.** With your dev server running, Add opens your site in a new tab: click where each pick goes
  (a line shows above or below, hold Alt to replace). Your agent gets the spot and the source file and line it is in
  (React, Vue, Svelte and Astro dev info, else a search of your code).
- **Exact or My style.** Exact copies it pixel for pixel. My style keeps the layout, spacing and motion and dresses it
  in your fonts, colours, radius and CSS variables, read from your running site.
- **Phones too.** Every pick is also read at 390 px wide, so the prompt says what the original changes there.
- **Answers in the toolbar.** When it is built, your agent says so in the toolbar ("✓ Added to Hero.tsx, 99% match").

## Motion and interaction

Every pick also records how it moves. A Chrome of its own replays a person on the page (load, scroll it into
view, wait, hover, move across it, leave, press) and records every animated property, frame by frame. The prompt
gets each move by trigger with its timing and curve: exact where the page says so (CSS transitions and animations,
`element.animate` from Motion and Framer Motion, GSAP calls and their ScrollTrigger), measured and fitted otherwise
(a cubic-bezier, or a spring's stiffness and damping), plus scroll-linked moves, pointer-following tilts, loops and
staggers, and a filmstrip of the key frames (motion.png).

## Break it down

Want to learn how something is made, or make your own version? Pick it and press **Break it down** in the note
card. You get a lesson instead of a copy: an exploded view of its layers, what each layer is and the technique
behind it (stacked shadows, gradient masks, `::before` layers, tilts, what is hidden until hover), and the build in
steps, each with a picture of how far yours should look.

It is also taken apart right on the page, in a second:

- **Specs** for flat things (a nav bar, a card list): laid flat, with callout cards for fills, type, radius and
  padding joined to each part, like a Figma spec. **3D** for stacked things (an illustration, a card over a glow): the
  layers lift off and split apart; drag to turn, one click switches between seen from above and facing you.
- **A card per layer** on the right: why it works, design and engineering details (spacing grid, corner nesting,
  elevation, tokens, states, hit size, focus style), the site's own CSS as written, and Copy prompt or Copy CSS.
- **The thread.** Each layer lists its parts as a tree: a card opens into its title, its text and its drawing, a
  drawing into its lines and circles. Click a part (or double click it on the canvas) for its own card, with the
  way back above it.
- **Live.** Animations and canvas drawings keep playing inside the view, in step with the page.
- **Every size.** Phone, Tablet, Laptop and Big screen tabs show how it lays out at each width. Zoom with the wheel
  or the + and - buttons.

## Tools

- `site_read`: read and measure a page, write the folder above.
- `site_prompt`: add the agent's visual notes per section to PROMPT.md.
- `site_pick`: pick mode (above).
- `site_component`: clone one component by selector.
- `site_match`: check a component you built (local url + selector) against the one you picked.
- `site_compare`: score a rebuild against the original, band by band, with original | clone | difference sheets.

## Limits

The browser only receives the built site, so the stack is named from fingerprints and the original source is never
claimed. Pages behind logins or heavy bot protection may not load. Canvas, WebGL and video are photographed, not
measured. For learning, redesigns or your own product: if you publish a rebuild, use your own name, logo, copy and
images.

## What it counts

Site Prompt sends anonymous counts so I can see how many people use it and in which agents: a random id made on your
machine, the event (an install, a first run, a tool used), the tool's name and whether it worked, the agent's name,
the version, your OS, and the country Cloudflare sees. Never URLs, page content, prompts, files or names. The code
that receives it is in [`stats/`](stats/). Turn it off with `SITE_PROMPT_TELEMETRY=0` or `DO_NOT_TRACK=1`, or by
creating `~/.site-prompt/no-telemetry`.

## Tests

    node test/test.mjs     # end to end against a local page with known answers
    node test/view.mjs     # the breakdown view
    node test/pick.mjs     # pick mode end to end

MIT licence.
