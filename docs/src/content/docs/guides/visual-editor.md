---
title: Visual editor
description: Build a page by placing blocks on a live canvas, then save it as MDX like any other entry.
sidebar:
  order: 2.6
---

The visual editor builds an entry's body on a canvas instead of typing Markdown/MDX. It edits the same entry as the
classic editor and saves through the same API, so permissions, [Markdown rules](/guides/markdown/),
[plugin before-hooks](/plugins/hooks/), edit locks and **History** work the same way.

The editor is adapted from [Instatic](https://github.com/corebunch/instatic) (MIT): the same page tree, editing
actions, component/layout model, panels and drop rules, built on Wuppy's file-based MDX content and Git saves.

## Opening it

- **Site** in the top bar opens the editor on the home page (`index` or `home` in Pages, else the first page). With no
  pages yet it asks you to create one in Content first.
- From a collection, pick an entry and choose **Edit with Visual**. The address is `/admin/v/<collection>/<slug>`.
- **Back** returns to the collection, **Open live page** opens the public page, and a link switches to the classic
  editor.
- While someone else edits the entry, the toolbar shows **… is editing** and saving is off (edit lock). Leaving with
  unsaved changes asks first.

## The screen

| Area | What it does |
| --- | --- |
| Toolbar | quick add **Container / Text / Image**, the **Add** grid, **Code** view, search (Ctrl/⌘+K), undo/redo, settings, open live page, classic editor, **Save** |
| Left rail | **Explorer** (Layers, Site, Code, Media), **Framework**, **Selectors** |
| Canvas | the page in iframes with the site's styles |
| Properties (right) | fields, classes, context and styles of the selected block |
| Notch (bottom) | **Design/Live** switch, zoom, fit |
| Breadcrumbs | the path from the page to the selected block; click a part to select it |

### Canvas

- **Design** shows the base (desktop) frame and every breakpoint side by side, for example Desktop 1440px, Tablet
  768px and Mobile 375px. The wheel pans, Ctrl/⌘ + wheel zooms, **Fit** shows all frames.
- **Live** shows one frame, as visitors see it.
- Click a block to select it. Double-click text to edit it in place: **Enter** commits a single-line block,
  Ctrl/⌘+Enter commits a multi-line one (Shift+Enter adds a line), **Escape** reverts.
- Drag blocks to reorder them: the top or bottom edge places before/after, the middle of a container places inside.
- The selected block has a small toolbar (drag handle, select parent, insert after, duplicate, delete) and a
  right-click menu with copy/cut/paste, duplicate, wrap, hide, lock, save as layout, componentize, detach and delete.
- Markdown blocks are shown rendered, as the site renders them (the server checks them like a save). Their source is
  edited in Properties.

- On a theme's live page, the theme's own markup can be edited too (dev server only). Click any element outside the
  blocks to pick it: Properties shows its tag and file, and edits its text, classes and inline style, moves it
  up/down, duplicates or deletes it, or opens the file in Code view. Double-click text-only elements to edit them in
  place. Changes are written to the theme's `.astro` file and the page reloads. Text or attributes made by code
  (`{...}`, items of a `.map()`) are edited in Code view; an element in a shared component such as `Footer.astro`
  changes on every page.
- A theme element has the same inspector as Instatic's: text, tag (`p`, `h2`, `section`…), every style group
  (Layout, Position, Size, Spacing, Typography, Background, Border, Effects, Interaction) and its HTML attributes. Its
  Layout, Position, Size, Spacing, Typography and Border groups use the same icon controls as a page block: Flex/Grid
  type, direction/distribute/align/wrap/gap, a T/R/B/L offset box, four-side padding/margin pickers, a four-corner
  radius picker, icon-labelled size fields and icon rows for Align, Decor and Capitalize. When the theme uses Tailwind
  4, styles are saved as classes: `align-self: center` becomes `self-center`, `320px` width `w-[320px]`, and properties
  without a utility an arbitrary property (`[filter:blur(4px)]`). Type Tailwind values (`4`, `full`, `red-500`) or CSS
  (`320px`, `#fff`). A breakpoint and a state write the class under `max-[768px]:` and `hover:`; classes under other
  variants are kept. A theme without Tailwind gets the styles as inline style. Empty
  fields show the browser's value. The panel uses the same **Styles / Attributes** tabs, class pills, section cards,
  right style rail and **Search styles** footer as a page block; its context controls live behind the rail's
  Context & state button for Tailwind themes.

### Explorer

- **Layers:** the page tree with search, an insert button, coloured HTML tag pills, module icons and expand/collapse
  arrows. Drag rows to move them (top edge: before, bottom edge: after, middle of a container: inside); a closed
  container opens while you hover over it. Double-click to rename. Right-click for Hide, Rename, Duplicate,
  Componentize, Save as layout, Copy, Cut, Paste, Wrap, Select parent, **Insert module here**, Lock and Delete.
- **Site:** pages of the Pages collection, **Templates** (saved layouts) and **Components**, with counts and empty
  states. Click a page to open it; drag a template onto the canvas or press its insert button.
- **Code:** a quick editor for the site stylesheet and the current page's Markdown source.
- **Media:** search, All/Images/Videos filters, list/grid view, thumbnails and upload. Drag a file onto the canvas or
  click it to use it.

### Add to canvas

**Add** (or **A**) opens the inserter. Its left rail has **Modules / Layouts / Components / Recent** with counts and a
preview of the highlighted item; the right pane has search, list/grid view, wireframe thumbnails and favourites (star).
**Paste HTML** turns pasted HTML into blocks; `className` from JSX is read as `class`. A new block goes after the
selected block, or inside it when it is a container.

| Category | Presets |
| --- | --- |
| Layout | Section, Container, Columns, Stack, Row, Card, Hero, Spacer |
| Basic | Heading, Text, Button, Link, List, Quote, Divider |
| Media | Image, Video |
| Advanced | Code, Markdown |

| Block | Writes | Fields |
| --- | --- | --- |
| Container | `<section>`, `<div>`, `<header>`, `<footer>`, `<main>`, `<article>`, `<aside>`, `<nav>` | element, classes |
| Heading | `<h1>`–`<h6>` | level, classes |
| Text | `<p>` | classes |
| Button, Link | `<a>` | link, classes |
| Image | `<img>` | image (upload or Media), alt text, classes |
| Video | `<video controls>` | `.mp4`/`.webm` URL, classes |
| List | `<ul>` / `<ol>` | items (one per line), numbered |
| Quote, Code, Divider | `<blockquote>`, `<pre><code>`, `<hr>` | classes |
| Component instance | the component's markup | its parameters, slot content |
| Markdown | free Markdown, kept exactly as written | source |
| Astro component | `<Callout data-ve="component" data-ve-name="Callout">`; the theme map renders it | component name |

### Properties

- **Styles / Attributes** tabs. Styles edits the block and its class; Attributes edits its text, tag and element fields.
- **Selector picker:** “Add or create selector…” with colored class pills and **Componentize** beside the input.
- **Section cards** with icons: Text, Layout, Position, Size, Spacing, Typography, Background, Border, Effects and
  Interaction. Layout has an icon Type switch (Flex/Grid), Direction, Distribute, Align, Wrap and Gap; Position has a
  T/R/B/L offset box plus Type and Z index; Spacing has padding/margin rows with a four-side picker; Size labels
  width/height/min/max fields with icons and has an icon box-sizing picker; Typography has icon rows for Align, Decor
  and Capitalize; Border has a four-corner radius picker. The picker's centre edits all sides or corners, an edge edits
  one, and linked sides save as one change.
- **Right style rail:** module icon plus one icon per style group. It stays at the panel edge, scrolls the matching
  section into view and marks groups that already have values.
- **Search styles in .class...** at the bottom filters the style rows. Context and state open from the rail when a
  breakpoint, condition or `:hover`-style override is needed.
- Inputs suggest framework tokens (`--v-*`); other CSS properties can be added under Other styles.
- **Componentize**, and for an instance its parameters, **Edit component** and **Detach**.

### Framework

Site-wide design tokens in the **Overview**, **Colors**, **Type** and **Space** tabs:

- class prefix, root font size, and the min/max viewport width of the fluid scales;
- colours with an optional dark value, up to 9 shades and 9 tints, transparent variants and utility classes;
- fluid **type** and **space** scales (min/max size and ratio, step names, base step), computed as in Instatic;
- font stacks with an optional `https` stylesheet link.

Each token becomes a CSS variable and, when its utilities are on, a utility class (`v-` prefix by default).

### Selectors

A shared library of selectors (`.card`, `h2`, `.hero > p`…). Open one to style every matching element on every page,
with the same context and state options as Properties. Class selectors are offered in the class picker.

### Settings

The base frame width, **breakpoints** (max-width, desktop first; up to 8) and **conditions** (`@media`, `@container`
or `@supports` queries; up to 20) for the context selector, and the list of shortcuts.

### Search (Ctrl/⌘+K)

Jump to any layer by name or run a command: Add, Undo, Redo, Paste, Live or Design mode, Fit canvas, open Framework,
Selectors or Explorer, and Settings.

## Code view

**Code** in the toolbar opens a full-width workspace:

- A searchable file tree at real paths. **site** holds the page (`content/pages/about.mdx` or `.md`), the site CSS
  (`.wuppy/data/visual/site.css`), components (`.wuppy/data/visual/components/*.json`) and `visual.json`. **New page**
  goes to the collection to create one.
- With a GitHub theme active, a second root **theme: owner/repo** lists its code (`.astro`, CSS, scripts, config) for
  admins. Content stays under **site**, so the theme's sample-content folders are not listed. A saved theme file shows
  at once under `pnpm dev`; in production press **Rebuild** in the status bar. Dependencies, build output, lockfiles
  and `.env` are never listed or written. See [Themes from GitHub](/guides/github-themes/).
- Tabs, a line-numbered editor with syntax colours, **Saved/Unsaved** status, and Ctrl/⌘+S to save.
- A preview with breakpoint and zoom controls, and a bottom **Styles/Computed** inspector for the selected block.
- Page source, site CSS and theme files are editable; component and `visual.json` files are read-only. Site saves use
  the same Git-backed content and visual-data APIs.
- Single-line HTML you type becomes visual blocks. Valid Tailwind utilities are compiled on save (the starter scans
  content with `@source`) and the preview reloads the CSS; an invalid class such as `text-red-10` produces no CSS.

## Components and layouts

- **Componentize** (layer menu or Properties) makes a component from the selected subtree. A component can have up to
  20 **parameters**: `{{name}}` in its text and attributes is replaced by each instance's value. A **Slot** inside it
  holds content each instance sets itself.
- **Edit component** changes the markup of all instances; **Detach** turns an instance back into normal blocks.
  **Update pages** in Explorer → Site writes the current markup into every page that uses the component.
- **Save as layout** stores the selected subtree with its styles; insert it from Add → Layouts or Explorer → Site.
- **Theme components:** when a GitHub theme is active, its `src/components/*.astro` files appear in Add → Components
  with an `ASTRO` badge. Selecting one inserts a real Astro component block into the page. Wuppy provides the
  components map to the theme's `<Content />` automatically, so no import line is written. The canvas shows the component's
  real output with the theme's styles (rendered without props by `/_wuppy/component/<Name>`, a page the Wuppy
  integration adds to the site), framed and labelled so it can be selected; scripts in it do not run on the canvas. A component that needs props it was not given (a table of contents without `headings`) does not break the page: the site leaves it out (an HTML comment, and the error in the server log) and the canvas says it needs props. A
  `.md` entry that gets a component is saved as `.mdx`, so its body must be valid MDX: a stray closing tag such as
  `</div>` is reported as `invalid MDX` with its line.

