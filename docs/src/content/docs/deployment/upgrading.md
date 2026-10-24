---
title: Upgrading and rolling back
description: Move a site to a newer Wuppy release and undo it if needed.
sidebar:
  order: 20
---

Content, settings and revisions are files in your Git repository, so an upgrade is reversible by design.

## Upgrade

1. Commit or stash your work (`git status` must be clean).
2. Update the packages: `pnpm up wuppycms`.
3. Run `pnpm wuppycms upgrade`. It applies the data migrations between the version recorded in `.wuppy/version.json`
   and the installed one, then records the new version. Most releases need no data change.
4. Run `pnpm wuppycms types` to refresh `wuppy-env.d.ts`, then `pnpm wuppycms doctor`.

Read the release notes (`CHANGELOG.md`) first; breaking changes are listed there.

## Roll back

- Data changes made by the upgrade: `git checkout . && git clean -fd .wuppy/data`.
- The packages: `pnpm add wuppycms@<previous version>`.
- `wuppycms upgrade` refuses to run when the installed version is older than the data, so an accidental downgrade
  cannot silently corrupt files. Restore from Git or a backup (Settings -> Backups) instead.
