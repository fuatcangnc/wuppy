---
title: Hooks
description: The events a plugin can react to, and the checks it can run before a change is made.
sidebar:
  order: 2
---

A plugin lists its hooks in `manifest.json` (`"hooks": [...]`) and defines them in `plugin.js`. There are two kinds:

- **After-hooks** (`on…`) hear about a change once it is made. They run side by side, cannot change anything, and a
  failure is only logged. They are like WordPress actions.
- **Before-hooks** (`before…`) run before the change is made. They can refuse it, and some can change it. They are
  like WordPress filters, with stricter rules (see [Security rules](#security-rules)).

```js
globalThis.__plugin = {
  beforeContentSave: (event) => (event.data.summary ? undefined : { reject: "Add a summary first." }),
  onContentUpdated: async (event, ctx) => ctx.log(`${event.collection}/${event.slug} changed`),
};
```

## After-hooks

| Hook | When | Event |
| --- | --- | --- |
| `onContentUpdated` | An entry was created, saved or restored | `{ collection, slug, at }` |
| `onContentDeleted` | An entry was moved to the trash | `{ collection, slug, at }` |
| `onMediaUploaded` | A file was uploaded | `{ url, at }` |
| `onCommentCreated` | A visitor's comment was stored | `{ id, collection, slug, status, at }` |

An after-hook gets ids, not content. Use `ctx.content.get` (needs `content.read`) to load an entry.

## Before-hooks

| Hook | Runs before | Event | It may answer |
| --- | --- | --- | --- |
| `beforeContentSave` | An entry is created, saved or restored from the trash | `{ collection, slug, isNew, data, body }` | Nothing, `{ reject }`, or the changed `{ data, body }` |
| `beforeContentDelete` | An entry is moved to the trash | `{ collection, slug }` | Nothing or `{ reject }` |
| `beforeMediaUpload` | A file is stored (after Wuppy's own type and size checks) | `{ mime, size, replaces? }` | Nothing or `{ reject }` |
| `beforeCommentCreate` | A visitor's comment is stored | `{ collection, slug, author, body, status }` | Nothing, `{ reject }`, or `{ status: "pending" \| "spam" }` |

- **Nothing** (`undefined`) lets the change through unchanged.
- **`{ reject: "reason" }`** refuses it. The reason (1–500 characters) is shown as plain text to the person who tried,
  with the plugin's id (HTTP 422, `REJECTED_BY_PLUGIN`). A visitor whose comment is refused sees the reason too.
- The plugins run one at a time, in the order of `wuppy.config` and then the order they were installed. Each one
  sees what the previous one returned.

## Security rules

Before-hooks are powerful: they can block other people's work. So:

- **They need approval.** A before-hook is part of what the site owner approves. A plugin that adds one waits for a
  new approval. After-hooks do not change the approval.
- **They see only what the plugin may read.** `beforeContentSave` and `beforeContentDelete` only run for collections
  the plugin lists in `content.read` or `content.write`. Only plugins with `content.write` on that collection can
  change an entry; a read-only plugin can only refuse.
- **They fail closed.** If a plugin throws, times out, returns something it may not return, or gives an empty reason,
  the change is refused (HTTP 502, `PLUGIN_ERROR`). The error goes to the plugin's log in **Plugins**, not to the
  editor. To unblock saving, turn the plugin off there. The per-minute call limit does not refuse before-hooks, so a
  flood of visitor comments cannot stop editors from saving; the timeout still applies to every call.
- **A comment check never loses a comment.** If `beforeCommentCreate` fails, the comment is held for moderation.
- **They cannot widen access.** A plugin cannot publish or unpublish an entry: `draft` keeps the editor's value. A
  comment plugin can make a comment stricter (pending or spam), never approve it. A spam comment is not shown,
  triggers no notification email, and the visitor is told it is awaiting moderation.
- **What they change is checked like an editor's text.** After the plugins, the [Markdown rules](/guides/markdown/) and (when saving) the
  collection's schema run on the result, so a plugin cannot slip in a script.
- **They cannot save from inside.** `ctx.content.put` throws in a before-hook (it would run the hooks again). Return
  the changed entry instead.
- **They see no personal data.** `beforeCommentCreate` gets the name and text, never the email or IP address.

Not covered by before-hooks: emptying the trash for good and reverting a commit in **History**.

## Compared with WordPress and EmDash

Wuppy keeps the useful idea of both (actions and filters, or EmDash's `before`/`after` hooks) but leaves out the
hooks that would let a plugin read secrets or run code on visitors' pages:

- **Email hooks** (`email:beforeSend`, `email:deliver`): an email plugin would see password-reset and invitation
  links. Plugins can send their own email with the `email` capability.
- **Page hooks** (`page:fragments`, `page:metadata`): scripts in public pages belong in the site's theme, where they
  are reviewed in code. Wuppy writes SEO tags itself.
- **Priorities and `errorPolicy`**: the order is the order in `wuppy.config`, and a failing before-hook always
  refuses the change, so a validator cannot be skipped by making it fail.
- **Cron and lifecycle hooks**: not available yet.