## Keyboard

| Keys | Action |
| --- | --- |
| Ctrl/⌘+S | save (also while typing) |
| Ctrl/⌘+K | search layers and commands |
| Ctrl/⌘+Z; Ctrl/⌘+Shift+Z or Ctrl/⌘+Y | undo; redo (100 steps, typing in one field is one step) |
| Ctrl/⌘+C / X / V | copy, cut, paste (after the selected block) |
| Ctrl/⌘+D | duplicate |
| Delete, Backspace | remove the selected block |
| Alt+↑ / Alt+↓ | move the selected block up or down |
| A | open Add |
| Ctrl/⌘+0; Ctrl/⌘++ / −; Shift+1 | zoom to 100%; zoom in/out; fit |
| Escape | close the menu, leave the selector being styled, then select the parent and deselect |

## What is saved

Each top-level block is saved as one line of HTML in the body, marked with `data-ve="…"`, for example:

```html
<section data-ve="container" style="padding: 32px 16px"><h2 data-ve="heading">Welcome</h2></section>
```

- Visual blocks are HTML-like JSX inside an `.mdx` entry, so existing MDX pages can be edited visually too. A `.md` page is promoted to `.mdx` when a component is inserted; plain Markdown entries stay `.md`.
- Anything the visual editor did not write (your Markdown, multi-line HTML, code blocks) becomes one **Markdown** block
  and is saved back unchanged.
