---
title: Roles and permissions
description: What each role can do, and how API tokens and managed sites use the same rules.
sidebar:
  order: 3
---

Every API route requires exactly one permission. Roles are fixed sets of permissions.

| Permission | admin | editor | author | viewer |
| --- | :-: | :-: | :-: | :-: |
| `content:read` | ✓ | ✓ | ✓ | ✓ |
| `content:write` | ✓ | ✓ | ✓ | |
| `content:delete`, `content:publish`, `content:schedule` | ✓ | ✓ | | |
| `media:write` | ✓ | ✓ | ✓ | |
| `media:delete` | ✓ | ✓ | | |
| `comments:read` | ✓ | ✓ | ✓ | |
| `comments:moderate` | ✓ | ✓ | | |
| `menus`, `widgets`, `sections`, `taxonomies`, `bylines`, `content-types`, `themes` (`:manage`) | ✓ | ✓ | | |
| `git:read` | ✓ | ✓ | ✓ | |
| `import:run` | ✓ | ✓ | | |
| `git:revert`, `audit:read`, `plugins:manage`, `users:manage`, `site:settings`, `site:transfer`, `sites:manage` | ✓ | | | |

The fifth role, **client**, has no permissions on the hub itself. A client only sees the
[managed sites](/sites/managed-sites/) they are a member of, with the role given to them on each site.

## Rules worth knowing

- The first account is the owner (admin). After that, accounts are created only by invitation.
- The last active admin cannot be demoted, disabled or deleted.
- An API token never has more rights than its owner has **now**: if the owner's role is lowered, the token loses
  the same rights.
- Authors can write drafts but cannot publish, schedule or delete.
