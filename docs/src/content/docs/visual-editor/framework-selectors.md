---
title: Framework and selectors
description: Site-wide design tokens, shared CSS selectors, breakpoints and conditions.
sidebar:
  order: 7
---

## Framework

Site-wide design tokens in **Overview**, **Colors**, **Type** and **Space** tabs:

- the class prefix, root font size and the smallest/largest screen width for the fluid scales;
- colours with optional dark values, up to 9 darker and 9 lighter shades, transparent variants and utility classes;
- fluid **type** and **space** scales (smallest/largest size and ratio, step names, base step);
- font stacks with an optional `https` stylesheet link.

Each token becomes a CSS variable and, with utilities on, a utility class (default prefix `v-`). Properties inputs
suggest them.

## Selectors

A library of shared selectors (`.card`, `h2`, `.hero > p`…). Open one to style every matching element on every page,
with the same context and state options as Properties. Class selectors are suggested in the selector field.

## Settings

The gear in the top bar opens the editor settings:

- the base (desktop) frame width;
- **breakpoints** for the context picker and the device menu (max-width, desktop first; up to 8), each with an id, label
  and width;
- **conditions**: `@media`, `@container` or `@supports` queries, up to 20;
- the shortcut list.

All of these are saved in `.wuppy/data/visual.json` (see [Saving and limits](/visual-editor/saving/)).
