---
title: Users and security
description: Invitations, roles, two-factor sign-in, passkeys, sessions and API tokens.
sidebar:
  order: 13
---

## Users

**Users** lists accounts with their role. Admins can change roles, disable or delete accounts, set a temporary
password and reset two-factor sign-in. The last active admin is protected.

### Invitations

There is no public sign-up after the owner account. Invite people by email: the link works once and expires after
7 days. Pending invitations can be resent or cancelled. **Settings → Security → Allowed domains** limits invitations
to certain email domains.

## Signing in

| Method | Notes |
| --- | --- |
| Password + authenticator code | Once two-factor (TOTP) is on, a password alone is not enough. Backup codes are provided. |
| Passkey | Add passkeys under **Account security**. Needs `localhost` or a real domain. |
| GitHub, Google, Microsoft | Only for an existing account that linked the provider in **Account security**. Never creates new accounts. |
| Magic link (email) | Never creates accounts and is not sent to accounts with two-factor on. |

Forgot your password? The reset link is valid for 30 minutes and signs out every session.
Sign-in attempts are limited to 5 per minute per client.

## Account security

Each user can change their password, turn on two-factor sign-in, manage passkeys and linked accounts, and see
their sessions. Sign out one device or all of them. Admins can sign out another user's sessions.

Session length is set with `WUPPY_SESSION_DAYS` (default 7) and renewed every `WUPPY_SESSION_UPDATE_HOURS` (default
24).

## API tokens

Create tokens under **Users → API tokens** for scripts, CI and the [MCP server](/ai/api-mcp/). Choose the
permissions and an expiry date; revoke a token at any time. A token never has more rights than its owner has now.
Send it as `Authorization: Bearer wuppy_…`.

## Audit log

Sign-ins, user changes, token changes, settings changes and managed-site actions are recorded in the audit log
(`audit:read` permission).
