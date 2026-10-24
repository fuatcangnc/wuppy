---
title: SEO and the public site
description: Meta tags, sitemap, feeds, search and the starter pages.
sidebar:
  order: 11
---

## SEO

- Every entry has an **SEO** panel: title, description, image, canonical URL and `noindex`, with a search and social
  share preview.
- **Settings → SEO** sets site-wide defaults and the title template.
- Pages get canonical, Open Graph, Twitter and `hreflang` tags, and JSON-LD helpers are available.
- `sitemap.xml` leaves drafts out; choose which collections it includes and their priority. `robots.txt` is created
  too.

## The starter site

The starter template includes:

- an RSS feed at `/rss.xml`,
- client-side search at `/search` over published posts,
- category, tag and author archive pages,
- pagination, reading time and related posts (`paginate`, `readingTime` and `related` from `wuppycms/site`),
- a 404 page with search,
- a skip link, visible focus styles and semantic headings.

Public pages are cached with ETags and the cache is cleared on every commit.
