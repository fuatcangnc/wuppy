---
title: Canvas and devices
description: Design and Live modes, the device menu, zoom, selecting, inline text editing and drag and drop.
sidebar:
  order: 2
---

The canvas shows the page in iframes with the site's own stylesheets, fonts and `<html>`/`<body>` attributes, so what
you see is what visitors get.

## The floating toolbar

At the top of the canvas a small floating toolbar holds:

- your **favourite** modules (star them in [Add](/visual-editor/adding-blocks/)) as one-click buttons, and **Add** (**A**);
- **Design / Live**, the canvas mode;
- the **device** menu: a dropdown showing the current device (**Desktop**, **Tablet** or **Mobile**);
- in Design mode, zoom out, the zoom level (click it for 100%), zoom in and **Fit**.

## Design and Live

- **Design** shows one frame, Desktop first (the base width, 1440px). The device menu switches it to the Tablet
  breakpoint (the first one between 600px and 1100px wide) or the Mobile one (the first under 600px); the context picker
  in Properties reaches every breakpoint. The wheel scrolls, Ctrl/⌘ + wheel zooms, **Fit** fits the frame.
- **Live** shows one frame at the device's width, as visitors see it.
- In Design the frame is as tall as its page, so `vh` units in the page's CSS (`min-h-screen`,
  `calc(100vh - 5rem)`) are measured against a 900px-high screen, as on a real device. Without that, a section sized to
  the screen would grow with the frame and push the rest of the page out of view.

## Selecting and editing

- Click a block to select it. **Breadcrumbs** show its path from the page; click a part to select a parent. **Escape**
  selects the parent, then clears the selection.
- Double-click text to edit it in place: **Enter** commits a single-line block, Ctrl/⌘+Enter a multi-line one
  (Shift+Enter adds a line), **Escape** cancels.
- Drag blocks to reorder: the top or bottom edge drops before/after, the middle of a container drops inside.
- A selected block has a small toolbar (drag handle, select parent, add after, duplicate, delete) and a right-click menu
  (copy/cut/paste, duplicate, wrap in container, hide, lock, save as layout, componentize, detach, delete).
- Markdown blocks show rendered as the site renders them (the server checks them as on save). Edit their source in
  Properties.

## On a theme's live page

On a local site the canvas loads the entry's live page and edits the body in place, inside the theme's own header,
footer, styles and scripts (dark mode included). This works with any Astro theme that renders the entry with
`<Content />`: the integration marks where it renders with `<!--wuppy:body-->` comments. The theme's links and forms do
not navigate inside the canvas.

The theme's elements around the body can be selected and edited too: see [Theme elements](/visual-editor/theme-elements/).

With no marked body (an unsaved or unpublished entry, a page not built from an entry, a remote site, editing a
component) the canvas falls back to a blank frame with the site's stylesheet, fonts, `<html>`/`<body>` attributes and
inline head scripts.
