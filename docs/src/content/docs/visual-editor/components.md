---
title: Components and layouts
description: Reusable components with parameters and slots, saved layouts, and the theme's own Astro components.
sidebar:
  order: 8
---

## Components

- **Componentize** (Layers menu or Properties) turns the selected subtree into a component.
- A component can have up to 20 **parameters**: `{{name}}` in its text and attributes is replaced by each instance's
  value. A **Slot** inside it holds each instance's own content.
- **Edit component** changes the markup of every instance; **Detach** turns one instance back into plain blocks.
- **Update pages** in Explorer → Site writes the current markup to every page using the component.

## Layouts

**Save as layout** stores the selected subtree with its styles. Insert it from Add → Layouts or Explorer → Site
(Templates).

## Theme components

With a GitHub theme active, its `src/components/*.astro` files show under Add → Components with an `ASTRO` badge.

- Picking one adds a real Astro component block to the page. Wuppy passes the component map to the theme's
  `<Content />` automatically; no import line is written.
- The canvas shows the component's real output with the theme's styles (without props, rendered by the
  `/_wuppy/component/<Name>` page the Wuppy integration adds to the site). It is outlined and labelled so it can be
  selected; scripts inside it do not run on the canvas.
- A component that needs props it is not given (a table of contents without `headings`) does not break the page: the
  site skips it (an HTML comment, the error in the server log) and the canvas says it needs props.
- A `.md` entry that gets a component is saved as `.mdx`, so its body must be valid MDX: a stray closing tag such as
  `</div>` is reported as `invalid MDX` with its line.
