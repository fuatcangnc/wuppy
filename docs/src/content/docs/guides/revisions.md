---
title: Revisions and history
description: See every change, compare versions and restore one.
sidebar:
  order: 3
---

Each save is a Git commit, so the history of an entry is its commit list.

- Open **History** in the editor to see who changed what and when.
- Compare any earlier version with the current one, field by field, with a line diff of the body.
- **Restore this version** brings the old content back as a new commit. Nothing is lost: the newer versions stay in
  the history.
- Admins can revert a whole commit from the site history (`git:revert` permission).

History is never pruned. Autosave copies are not revisions and do not appear here.
