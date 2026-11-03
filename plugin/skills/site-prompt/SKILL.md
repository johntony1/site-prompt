---
name: site-prompt
description: "Turn any website, or any part of one, into a build prompt precise enough to rebuild it 1:1: layout, spacing, type, colours, depth, copy, hover states, scroll motion and the stack it was built with, all measured from the live page in Chrome, with screenshots, and a check that the rebuild matches. Use when the user pastes a site or landing page link and wants it cloned, recreated, rebuilt or turned into a prompt, wants one component (a button, card, nav, hero, pricing table) copied exactly, or wants a rebuild compared with the original."
license: MIT
compatibility: Claude Code or Codex with the site-prompt MCP server. Node 22+ and Google Chrome (or Chromium, Edge, Brave).
metadata:
  version: "0.1.0"
---

# site-prompt

A prompt alone never rebuilds a site exactly: words lose the numbers. What makes a rebuild 1:1 is measuring the live
page, writing those measurements into the prompt, keeping the screenshots and compiled CSS beside it, and comparing
the result with the original until it matches. These tools do each part.

## A whole page

1. `site_read` with the url. It opens the page in Chrome, scrolls it like a person, and measures everything. It
   returns the stack, the tokens, the sections and a screenshot of every section, and writes
   `site-prompts/<site>/` (PROMPT.md, spec.json, page.html, css/, shots/).
2. Look at every section screenshot (and `shots/phone-full.jpg`). Then `site_prompt` with `notes` per section
   number and an `overall` paragraph: only what the eye sees that the numbers miss (what the imagery shows, depth and
   layering, glow, texture, illustration style, density). Factual; never invent copy, features or numbers.
3. Tell the person in a few short lines: what it was built with (say plainly when the stack is a guess or a site
   builder), what the prompt covers, and how to use it: open `site-prompts/<site>/` in Claude Code, Codex or Cursor
   and say "Build PROMPT.md", or paste PROMPT.md into any builder with the shots attached.

If they ask you to build it too: build from PROMPT.md section by section, run it locally, then `site_compare` with
the original and the local url. Fix the first failing band from the top, compare again, up to five rounds.

## One component

`site_component` with the url. Without a selector, a Chrome window opens on the page: tell the person to hover the
part they want and click it (↑ picks the parent, Esc stops) before you call it. With a `selector`, it is taken
directly. It writes `component.html` (the exact component, standalone, with its hover, focus and press states,
keyframes and fonts), `COMPONENT.md` (the prompt to rebuild it in any stack) and screenshots, and checks the clone
against the original pixel by pixel. If they want it in their stack, rebuild it from component.html and compare
by eye against original.png and original-hover.png.

## What to say about the stack

The browser only receives the built site. site-prompt names the framework, styling, motion libraries and host from
what the page gives away (and lists that evidence); the original source code and whether it was TypeScript are never
in the page, so never claim them. For Framer, Webflow, Wix and Squarespace sites the prompt rebuilds them as code.

## Limits, said plainly

- Pages behind a login, heavy bot protection or a paywall may not load in Chrome.
- WebGL, 3D and canvas scenes, and video, are photographed and described, not measured.
- Paid fonts: the prompt names them and their files; the person needs a licence or the closest free match.
- Only the sites the person names. Rebuilding is for learning, redesigns or their own product: if they publish it,
  their own name, logo, copy and images go in.
