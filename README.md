# Site Prompt

Paste any website and get what it takes to rebuild it pixel perfect: a build prompt with every measurement, an exact
copy of the page, and a check that your rebuild matches. Click any part of a page to clone just that component.

A Claude Code (and Codex) plugin. Plain Node 22+ and the Chrome already on your machine; nothing to install.

    sh install.sh                       # then, in any Claude Code session:
    /site-prompt https://linear.app
    /site-prompt pick https://linear.app     # hover what you like, click it, Get prompts

(Or as a plugin: /plugin marketplace add <this repo>, then /site-prompt:prompt <link>.)

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

## Break it down

Want to learn how something is made, or make your own version? Pick it and press **Break it down** in the note
card. You get a lesson instead of a copy: an exploded view of its layers, what each layer is and the technique
behind it (stacked shadows, gradient masks, `::before` layers, tilts, what is hidden until hover), and the build in
steps, each with a picture of how far yours should look.

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

    node test/test.mjs     # end to end against a local page with known answers
