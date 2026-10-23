---
title: Translations
description: Run the site in several languages.
sidebar:
  order: 10
---

List your languages in `wuppy.config`:

```js
locales: ["en", "tr"],
```

The first part of a slug is its language: `en/about` and `tr/about` are translations of each other.

- **Translations** shows a table of every entry and its languages. Missing translations and translations that are
  **out of date** (the source changed later) are marked.
- In the editor, **Translate to …** creates or opens the other language version.
- Menus, widgets and sections have a `locale`; bylines have translations.
- The public site gets a language switcher, a fallback to the default language and `hreflang` tags.
