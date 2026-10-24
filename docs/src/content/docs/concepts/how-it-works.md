---
title: How Wuppy works
description: Files, Git commits and a Node.js server behind one admin panel.
sidebar:
  order: 1
---

## Content is files

Every entry is a Markdown (`.md`) file with YAML frontmatter, for example `content/posts/en/hello.md`.
Fields that Wuppy does not know about are kept as they are. Astro reads the same files through its Content
Collections (`glob` loader), so your templates use the normal Astro APIs.

Other site data (menus, widgets, sections, taxonomies, bylines, settings, redirects) is stored as JSON under
`.wuppy/data` and is committed the same way.

## Every save is a commit

Saving content, uploading media or changing settings creates a Git commit with the signed-in user as the author.
That gives you:

- a full history per entry, with line and field diffs,
- one-click restore of any earlier version,
- no lock-in: the repository is the backup.

Autosave is different: when you pause typing it keeps a recovery copy under `.wuppy/autosave/` and never creates a commit.

## Runs on Node.js

Wuppy is an Astro integration plus a [Hono](https://hono.dev) API. It runs as a normal Node.js server (for example
in Docker). Users, sessions and comments are stored in SQLite (`node:sqlite`) inside `.wuppy/`.

## Packages

| Package | Role |
| --- | --- |
| `wuppycms` | Content engine, REST API, Astro integration, media, SEO, redirects, webhooks, plugin sandbox, AI and managed sites |
| `@wuppycms/admin` | The React admin panel at `/admin` |
| `@wuppycms/auth` | Sign-in (Better Auth), roles and permissions |
| `@wuppycms/git` | Commits, history, diffs and reverts |
| `@wuppycms/plugin-types` | Plugin manifest and capability checks |
| `create-wuppycms` | `npm create wuppycms` |
