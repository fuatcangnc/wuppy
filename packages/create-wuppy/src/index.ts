import { randomBytes } from "node:crypto";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// shortcut: Astro-side versions are pinned here; bump them with the starter template.
const VERSIONS: Record<string, string> = { astro: "^7.3.2", "@astrojs/node": "^11.1.5", zod: "4.5.4" };
const SKIP = /(^|[\\/])(node_modules|\.wuppy|\.git|dist|\.astro|\.env)([\\/]|$)/;

export interface ScaffoldOptions {
	template: string;
	target: string;
	name: string;
	/** Public origin of the site; Better Auth only accepts requests from it. */
	url: string;
	/** Range written for `wuppy`; the CLI passes its own version because all packages are released together. */
	wuppyVersion?: string;
}

export async function scaffold({ template, target, name, url, wuppyVersion = "latest" }: ScaffoldOptions): Promise<void> {
	if (!/^[a-z][a-z0-9-]*$/.test(name))
		throw new Error(`Invalid project name: ${JSON.stringify(name)} (use lowercase letters, digits, dashes)`);
	await mkdir(target, { recursive: true });
	if ((await readdir(target)).length > 0) throw new Error(`Target directory is not empty: ${target}`);

	await cp(template, target, { recursive: true, filter: (src) => !SKIP.test(src.slice(template.length)) });

	const pkgPath = join(target, "package.json");
	const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as { name: string; dependencies: Record<string, string> };
	pkg.name = name;
	for (const [dep, range] of Object.entries(pkg.dependencies)) {
		if (range === "workspace:*") pkg.dependencies[dep] = wuppyVersion;
		else if (range === "catalog:") pkg.dependencies[dep] = VERSIONS[dep] ?? "latest";
	}
	await writeFile(pkgPath, JSON.stringify(pkg, null, "\t") + "\n");

	const secret = randomBytes(32).toString("base64url");
	await writeFile(join(target, ".env"), `WUPPY_SECRET=${secret}\nWUPPY_URL=${url}\n`, { mode: 0o600 });
}
