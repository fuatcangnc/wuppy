# @wuppycms/plugin-types

## 0.3.0

No changes in this release.

## 0.2.4

No changes in this release.

## 0.2.3

No changes in this release.

## 0.2.2

### Patch Changes

- Every package has a README, description, keywords and links on npm.

## 0.2.1

No changes in this release.

## 0.2.0

### Minor Changes

- Packages are published as WuppyCMS: `wuppycms` (import `wuppycms/astro`, integration `wuppycms()`, CLI `wuppycms`), `npm create wuppycms`, the `@wuppycms/*` scope and the `wuppycms-plugin` CLI. The create-wuppy template now ships only the starter files tracked in Git.

## 0.1.0

### Minor Changes

- 3c848cd: Plugin before-hooks, security first: `beforeContentSave` (refuse, or change with `content.write`), `beforeContentDelete`, `beforeMediaUpload` and `beforeCommentCreate` (refuse, hold or mark spam, never approve), plus the `onCommentCreated` after-hook. Before-hooks run one plugin at a time in config order, fail closed (422 `REJECTED_BY_PLUGIN` with the plugin's plain-text reason, 502 `PLUGIN_ERROR` when a plugin fails), are part of the approved capability hash, only see collections the plugin may read, cannot publish or unpublish, cannot save from inside, and whatever they return passes the MDX rules again. Comment hooks never see the email or IP address. Restoring from the trash now runs the save checks.
