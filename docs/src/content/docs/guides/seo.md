---
title: SEO and the public site
description: Meta tags, sitemap, feeds, search and the starter pages.
sidebar:
  order: 11
---

## SEO

- Every entry has a **Page settings** panel with **General**, **Access control**, **SEO settings**, **Open Graph settings**,
  **Site search settings**, **Schema markup** and **Custom code** sections.
- **Access control** marks a page as public or a draft; drafts open only through a signed preview link.
- **SEO settings** has the title tag, meta description, canonical URL and a **Sitemap indexing** switch, with a search
  result preview.
- **Open Graph settings** controls the share title, description and image. Each has a “same as SEO” option so it follows
  the SEO values until you override it.
- **Site search settings** can exclude a page and give it its own search title, description and image.
- **Schema markup** stores JSON-LD for the page; **Generate schema markup** starts from the page title, description,
  image and canonical URL. **Custom code** adds page-only head and body code (paste only trusted code).
- **Settings → SEO** sets site-wide defaults and the title template.
- Wuppy adds canonical, Open Graph, Twitter and `hreflang` tags to theme pages automatically; JSON-LD is rendered from the page schema.
- `sitemap.xml` leaves drafts and pages with sitemap indexing off out; choose which collections it includes and their
  priority. `robots.txt` is created too.

## The starter site

The starter template includes:

- an RSS feed at `/rss.xml`,
- client-side search at `/search` over published posts and pages, honoring their site search settings,
- category, tag and author archive pages,
- pagination, reading time and related posts (`paginate`, `readingTime` and `related` from `wuppycms/site`),
- a 404 page with search,
- a skip link, visible focus styles and semantic headings.

Public pages are cached with ETags and the cache is cleared on every commit.
