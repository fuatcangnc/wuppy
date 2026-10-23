---
title: Settings, themes and webhooks
description: Site identity, SEO defaults, email, media limits, security, backups, themes and webhooks.
sidebar:
  order: 14
---

Every settings change is a commit and an audit entry. Secrets are masked when settings are read back.

| Section | What you set |
| --- | --- |
| General | Site name, URL, logo, favicon, time zone, default language |
| SEO and social | Default title and description, share image, canonical, `noindex`, social accounts |
| Email | Provider (console, Resend or SMTP), sender, templates, a **Send test email** button |
| Media | Upload size limit and allowed file types (can only be stricter than the defaults) |
| Comments | Open or closed, moderation, notification address |
| Security | Session length, allowed invitation domains, two-factor policy |
| Backups | Manual backup, schedule, how many to keep, download |

## Email

- **console** prints emails to the server log (development).
- **Resend** needs `RESEND_API_KEY`.
- **SMTP** works with any provider (for example Amazon SES); the password comes from `SMTP_PASSWORD`.

The invitation, password reset and magic-link emails are templates with `{{variables}}` that you can edit here.

## Backups

A backup is a single file with your content and site data. Download it, or restore it on another site with
**Import**. Scheduled backups start after a restart.

## Themes

**Themes** lists the installed themes and activates one. The admin itself has light, dark and system modes and
colour presets.

## Webhooks

Webhooks call your URL after `content.updated`, `content.deleted`, `content.reverted` or `media.uploaded`.
The JSON body has the event type, collection, slug, commit and time. With a secret, each request carries
`X-Wuppy-Signature: sha256=<HMAC of the body>`. Deliveries are best-effort (no retries) and private network
addresses are refused.
