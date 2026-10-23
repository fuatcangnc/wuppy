// The GitHub theme picked in Admin → Themes (.wuppy/themes/active.json), or this site when none is picked.
import { readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

export function siteDir(base) {
	const themes = join(base, ".wuppy", "themes");
	try {
		const active = JSON.parse(readFileSync(join(themes, "active.json"), "utf8"));
		const picked = resolve(base, active.dir);
		if (picked.startsWith(themes + sep)) return picked;
	} catch {
		// no theme picked: run this site
	}
	return base;
}

/** What a theme needs from this site: its accounts, and where the theme manager lives. */
export function shareSite(base) {
	process.env.WUPPY_BASE_ROOT = base;
	process.env.WUPPY_AUTH_DB ||= join(base, ".wuppy", "auth.db");
}
