---
title: MDX content
description: Write posts, pages, content types and sections in MDX, and the rules that keep it safe.
sidebar:
  order: 2.5
---

Posts, pages, your own content types and sections can all be written in [MDX](https://docs.astro.build/en/guides/integrations-guide/mdx/):
Markdown plus HTML and the components your site allows.

## Where MDX is used

- **Posts and pages** in the starter are MDX collections (`format: "mdx"` in `wuppy.config.mjs`). New entries are saved
  as `.mdx`. Existing `.md` files stay `.md` and keep working; the same collection can hold both.
- **Content types** you create in the admin are MDX by default. You can still pick Markdown.
- **Sections** store their body as MDX.
- **Widgets**: a _custom_ widget's body is MDX; an _HTML_ widget gets the raw-HTML checks below before it is saved (and
  is still sanitised when shown). Text widgets are shown as plain text.

## What authors may write

- Markdown, HTML elements and the components listed in `components` in `wuppy.config.mjs`:

  ```js
  export default { components: ["Callout", "YouTube"], collections: [/* … */] };
  ```

- Component props are plain values only: text, numbers, `true`/`false`, lists and objects written as JSON.
  `<Callout tone="info" items={["a", "b"]}>` is fine.

## What is refused

Saving is refused with the reason (HTTP 422, `DISALLOWED_CONTENT`) when a body contains:

- `import` or `export` lines.
- JavaScript expressions such as `{process.env.SECRET}` or `title={user.name}`. A comment, `{/* … */}`, is allowed.
- Components that are not in the allowed list, and member names such as `<a.b>`.
- Spread props (`{...props}`).
- Event handlers (`onclick`, `onError`…), Astro directives (`set:html`, `is:raw`, `client:*`), `dangerouslySetInnerHTML`
  and `srcdoc`.
- `script`, `style`, `iframe`, `object`, `embed`, `form`, `link`, `meta`, `base` and similar tags.
- `javascript:`, `vbscript:` and `data:` links. `data:` images (PNG, JPEG, GIF, WebP, AVIF) are allowed.
- MDX that does not parse. The error shows the line, so the site build never breaks on it.

Markdown (`.md`) bodies are checked for the same dangerous tags, attributes and links.

The body is checked with the same parser Astro uses. Code inside code blocks is text and is never checked.

## On the site

- The starter has `@astrojs/mdx` in `astro.config.mjs` and loads `**/*.{md,mdx}`. For an existing Astro project
  [`wuppy init`](/guides/existing-astro-project/) does the same: it adds `mdx()` and `@astrojs/mdx`, and widens
  `pattern: "**/*.md"` globs to `**/*.{md,mdx}`.
- Pass the allowed components when you render an entry: `<Content components={{ Callout }} />`.
- An MDX entry edited in the admin shows at once, without a rebuild. It is compiled with the site's Markdown settings:
  headings get the same ids and `headings` list as in the build, code blocks the same highlighting.
- Render a section (or custom widget) body with `mdxContent` from `wuppy/mdx`. It runs the same checks again before
  rendering and returns what `render()` does, `{ Content, headings }`:

  ```astro
  ---
  import { getSection } from "wuppy";
  import { mdxContent } from "wuppy/mdx";
  import Callout from "../components/Callout.astro";
  const section = await getSection("cta");
  const { Content: Body } = section ? await mdxContent(section.body) : {};
  ---
  {Body && <Body components={{ Callout }} />}
  ```
