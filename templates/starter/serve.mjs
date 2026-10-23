// Starts the built site, or the GitHub theme picked in Admin → Themes (.wuppy/themes/active.json).
// A theme keeps this site's accounts; picking another one exits the server and the process manager starts it again.
import { readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const base = process.cwd();
const themes = join(base, ".wuppy", "themes");
let dir = base;
try {
	const active = JSON.parse(readFileSync(join(themes, "active.json"), "utf8"));
	const picked = resolve(base, active.dir);
	if (picked.startsWith(themes + sep)) dir = picked;
} catch {
	// no theme picked: run this site
}

process.env.WUPPY_BASE_ROOT = base;
process.env.WUPPY_AUTH_DB ||= join(base, ".wuppy", "auth.db");
process.env.WUPPY_RESTART = "1";

async function start(root) {
	process.chdir(root);
	await import(pathToFileURL(join(root, "dist", "server", "entry.mjs")).href);
}

try {
	await start(dir);
} catch (e) {
	if (dir === base) throw e;
	// A broken theme build must not take the site down: fall back to the built-in one.
	console.error(`[wuppy] theme at ${dir} failed to start, running the built-in site: ${e.message}`);
	await start(base);
}
