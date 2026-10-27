---
title: Configuration
description: Collections, fields, languages and site options in wuppy.config.
sidebar:
  order: 2
---

The site is described in `wuppy.config.mjs` (or `.ts`) at the project root.

```js
export default {
	site: { url: "https://example.com", name: "Example" },
	locales: ["en", "tr"], // the first part of a slug is its language: en/hello, tr/hello
	collections: [
		{
			name: "posts",
			dir: "content/posts",
			format: "mdx",
			route: "/blog/{slug}",
			fields: { title: "string", date: "date", draft: "boolean", publishAt: "date", tags: "list", cover: "image" },
		},
	],
	redirects: [{ from: "/old", to: "/new" }],
	webhooks: [{ url: "https://ci.example.com/hook", secret: "…", events: ["content.updated"] }],
	plugins: [{ dir: "plugins/search", approve: "<output of wuppycms plugin hash>" }],
};
```

## Field types

| Type | Edited as |
| --- | --- |
| `string`, `text` | single line, multi line |
| `number`, `boolean`, `date` | number, switch, date picker |
| `image` | media picker with upload |
| `list` | list of strings (for example tags) |
| `select` | one value from a fixed list |
| `reference` | link to another entry, a taxonomy term or a byline |
| `richText` | Markdown editor |
| `repeater`, `blocks`, `json` | structured JSON (repeater supports a sub-schema and min/max) |

Fields can be required, have a default and help text, and can be shown only when another field has a value
(for example hide `publishAt` while `draft` is on).

Collections can also be created and edited in the admin under **Custom Fields**; see
[Custom Fields](/guides/content-types/).

## Posts and Pages

The admin's **Posts** and **Pages** sections show the collections named `posts` and `pages`. A theme that names
them differently sets `kind` instead, and keeps its own name (Astro reads the collection by that name):

```js
collections: [
	{ name: "blog", dir: "src/content/blog", kind: "posts", route: "/{slug}", fields: { title: "string", pubDate: "date" } },
	{ name: "about", dir: "src/content/about", kind: "pages", fields: { title: "string" } },
],
```

`wuppycms init` sets `kind` for you: the first collection with a date field becomes Posts, the first without one becomes
Pages. Other collections are listed under their own name. In a GitHub theme, `kind` and `map` link the theme to the
site's content; see [Themes from GitHub](/guides/github-themes/#where-content-lives).

## Content is MDX or Markdown

Each collection has a `format`: `"mdx"` (new entries are `.mdx`, components allowed) or `"md"` (`.md`, Markdown only).
Existing `.md` and `.mdx` files can live side by side; a `.md` entry is promoted to `.mdx` when a component is inserted.
The `components` list allows extra Astro component names in MDX. The active theme's `src/components/*.astro` files are
allowed automatically. Scripts, imports, expressions and unlisted components are rejected on save, so editors cannot
run code on your site. See [MDX content](/guides/markdown/).

## Types for your templates

```sh
pnpm wuppycms types
```

writes `wuppy-env.d.ts` with a TypeScript type for each collection.
