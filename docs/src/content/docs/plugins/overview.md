---
title: Plugins
description: Extend Wuppy with sandboxed plugins that ask for permission first.
sidebar:
  order: 1
---

Plugins run inside a WebAssembly (QuickJS) sandbox with time and memory limits. A plugin can only do what its
manifest declares (its **capabilities**), and the admin approves those capabilities in plain language. If a
plugin fails to load or breaks its rules, it is turned off; the site keeps working.

## Capabilities

A plugin can, if approved:

- react to content, media and comment events, and check (refuse or change) a change before it is made; see
  [Hooks](/plugins/hooks/),
- write content (`content.write`),
- send email (`email`, 10 per minute),
- read secrets from `WUPPY_PLUGIN_<ID>_<NAME>` environment variables,
- call allowed hosts on the internet (every call is logged),
- serve routes under `/api/plugins/<id>/*` and add admin pages.

If an update asks for more, the plugin stays off until it is approved again.

## Installing

- **From a registry**: **Plugins** searches the configured registries, installs, and shows available updates.
  Packages are signed (Ed25519) and pinned by checksum; each registry has its own trusted keys. A broken registry
  does not affect the others.
- **From a folder**: add it to `wuppy.config` with the approval hash:

```sh
pnpm wuppycms plugin hash plugins/search
```

```js
plugins: [{ dir: "plugins/search", approve: "<hash>" }],
```

**Plugins** shows each plugin's status, version, source, capabilities, last error, logs, call and error counts,
and settings. Plugins can be turned on and off, configured, and removed (if installed from a registry).

## Writing a plugin

The `wuppycms-plugin` CLI creates, builds and signs plugins:

```sh
wuppycms-plugin init my-plugin       # manifest.json + plugin.js
wuppycms-plugin validate my-plugin   # check the manifest
wuppycms-plugin build my-plugin      # fails if the code uses a capability the manifest does not declare
wuppycms-plugin keygen               # a new Ed25519 key pair
wuppycms-plugin pack my-plugin <key> # a signed registry bundle and index entry
```
