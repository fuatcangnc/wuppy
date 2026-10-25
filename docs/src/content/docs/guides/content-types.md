---
title: Content types
description: Create and change collections and their fields from the admin.
sidebar:
  order: 9
---

**Content Types** lists every collection. Create a new one, or open one to edit its fields.

- Pick a type for each field, mark it required, give a default and help text, and reorder fields.
- See the schema as a preview, and the generated TypeScript types.
- Before you save, Wuppy checks existing content against the new schema and warns you when a field you remove still
  has data.

The available field types are listed in [Configuration](/concepts/configuration/#field-types).

Entries of every content type are [MDX or Markdown](/guides/markdown/) files, chosen by the collection's `format`.

## Built-in Pages and Posts

Every site has a Pages and a Posts collection, as in WordPress. When `wuppy.config` has no collection of that kind,
Wuppy adds one (`content/pages` at `/{slug}`, `content/posts` at `/posts/{slug}`). The list marks each type
**Config** (from `wuppy.config`, or built in) or **Dashboard** (made here). Saving a Config type keeps an edited copy in
`.wuppy/data/content-types.json` that replaces it; deleting that copy brings the config's version back.

A new type gets its own folder and URL from its name (`content/projects`, `/projects/{slug}`). Two types cannot share a
folder, or one would list the other's entries. A saved type applies at once, with no restart.

## On the site and in the visual editor

An entry of a type the theme has no page for opens at its route in the theme's home page layout: the header and footer
stay, and the entry's body goes inside `<main>`. So **Edit with Visual** in the entry editor shows it, and blocks can be added as on a
page. A theme that has its own page for the route (a `src/pages/projects/[slug].astro`) renders it instead.

## Relations

A relation says how entries of two content types link, like EmDash's. Open a type and choose **New relation**:

- **Links to**: the other content type.
- **Linking side** and **Linked side**: what each side is called.
- **Slug**: the field that holds the links on the linking entries (`posts_authors`).
- **How many**: whether each linking entry links to one or any number of entries, and whether each linked entry may be
  linked from one or any number.

The linking entries get a field of that name to pick the linked entries; it stores their slugs in the frontmatter
(`posts_authors: [ada, linus]`). The linked entry's editor shows **Linked from**, the entries that link to it; change a
link on the linking entry. When each linked entry may be linked from only one, a second link to it is refused on save.

A theme reads the links from the frontmatter: `entry.data.posts_authors` holds the slugs, and `getEntry("authors", slug)`
gives each entry. Deleting a relation leaves the stored links in the files.
