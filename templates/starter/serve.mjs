// Starts the built site, or the GitHub theme picked in Admin → Themes (.wuppy/themes/active.json).
// A theme keeps this site's accounts; picking another one exits the server and the process manager starts it again.
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { shareSite, siteDir } from "./theme.mjs";

const base = process.cwd();
const dir = siteDir(base);
shareSite(base);
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
