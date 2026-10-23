---
title: Environment variables
description: Every setting Wuppy reads from the environment.
---

| Variable | Required | Meaning |
| --- | --- | --- |
| `WUPPY_SECRET` | yes | 32+ random characters. Signs sessions and preview links and encrypts managed-site tokens. Keep it stable. |
| `WUPPY_URL` | in production | The public origin, for example `https://example.com`. Sign-in only accepts requests from it. |
| `WUPPY_TRUSTED_PROXIES` | behind a proxy | Comma-separated IPs/CIDRs of your reverse proxy, so rate limits use the real client IP. |
| `WUPPY_SESSION_DAYS` | no | Session length in days (default 7). |
| `WUPPY_SESSION_UPDATE_HOURS` | no | How often a session is renewed (default 24). |
| `WUPPY_PASSKEY_RP_ID`, `WUPPY_PASSKEY_ORIGIN` | no | Override the passkey domain and origin. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | no | Sign in with GitHub. Register `<WUPPY_URL>/api/auth/callback/github`. |
| `WUPPY_GITHUB_CLIENT_SECRET`, `WUPPY_GITHUB_CLIENT_ID` | no | The GitHub OAuth app for [Themes from GitHub](/guides/github-themes/); callback `<WUPPY_URL>/api/themes/github/callback`. The id defaults to Wuppy's app. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_HOSTED_DOMAIN` | no | Google sign-in, optionally limited to one Workspace domain. |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` | no | Microsoft sign-in (tenant defaults to `common`). |
| `RESEND_API_KEY` | no | Email through Resend. |
| `SMTP_PASSWORD` | no | Password for the SMTP email provider. |
| `WUPPY_AI_BASE_URL`, `WUPPY_AI_API_KEY`, `WUPPY_AI_MODELS` | no | Turns on the [AI assistant](/ai/assistant/). |
| `WUPPY_PLUGIN_<ID>_<NAME>` | no | Secrets for plugins that declare them. |
| `WUPPY_ALLOW_PRIVATE_URLS` | no | `1` allows private addresses for webhooks and managed sites. For local testing only. |

OAuth credentials must be set in pairs; a half-set pair stops the server from starting.
