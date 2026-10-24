// Run after `pnpm build`: the published layout must expose every Astro entrypoint and load under plain Node.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const dist = new URL("../dist/", import.meta.url);
const { default: wuppycms } = await import(new URL("astro.mjs", dist).href);
const entrypoints = [];
wuppycms().hooks["astro:config:setup"]({
	config: { root: new URL("../../..", import.meta.url) },
	injectRoute: (r) => entrypoints.push(r.entrypoint),
	addMiddleware: (m) => entrypoints.push(m.entrypoint),
	updateConfig: () => undefined,
});
const missing = entrypoints.filter((u) => !existsSync(fileURLToPath(u)));
if (entrypoints.length !== 10 || missing.length) {
	console.error("dist is incomplete:", { count: entrypoints.length, missing: missing.map(String) });
	process.exit(1);
}
// Workspace siblings resolve to TypeScript sources here, so index.mjs cannot be imported until they are published;
// check its export list textually instead.
const exported = (await readFile(new URL("index.mjs", dist), "utf8")).match(/export \{([^}]*)\}/g)?.join(",") ?? "";
for (const name of ["createServer", "createApp", "ContentService", "buildSeo", "defineConfig", "isPublished"]) {
	if (!new RegExp(`\\b${name}\\b`).test(exported)) {
		console.error(`dist/index.mjs does not export ${name}`);
		process.exit(1);
	}
}
console.log(`dist OK (${entrypoints.length} entrypoints)`);
