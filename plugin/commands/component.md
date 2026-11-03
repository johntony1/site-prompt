---
description: Clone one part of a website exactly (click it on the page)
argument-hint: the page, and optionally what to clone, e.g. "https://stripe.com the hero button"
---

Use the site-prompt skill to clone one component from $ARGUMENTS. If I named the part and you can find a selector
for it from the page, use it; otherwise tell me a Chrome window is opening and I should click the part I want, then
call site_component. Show me what it cloned, its states, and how to use component.html.
