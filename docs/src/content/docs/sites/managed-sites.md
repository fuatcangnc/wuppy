---
title: Managed sites
description: Manage many Wuppy sites from one hub, and give each client access to their own site only.
sidebar:
  order: 1
---

Your own Wuppy installation can act as a **hub**. Other Wuppy sites (for example one per client) connect to it, and
you manage all of them from the hub's admin. Each site keeps its own server, content and Git history; the hub only
talks to its API.

## Connect a site

1. On the **client site**: **Users → API tokens → Connect to a hub**. This creates a *hub token* with an expiry
   date (at most 365 days). Risky permissions (`users:manage`, `site:transfer`, `plugins:manage`) are off unless you
   turn them on.
2. On the **hub**: **Sites → Add site**, enter the site's `https://` address and paste the token.

The hub checks the address, calls the site once to confirm the token and stores the token encrypted
(AES-256-GCM, key derived from `WUPPY_SECRET`). The token is never shown again, only its last four characters.

## Work on a site

Use the **site switcher** at the top of the sidebar to switch to a site. The admin then works on that site: pages,
posts, media, settings and the rest, as if you had signed in there. A band shows which site you are managing.

Behind the scenes every request goes through the hub's proxy:

- Only API paths are forwarded; sign-in, tokens, users, invitations and the hub's own routes are blocked.
- Cookies and your hub credentials are never sent; the hub adds its own token and tells the site **who** is acting
  and **with which role**. The site writes that person's email to its audit log.
- Private network addresses are refused, redirects are not followed, and requests have time and size limits.

## Sites page

**Sites** lists every connected site with its status. For each site you can:

- **Manage this site** (switch to it), **Check** the connection, **Replace token** or **Disconnect**,
- edit **members**,
- write an **agency playbook** and a **client brief** for the [AI assistant](/ai/assistant/),
- run a **security scan**, open the **client report** and choose who receives it monthly
  (see [Site care](/ai/site-care/)).

When a token expires or is revoked the site shows **Connection error**; replace the token to fix it. If the hub's
`WUPPY_SECRET` changes, stored tokens can no longer be read and each site asks to be reconnected.

## Clients

Give a client access to their site only:

1. Open the site's **Members** and pick a hub user, or invite someone by email.
2. Choose their role on that site: `editor`, `author` or `viewer`.

Invited clients get the `client` role on the hub. They see only the sites they are members of (no local site),
start on their first site and can never reach another client's site; the hub filters this on the server.
