---
title: Saving and limits
description: How visual blocks are stored in MDX, what is filtered, where site-wide data lives, and what the editor does not do.
sidebar:
  order: 12
---

## What is saved

Each top-level block is saved as one line of HTML marked with `data-ve="…"` in the body, for example:

```html
<section data-ve="container" style="padding: 32px 16px"><h2 data-ve="heading">Welcome</h2></section>
```

- Visual blocks are HTML-like JSX inside the `.mdx` entry; existing MDX pages can be edited visually too. A `.md` page
  is upgraded to `.mdx` when a component is added; plain Markdown entries stay `.md`.
- Anything the editor did not write (Markdown, multi-line HTML, code blocks) becomes one **Markdown** block and is
  written back unchanged.
- Text is stored with character references, so characters such as `*`, `{` and `<` display as typed.
- Inline styles are filtered (no `;`/`{}`/`<>`/quotes/backslashes, `expression()` or `javascript:`; `url()` only https
  or site paths). Responsive and state styles travel in `data-ve-r`; the site turns them into CSS.
- Hidden blocks are saved with `hidden`: they stay in the body but do not show. Locked blocks cannot be moved or
  deleted in the editor.
- The framework, selectors, components, layouts, breakpoints and site stylesheet are saved to
  `.wuppy/data/visual.json`. Site pages get them from `/api/public/visual.css` plus a small per-page `<style>`.
- Theme element edits go to the theme's `.astro` files (see [Theme elements](/visual-editor/theme-elements/)). With a
  connected GitHub theme they are committed and pushed automatically.
- Every content save is a Git commit like any other content, shown in **History**.

## Limits

- Forms, scripts, dynamic loops/bindings, live co-editing (Wuppy uses edit locks) and an npm dependency panel are not
  part of this editor: Wuppy validates Markdown and stores plain files, and those need a separate security model.
- A Markdown block stays at the page's top level (it cannot go inside a container) and is selected as a whole.
- Editing saved lines by hand is fine as long as each visual block stays on one line.
- Theme element editing needs the dev server, Astro 7.4+ and the dev toolbar; see
  [Theme elements](/visual-editor/theme-elements/#requirements).
