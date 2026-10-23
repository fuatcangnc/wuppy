---
title: Categories, tags and bylines
description: Group content and credit the people who made it.
sidebar:
  order: 8
---

## Taxonomies

A taxonomy has a name, a slug, the collections it applies to, and is either **hierarchical** (like categories) or
**flat** (like tags).

- Categories form a tree with parents and ordering.
- Tags can be renamed and merged.
- Each term has a slug, a description and a count of entries.

The starter has archive pages for categories and tags; use `getTaxonomy()` from `wuppy` in your own templates.

## Bylines

A byline is a public author profile: name, slug, avatar, bio, social links and a private email. It is separate from
user accounts, so guest writers and photographers can be credited too.

- Assign one or more bylines to an entry, each with a credit role (author, editor, photographer…).
- **Byline schema** adds your own profile fields (text, image, URL, social) with order and required flags.
- Bylines can be translated.
- The starter shows author pages at `/authors/[slug]`; use `getByline()` in templates.
