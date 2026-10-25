---
title: Menus
description: Build navigation menus and place them in your theme.
sidebar:
  order: 6
---

**Menus** builds navigation for the header, footer, sidebar or other locations.

- Add items from **Pages**, **Posts**, **Categories** or **Custom links**.
- Drag items to reorder them, nest them to make sub-menus, or use the keyboard controls.
- Create, rename and delete menus; assign them to locations under **Manage locations**.
- Each language can have its own variant of a menu.
- A link can have a short **description**. Themes that support it show it under the label, for example in a dropdown.

Links are checked: internal paths and `http(s)` URLs are fine, `javascript:` links are refused.

In a template:

```astro
---
import { getMenu } from "wuppycms";
const menu = await getMenu("header", Astro.currentLocale);
---
```

`menu.items` holds `label`, `href`, an optional `description` and `children` (one level deep).

## Menus in a GitHub theme

A [GitHub theme](/guides/github-themes/) is built ahead, so its pages hold the menu from the last build. Saving a menu (or the settings, sections or widgets) builds the theme again about a minute and a half later, and the change then goes live by itself.

A theme that should also build on its own, outside Wuppy, can read the menu file directly instead of importing `wuppycms`: Wuppy builds it with the site folder in `WUPPY_BASE_ROOT`, and the menus are in `.wuppy/data/menus.json` there. When the file is missing, fall back to the theme's own links.
