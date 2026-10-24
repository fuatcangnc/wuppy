---
title: Code view
description: A full-width code workspace for the page source, the site CSS, components and the active theme's files.
sidebar:
  order: 9
---

**Code** in the top bar opens a full-width workspace.

## Files

- A searchable file tree with real paths. **site** holds the page (`content/pages/about.md`), the site CSS
  (`.wuppy/data/visual/site.css`), components (`.wuppy/data/visual/components/*.json`) and `visual.json`. **New page**
  goes to the collection to create one.
- With a GitHub theme active, a second root **theme: owner/repo** shows admins the theme's code (`.astro`, CSS, scripts,
  config). Content stays under **site**, so the theme's sample content folders are not listed. Dependencies, build
  output, lockfiles and `.env` are never listed or writable. See [Themes from GitHub](/guides/github-themes/).
- The page source (`.mdx` or `.md`), site CSS and theme files are editable; component and `visual.json` files are
  read-only.

## Editing

- Tabs, an editor with line numbers and highlighting, **Saved/Unsaved** state, and Ctrl/⌘+S to save.
- Site saves use the same Git-backed content and visual data APIs as the canvas.
- A saved theme file shows at once under `pnpm dev`; in production press **Rebuild** in the status bar.
- Single-line HTML you write becomes visual blocks. Valid Tailwind utilities are compiled on save (the starter scans
  content with `@source`) and the preview reloads its CSS; an invalid class such as `text-red-10` produces no CSS.

## Preview

A preview with the device menu and zoom, and a **Styles/Computed** panel at the bottom for the selected block.
