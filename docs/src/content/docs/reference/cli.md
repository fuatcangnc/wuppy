---
title: Command line
description: The wuppy and wuppycms-plugin commands.
---

## wuppy

| Command | Does |
| --- | --- |
| `wuppycms init [--force]` | Wraps the Astro project in this folder: writes `wuppy.config.mjs` from its content collections and adds the integration. See [Existing Astro project](/guides/existing-astro-project/). |
| `wuppycms import <git-url> <dir>` | Clones a repository into `<dir>`, then runs `wuppycms init` there. |
| `wuppycms import` | Lists your Astro repositories on GitHub (needs `gh`), clones the one you pick and runs `wuppycms init`. |
| `wuppycms doctor` | Checks the config, content folders, Git and `WUPPY_SECRET`. Exits with 1 on a problem. |
| `wuppycms types` | Writes `wuppy-env.d.ts` with types for every collection. |
| `wuppycms mdx-to-md [dir]` | Converts `.mdx` entries without components or expressions to `.md`; files that still need MDX are kept and listed. |
| `wuppycms upgrade [--force]` | Applies data migrations after a package update. See [Upgrading](/deployment/upgrading/). |
| `wuppycms plugin hash <dir>` | Prints a plugin's capabilities and the hash to approve it in `wuppy.config`. |

## wuppycms-plugin

| Command | Does |
| --- | --- |
| `wuppycms-plugin init <dir>` | Creates `manifest.json` and `plugin.js`. |
| `wuppycms-plugin validate <dir>` | Validates the manifest. |
| `wuppycms-plugin hash <dir>` | Prints the capability hash to approve. |
| `wuppycms-plugin build <dir>` | Fails if the code uses an undeclared capability. |
| `wuppycms-plugin keygen` | Prints a new Ed25519 key pair. |
| `wuppycms-plugin pack <dir> [privateKey]` | Prints a registry bundle and index entry, signed when a key is given. |

## create-wuppycms

`npm create wuppycms <folder>` creates a new site from the starter template.
