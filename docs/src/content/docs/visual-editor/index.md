---
title: Overview
description: Build a page by placing blocks on a live canvas and editing your theme's own markup, then save it as MDX like any entry.
sidebar:
  order: 1
---

The visual editor builds an entry's body by placing blocks on a canvas instead of writing Markdown/MDX. On a site
running a theme it also edits the theme's own markup (headers, heroes, footers) in place. It edits the same entry as
the classic editor and saves through the same API, so permissions, [Markdown rules](/guides/markdown/), plugins'
[before-hooks](/plugins/hooks/), edit locks and **History** all apply.

The editor has a page tree, editing operations, a component/layout model, panels and drop rules, on top of
WuppyCMS's file-based MDX content and Git commits.

## What it can do

| Area | Page |
| --- | --- |
| Design and Live canvas, devices, zoom, selecting, inline text editing, drag and drop | [Canvas and devices](/visual-editor/canvas/) |
| Editing a GitHub theme's own elements, saved to its `.astro` files as Tailwind classes | [Theme elements](/visual-editor/theme-elements/) |
| Layers tree, site pages, quick code, media library | [Explorer](/visual-editor/explorer/) |
| Ready-made blocks, layouts, components and pasted HTML | [Adding blocks](/visual-editor/adding-blocks/) |
| Styles, attributes, classes, colour picker, breakpoints and states | [Properties](/visual-editor/properties/) |
| Site-wide tokens, shared selectors, breakpoints and conditions | [Framework and selectors](/visual-editor/framework-selectors/) |
| Reusable components with parameters and slots, saved layouts, theme components | [Components and layouts](/visual-editor/components/) |
| Full code workspace for the page, site CSS and theme files | [Code view](/visual-editor/code-view/) |
| Change selected elements by describing the change | [AI](/visual-editor/ai/) |
| Shortcuts and the Ctrl/⌘+K search | [Keyboard and search](/visual-editor/keyboard/) |
| The saved format, safety rules and limits | [Saving and limits](/visual-editor/saving/) |

## Opening it

- **Site** in the top bar opens the editor on the home page (`index` or `home` in Pages, otherwise the first page). With
  no pages yet it asks you to create one in Content first.
- In a collection, open an entry and choose **Edit with Visual**. The address is `/admin/v/<collection>/<slug>`.
- A theme's `.astro` pages are listed in Pages as **Theme page** and open here too: their blocks render at the end of
  the page's `<main>`, and the theme's own markup is editable around them (see
  [GitHub themes](/guides/github-themes/#theme-pages)).
- **Page settings** in the top bar opens the same General, Access control, SEO, Open Graph, site search, schema and custom
  code panel as the classic editor.
- **Back** returns to the collection, **Open live page** opens the page on the site, and a link switches to the classic
  editor.
- While someone else edits the entry the toolbar shows **… is editing** and saving is off (edit lock). Leaving with
  unsaved changes asks first.

## The screen

| Area | What it does |
| --- | --- |
| Top bar | quick add **Container / Text / Image**, **Add** grid, **Code** view, search (Ctrl/⌘+K), undo/redo, **Page settings**, editor settings, live page, classic editor, **Save** |
| Left rail | **Explorer** (Layers, Site, Code, Media), **Framework**, **Selectors**, **AI** |
| Canvas | the page in iframes, with the site's own styles |
| Floating toolbar (top of the canvas) | favourite modules, **Add**, **Design/Live**, the device menu, zoom and fit |
| Properties (right) | the selected block's or theme element's fields, classes, context and styles |
| Breadcrumbs | the path from the page to the selection; click a part to select it |

## Who can use it

Anyone who can edit the entry can use the editor. Theme elements and theme files are written only for admins, since
they change the theme's code; the AI panel needs permission to write content and an AI provider on the server.
