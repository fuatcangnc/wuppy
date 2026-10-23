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
