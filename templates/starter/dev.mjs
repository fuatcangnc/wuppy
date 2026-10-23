// `astro dev` for the site that is really served: the GitHub theme picked in Admin → Themes when there is one, so
// the admin edits the theme's own content files (src/content/…/*.md) and the preview is the theme. Arguments are
// passed to astro (`pnpm dev --port 4330`).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { shareSite, siteDir } from "./theme.mjs";

const base = process.cwd();
const dir = siteDir(base);
if (dir !== base) {
	shareSite(base);
	// The theme has no .env of its own: it uses this site's secret and settings.
	if (existsSync(join(base, ".env"))) process.loadEnvFile(join(base, ".env"));
	console.log(`[wuppy] dev server for the active theme in ${dir}`);
}
const child = spawn(
	process.execPath,
	[join(dir, "node_modules", "astro", "bin", "astro.mjs"), "dev", ...process.argv.slice(2)],
	{
		cwd: dir,
		stdio: "inherit",
	},
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
