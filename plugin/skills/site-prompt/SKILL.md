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
   `~/Documents/Site Prompts/<site>/` (PROMPT.md, exact.html, spec.json, css/, shots/).
2. Look at every section screenshot (and `shots/phone-full.jpg`). Then `site_prompt` with `notes` per section
   number and an `overall` paragraph: only what the eye sees that the numbers miss (what the imagery shows, depth and
   layering, glow, texture, illustration style, density). Factual; never invent copy, features or numbers.
3. site_prompt returns the finished prompt, copies it to the clipboard and links the file. Show the person the
   whole prompt in the chat in one markdown code block, exactly as returned, then the clickable link to the .md file,
   then in one line what the site was built with (say plainly when the stack is a guess or a site builder) and how
   to use it.

If they ask you to build it too: build from PROMPT.md section by section, run it locally, then `site_compare` with
the original and the local url. Fix the first failing band from the top, compare again, up to five rounds.

## Point at what you like (pick mode)

When the person wants a part of a site (a button style, an illustration, a line of type, a section, any component),
or says "pick", "hover", "point at":

1. `site_pick` with the url. It opens the site with a picker toolbar: in their own Chrome when remote debugging is
   on (chrome://inspect/#remote-debugging, Chrome 144+; Chrome asks them to allow it), else in a Chrome window
   site-prompt opens (it keeps its own profile, so a sign-in stays). It returns at once.
2. Tell them in a few short lines: hover anything (it says what it is), click what they like, optionally type what
   they like about it, ↑ picks the bigger thing around it, Esc pauses picking so the site works normally, then
   press Get prompts (bottom right). Several picks at once, on any page of the site.
3. `site_pick` with no url waits for them (call it again if it times out; it keeps the session).
4. Each pick comes back as a prompt with its exact code (markup and computed styles), its hover, focus and press
   states, its type spec or its artwork, and a screenshot, saved in `~/Documents/Site Prompts/<site>/picks/` and
   copied to the clipboard. Show every prompt in full in its own markdown block with its saved link, then wait
   again for more picks. `stop: true` closes the picker.

One part by selector, without the person clicking: `site_component` with url and selector.

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
