---
title: Widgets and sections
description: Reusable blocks for sidebars, footers and pages.
sidebar:
  order: 7
---

## Widgets

A widget area (for example "sidebar" or "footer") holds an ordered list of widgets:

- text, HTML (sanitised), a menu, recent content, a taxonomy list, or custom Markdown.

Each widget can be limited to a language, a collection or paths such as `/blog/*`. Read an area in a template with
`getWidgetArea(name)` from `wuppycms`.

## Sections

A section is a reusable block of content with a name and slug, for example a call-to-action or a pricing table.
Create, edit, duplicate and delete sections, reference them from pages in any order, and see which pages use
each section. Sections can have language variants.

The body is [MDX](/guides/markdown/), checked when you save; render it with `mdxContent` from `wuppycms/mdx` (or `markdownContent` for Markdown-only sections).
