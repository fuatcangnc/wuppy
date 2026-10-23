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

Links are checked: internal paths and `http(s)` URLs are fine, `javascript:` links are refused.

In a template:

```astro
---
import { getMenu } from "wuppy";
const menu = await getMenu("header", Astro.currentLocale);
---
```
