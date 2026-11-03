# Site Prompt

Paste any website and get what it takes to rebuild it pixel perfect: a build prompt with every measurement, an exact
copy of the page, and a check that your rebuild matches. Click any part of a page to clone just that component.

A Claude Code (and Codex) plugin. Plain Node 22+ and the Chrome already on your machine; nothing to install.

    /plugin marketplace add <this repo>
    /plugin install site-prompt@site-prompt

    /site-prompt:prompt https://linear.app
    /site-prompt:component https://stripe.com

## What you get

`site-prompts/<site>/`

- **PROMPT.md**: the build prompt. Stack it was built with (framework, styling, motion libraries, host, with the
  evidence), every colour, type style, radius, shadow, blur and spacing value, each section with its exact copy and
  structure, hover states, the header on scroll, scroll reveals, keyframes, fonts, breakpoints, tablet and phone.
- **exact.html**: the page as the browser rendered it, with the site's own CSS inlined in cascade order. Every size,
  position and breakpoint is the original's. Checked against the live page (SSIM per band; Linear scores 1.0 at
  1440 px and 0.997 at 390 px).
- **shots/**: desktop, tablet and phone full pages, every section at 1440 px.
- **spec.json**, **css/**: every measurement, and the compiled stylesheets.

`site-prompts/<site>/components/<name>/` for a component: **component.html** (standalone, exact, with its hover,
focus and press states, keyframes and embedded fonts), **COMPONENT.md**, and screenshots of the original and the
clone, checked pixel by pixel.

## Tools

- `site_read`: read and measure a page, write the folder above.
- `site_prompt`: add the agent's visual notes per section to PROMPT.md.
- `site_component`: clone one component (click it in a Chrome window, or pass a selector).
- `site_compare`: score a rebuild against the original, band by band, with original | clone | difference sheets.

## Limits

The browser only receives the built site, so the stack is named from fingerprints and the original source is never
claimed. Pages behind logins or heavy bot protection may not load. Canvas, WebGL and video are photographed, not
measured. For learning, redesigns or your own product: if you publish a rebuild, use your own name, logo, copy and
images.

    node test/test.mjs     # end to end against a local page with known answers
