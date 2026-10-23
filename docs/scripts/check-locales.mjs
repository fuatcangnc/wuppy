// Every English page needs a Turkish twin under tr/ (and the reverse), so no feature is documented in one language only.
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/content/docs", import.meta.url));
const walk = (dir) =>
	readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? walk(join(dir, e.name)) : /\.mdx?$/.test(e.name) ? [relative(root, join(dir, e.name))] : [],
	);
const pages = walk(root);
const en = new Set(pages.filter((p) => !p.startsWith("tr/")));
const tr = new Set(pages.filter((p) => p.startsWith("tr/")).map((p) => p.slice(3)));
const missing = [...[...en].filter((p) => !tr.has(p)).map((p) => `tr/${p}`), ...[...tr].filter((p) => !en.has(p))];
if (missing.length) {
	console.error(`Missing translations:\n  ${missing.join("\n  ")}`);
	process.exit(1);
}
console.log(`docs: ${en.size} pages, each in English and Turkish`);
