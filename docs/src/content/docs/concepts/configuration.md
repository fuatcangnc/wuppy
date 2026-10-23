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
	components: ["Callout"], // components allowed inside content
	collections: [
		{
			name: "posts",
			dir: "content/posts",
			route: "/blog/{slug}",
			fields: { title: "string", date: "date", draft: "boolean", publishAt: "date", tags: "list", cover: "image" },
		},
	],
	redirects: [{ from: "/old", to: "/new" }],
	webhooks: [{ url: "https://ci.example.com/hook", secret: "…", events: ["content.updated"] }],
	plugins: [{ dir: "plugins/search", approve: "<output of wuppy plugin hash>" }],
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

Collections can also be created and edited in the admin under **Content Types**; see
[Content types](/guides/content-types/).

## Content components

Only components listed in `components` may appear inside content. Other JSX, imports and scripts are rejected on
save, so editors cannot run code on your site.

## Types for your templates

```sh
pnpm wuppy types
```

writes `wuppy-env.d.ts` with a TypeScript type for each collection.
