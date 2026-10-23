---
title: Command line
description: The wuppy and wuppy-plugin commands.
---

## wuppy

| Command | Does |
| --- | --- |
| `wuppy init [--force]` | Wraps the Astro project in this folder: writes `wuppy.config.mjs` from its content collections and adds the integration. See [Existing Astro project](/guides/existing-astro-project/). |
| `wuppy import <git-url> <dir>` | Clones a repository into `<dir>`, then runs `wuppy init` there. |
| `wuppy import` | Lists your Astro repositories on GitHub (needs `gh`), clones the one you pick and runs `wuppy init`. |
| `wuppy doctor` | Checks the config, content folders, Git and `WUPPY_SECRET`. Exits with 1 on a problem. |
| `wuppy types` | Writes `wuppy-env.d.ts` with types for every collection. |
| `wuppy upgrade [--force]` | Applies data migrations after a package update. See [Upgrading](/deployment/upgrading/). |
| `wuppy plugin hash <dir>` | Prints a plugin's capabilities and the hash to approve it in `wuppy.config`. |

## wuppy-plugin

| Command | Does |
| --- | --- |
| `wuppy-plugin init <dir>` | Creates `manifest.json` and `plugin.js`. |
| `wuppy-plugin validate <dir>` | Validates the manifest. |
| `wuppy-plugin hash <dir>` | Prints the capability hash to approve. |
| `wuppy-plugin build <dir>` | Fails if the code uses an undeclared capability. |
| `wuppy-plugin keygen` | Prints a new Ed25519 key pair. |
| `wuppy-plugin pack <dir> [privateKey]` | Prints a registry bundle and index entry, signed when a key is given. |

## create-wuppy

`npm create wuppy <folder>` creates a new site from the starter template.
