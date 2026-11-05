---
name: site-prompt
description: "Turn any website, or any part of one, into a build prompt precise enough to rebuild it 1:1: layout, spacing, type, colours, depth, copy, hover states, scroll motion and the stack it was built with, all measured from the live page in Chrome, with screenshots, and a check that the rebuild matches. Use when the user pastes a site or landing page link and wants it cloned, recreated, rebuilt or turned into a prompt, wants one component (a button, card, nav, hero, pricing table) copied exactly, wants a component from another site added to the project they are building ("grab that pricing card from Linear", "add Stripe's button to my site"), or wants a rebuild compared with the original."
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

`site_read` with the url. It opens the page in Chrome, scrolls it like a person, measures everything, writes
`~/Documents/Site Prompts/<site>/` (PROMPT.md, exact.html, spec.json, css/, shots/), copies the prompt to the
clipboard and returns it. In the same reply, show the whole prompt in one markdown code block exactly as returned,
then the clickable link to PROMPT.md, then one line on what it was built with (say plainly when the stack is a guess
or a site builder). Do not stop in between or ask anything first. Only if they ask to refine it later: `site_prompt`
adds visual notes per section.

If they ask you to build it too: build from PROMPT.md section by section, run it locally, then `site_compare` with
the original and the local url. Fix the first failing band from the top, compare again, up to five rounds.

## Point at what you like (pick mode)

When the person wants a part of a site (a button style, an illustration, a line of type, a section, any component),
or says "pick", "hover", "point at":

1. In one or two lines, tell them: hover anything on the page, click what you like (a note is optional), then press
   Get prompts in the toolbar, bottom right. Or press Area (or A) and drag a rectangle over any part of the page to take
   everything inside it; ↑ picks what holds the hovered thing, ↓ goes back.
2. Call `site_pick` with the url. It opens the site with the picker (in their own Chrome when remote debugging is on
   at chrome://inspect/#remote-debugging, else a Chrome window site-prompt opens) and waits in the same call for
   their picks. If it comes back with nothing picked, call it again at once with no url: never end your turn to wait
   for a reply, the picks arrive through site_pick.
3. Each pick comes back as a prompt with its exact code, states, type spec or artwork, and a screenshot, saved in
   `~/Documents/Site Prompts/<site>/picks/` and copied to the clipboard. Show every prompt in full in its own
   markdown block with its saved link. Then call `site_pick` (no url) again to wait for more, until they say they
   are done; then `stop: true`.

## Motion and interaction (every pick)

Every pick's motion is recorded too, in a Chrome of its own (their page never moves): the page loading, scrolling it
into view, sitting still, hover, the pointer moving across it, leaving, press (and click when that is safe). The
prompt's "Motion and interaction" section lists each move by trigger with its timing and curve: exact when the page
says so (CSS transitions and animations, element.animate as used by Motion and Framer Motion, GSAP calls with their
ScrollTrigger), measured otherwise (a fitted cubic-bezier, or a spring with stiffness and damping when it
overshoots), plus moves tied to scroll, pointer-following tilts, loops and staggers; motion.png shows key frames.
Interaction is usually what people want from a site: when building a pick, build every motion listed, not only the
look. Sites behind a login are recorded logged out.

## Break it down (to learn, or remake it their own way)

The note card on a pick offers **Break it down** beside Get prompt. When they press it (or ask how something is
made, want to learn it, or want their own version), `site_pick` returns BREAK IT DOWN with a LESSON.md per pick: the
layers bottom to top, what each paints and the technique that makes it (stacked shadows, gradient masks, ::before
layers, tilts, things hidden until hover or scroll), an exploded view (exploded.png), each layer alone (layers/) and
the build in steps with a picture per step (steps/). It is also taken apart on the page itself, where they picked
it: a flat pick (a nav bar, a card list) opens in Specs, laid flat with callout cards (fills, text style, radius,
padding) joined to each part; a stacked one (an illustration) lifts off and splits into light layers in 3D on a dark
canvas, labelled down the left, with a spec
card per layer (fills with swatches, corners, shadows, tilt, overhang, motion) and Copy prompt / Copy CSS for that
layer alone, or Copy whole thing (hover a layer, drag to turn, Esc puts it back); say so in one line. It appears in a
few seconds; the motion fills into the cards when it is recorded. Teach it in plain words with the exploded view; keep CSS to the
lines that matter; offer to build it with them step by step in their stack. Never paste the whole lesson.

## While they build: add it to their project

When the person is working in a project (the folder you run in has a package.json or an index.html) and wants
something from another site in it ("grab Linear's pricing card", "I want that button on my landing page"):

1. Pick mode as above. The toolbar then offers **Exact | My style** and **Add to <project>**. Tell them in one or two
   lines: click what you like, choose Exact (pixel for pixel) or My style (same layout and motion in your fonts and
   colours), press Add, then click where it goes in your site.
2. When they press Add and their dev server is running (found by itself, or pass `dev_url`), their site opens in a new
   tab and they click where each pick goes (a line shows above or below, Alt replaces). `site_pick` then returns ADD
   TO THE PROJECT with each pick's folder, the spot (element, path, text) and the source file and line it is in,
   their design when they chose My style, and how each pick changes on phones.
3. Build each one in, in their conventions, at that spot. `site_match` it in the dev server and fix what it flags.
   Then `site_pick` with `say` ("✓ Added to Hero.tsx, 99% match") answers in their toolbar and keeps waiting for more.
   In the chat, report in a few lines; do not paste the prompts.
4. If they named the site and the thing in words and you can find it yourself, `site_component` with a selector
   gets the same folder without them picking; then build it in the same way.

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
