# @wuppycms/plugin-cli

The `wuppycms-plugin` command builds and packages [WuppyCMS](https://wuppycms.com) plugins.

```sh
npm install -D @wuppycms/plugin-cli
npx wuppycms-plugin init my-plugin
npx wuppycms-plugin build my-plugin
```

| Command | Does |
| --- | --- |
| `init <dir>` | create `manifest.json` and `plugin.js` |
| `hash <dir>` | print the capability hash to approve in `wuppy.config.mjs` |
| `validate <dir>` | validate `manifest.json` |
| `build <dir>` | check `plugin.js` against the manifest; undeclared capabilities fail the build |
| `keygen` | print a new Ed25519 key pair for signing packages |
| `pack <dir> [privateKey]` | print a registry bundle and index entry, signed when a key is given |

See [Plugins](https://docs.wuppycms.com/plugins/overview/) in the documentation.

## Links

- Website: [wuppycms.com](https://wuppycms.com)
- Documentation: [docs.wuppycms.com](https://docs.wuppycms.com)
- Source: [GitHub](https://github.com/fuatcangnc/wuppy)
