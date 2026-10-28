---
title: Writing and publishing
description: Pages, posts and other collections, the editor, scheduling, previews and the trash.
sidebar:
  order: 2
---

Every collection (Pages, Posts and your own) has the same screens.

## The list

The list has two layouts: **split** (list on the left, preview and details on the right) and **table**.

- Search by title and body, filter by status (All, Published, Drafts), author, language and date, and sort.
- Row actions: edit, view on site, duplicate, move to trash.
- Select several entries to publish, unpublish or delete them at once.
- The footer shows "Showing x–y of n", a per-page selector and page numbers.

## The editor

- Fields come from the collection's schema; the body uses a Markdown/MDX editor that keeps raw HTML and allowed components intact.
- The **slug** is created from the title while you type, with Turkish characters and accents normalised.
  Edit the slug yourself and it stops following the title. A slug that already exists is refused.
- Insert images (Wuppy asks for alt text) and the content components your site allows.
- The side panel shows status, date, author, language, taxonomies and **Page settings**: General, Access control, SEO,
  Open Graph, site search, schema markup and custom code.

### Saving, publishing and scheduling

- **Save** writes the file and makes a commit.
- **Publish** / **Unpublish** is a separate button. Authors can save drafts but not publish.
- **Publish at** schedules an entry. Clear the date to cancel the schedule.
- **Access control** in Page settings switches a page between public and draft. Drafts open only through a signed
  preview link; page-level password protection is not available in this release.

### Safety nets

- Leaving with unsaved changes asks first, both for links inside the admin and for closing the tab.
- Autosave keeps a recovery copy while you type; reopen the entry to restore it.
- If someone else is editing the same entry you see a warning and saving is disabled. **Edit anyway** takes over.
- If the file changed on the server since you opened it, you choose **Keep mine** or **Use theirs**.

## Previews

- **View on site** opens the published page.
- A **preview link** shows a draft to anyone with the link, without signing in. It is signed, works for 24 hours,
  covers one entry only and is marked `noindex`.

## Trash

Deleting moves an entry to **Trash**. From there you can restore it or delete it for good (with a confirmation).
