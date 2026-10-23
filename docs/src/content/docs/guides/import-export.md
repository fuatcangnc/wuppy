---
title: Import and export
description: Move content between sites and come over from WordPress.
sidebar:
  order: 15
---

## Wuppy backup

**Import** reads a Wuppy backup (JSON) and reports problems per entry. Export one from **Settings → Backups**.

## WordPress

Upload a WordPress export file (WXR). Wuppy first analyses it and shows counts, conflicts and missing fields, with a
preview. Then it imports:

- posts and pages,
- authors as bylines, categories and tags as taxonomies, and menus,
- media files (downloaded and renamed), with an error report,
- rewritten internal links, and redirects from the old URLs.

The import runs in stages with progress; you can pause, resume or roll it back.
