---
title: Media library
description: Upload, organise, crop and optimise images and files.
sidebar:
  order: 4
---

## Uploading

Open **Media → Upload to library** and drop files, paste from the clipboard or pick them. Uploads start at once;
each row shows progress and can be cancelled or retried, and **Retry failed** retries the rest.

Uploads are checked on the server: the real file type is read from its content (a renamed file is refused), SVG is
refused, and the default size limit is 5 MB. Settings can tighten the size limit and the allowed types.

## The library

A three-panel view: the list with search and filters (folder, type, date, page), a large preview and the details.

- **Details**: alt text, caption, title, credit and the file URL.
- **Edit image**: a focal point and aspect-ratio presets for cropping.
- **Used in**: where the file is used. Deleting a file that is in use asks for confirmation.
- **Bulk edit** changes the fields of many files at once.
- **Replace** swaps the file in place with one of the same type; the old one stays in Git history.
- **Convert to WebP** converts in the browser and uploads the result as a new file.

Folders can be nested three levels deep, renamed, moved and deleted (their files are kept, without a folder).
A cleanup tool finds files nothing uses.

## Optimised images

When `sharp` is installed, Wuppy serves resized WebP, AVIF, JPEG or PNG variants at allowed widths
(`?w=800&format=webp`), caches them on disk with long-lived URLs and stores a small placeholder and the image size
at upload. In templates, `imageSrcset()` from `wuppycms/site` builds the `srcset` for you.
