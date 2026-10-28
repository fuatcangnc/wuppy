---
title: SEO and the public site
description: Meta tags, sitemap, feeds, search and the starter pages.
sidebar:
  order: 11
---

## SEO

- Every entry has a **Page settings** panel with **General**, **Access control**, **SEO settings**, **Open Graph settings**,
  **Site search settings**, **Schema markup** and **Custom code** sections.
- **SEO settings** has the title tag, meta description, canonical URL and a **Sitemap indexing** switch, with a search
  result preview.
- **Open Graph settings** controls the share title, description and image. Each has a “same as SEO” option so it follows
  the SEO values until you override it.
- **Site search settings** can exclude a page and give it its own search title, description and image.
- **Schema markup** stores JSON-LD for the page; **Generate schema markup** starts from the page title, description,
  image and canonical URL. **Custom code** adds page-only head and body code (paste only trusted code).
- **Access control** marks a page public or a draft. Drafts open only through a signed preview link. Page-level
  password protection is not part of this release.
- **Settings → SEO** sets site-wide defaults and the title template.
- `sitemap.xml` leaves drafts and pages with sitemap indexing off out; choose which collections it includes and their
  priority. `robots.txt` is created too.

### Where Open Graph values come from

Wuppy writes the tags when it serves the page; a theme does not need its own `og:` boilerplate. The value for each tag
is chosen in this order:

| Tag | First choice | Fallback | Last fallback |
| --- | --- | --- | --- |
| `og:title` | Page settings → Open Graph title | SEO title | Page title, then the theme's existing `<title>` |
| `og:description` | Page settings → Open Graph description | SEO description | The page's existing meta description |
| `og:image` | Page settings → Open Graph image | Page cover image | **Settings → SEO → default share image** |
| `og:url` | Page settings → Canonical URL | The current public URL | — |

A relative image such as `/uploads/2026/10/photo.png` is made absolute with the site URL, so the tag contains
`https://your-site.com/uploads/2026/10/photo.png`. Wuppy adds `og:site_name`, `og:type`, `og:url` and the matching
Twitter card tags too. If a theme already has a tag, the page setting replaces it; otherwise Wuppy adds it to `<head>`.

To change the image, open **Pages → the page → Page settings → Open Graph settings → Choose image** and save. The same
image is available as the page's share image and as the fallback for its site-search image. Social networks cache old
cards: after changing an image, re-scrape the page with the network's sharing debugger.

### Schema, custom code and site search

- **Generate schema markup** creates a starting JSON-LD object from the page title, description, image and canonical URL.
  It is not sent to the AI; review the generated object before publishing. Valid JSON is rendered in `<head>`; invalid
  JSON is rejected by the editor.
- **Custom code** is raw head and body code for that page only. It runs on the published page, so paste only code you
  trust.
- **Site search settings** control the search index: exclude a page, or override its search title, description and image.
  The starter theme's public `/search` page and the admin search use these values.

## The starter site

The starter template includes:

- an RSS feed at `/rss.xml`,
- client-side search at `/search` over published posts and pages, honoring their site search settings,
- category, tag and author archive pages,
- pagination, reading time and related posts (`paginate`, `readingTime` and `related` from `wuppycms/site`),
- a 404 page with search,
- a skip link, visible focus styles and semantic headings.

Public pages are cached with ETags and the cache is cleared on every commit.