- Text is stored as character references, so `*`, `{`, `<` and the like appear exactly as typed.
- Inline styles are filtered (no `;`/`{}`/`<>`/quotes/backslashes, `expression()`, `javascript:`; `url()` only https
  or site paths). Responsive and state styles travel in `data-ve-r`; the public site turns them into CSS.
- Hidden blocks are saved with `hidden`: they stay in the body but do not show. Locked blocks cannot be moved or
  deleted in the editor.
- Framework, selectors, components, layouts, breakpoints and the site stylesheet are saved to
  `.wuppy/data/visual.json`. Public pages get them from `/api/public/visual.css` plus a small generated `<style>` per
  page. Every save is a Git commit like other content.

## Limits

- Forms, scripts, dynamic loops/bindings, live co-editing (Wuppy uses edit locks) and an npm dependency panel are not
  part of this editor: Wuppy validates Markdown and stores plain files, so those need a separate security model.
- A Markdown block stays at the top level of the page (it cannot go inside a container) and is selected as a whole.
- Editing saved lines by hand is fine as long as each visual block stays on one line.
- On a local site the canvas loads the entry's live page and edits the body in place, inside the theme's own header,
  footer, styles and scripts (dark mode included). This works with any Astro theme that renders the entry with
  `<Content />`: the integration marks where it renders with `<!--wuppy:body-->` comments. Links and forms of the theme
  do not navigate on the canvas. Without a marked body (an unsaved or unpublished entry, a page not built from an entry,
  a remote site, editing a component) the canvas falls back to a blank frame with the site's stylesheet, fonts,
  `<html>`/`<body>` attributes and inline head scripts.
