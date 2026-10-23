import { randomBytes } from "node:crypto";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// shortcut: Astro-side versions are pinned here; bump them with the starter template.
// Mirrors the pnpm catalog for every `catalog:` dependency of the starter (the scaffold test checks none is missing).
const VERSIONS: Record<string, string> = {
	astro: "^7.3.2",
	"@astrojs/node": "^11.1.5",
	zod: "4.5.4",
	tailwindcss: "^4.1.18",
	"@tailwindcss/vite": "^4.3.3",
	bejamas: "^0.3.3",
	"@data-slot/navigation-menu": "^0.2.166",
	"class-variance-authority": "^0.7.1",
	clsx: "^2.1.1",
	"tailwind-merge": "^3.6.0",
	"tw-animate-css": "^1.4.0",
};
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

export async function scaffold({
	template,
	target,
	name,
	url,
	wuppyVersion = "latest",
}: ScaffoldOptions): Promise<void> {
	if (!/^[a-z][a-z0-9-]*$/.test(name))
		throw new Error(`Invalid project name: ${JSON.stringify(name)} (use lowercase letters, digits, dashes)`);
	await mkdir(target, { recursive: true });
	if ((await readdir(target)).length > 0) throw new Error(`Target directory is not empty: ${target}`);

	await cp(template, target, { recursive: true, filter: (src) => !SKIP.test(src.slice(template.length)) });

	const pkgPath = join(target, "package.json");
	const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
		name: string;
		dependencies: Record<string, string>;
		devDependencies?: Record<string, string>;
	};
	pkg.name = name;
	for (const deps of [pkg.dependencies, pkg.devDependencies ?? {}]) {
		for (const [dep, range] of Object.entries(deps)) {
			if (range === "workspace:*") deps[dep] = wuppyVersion;
			else if (range === "catalog:") deps[dep] = VERSIONS[dep] ?? "latest";
		}
	}
	await writeFile(pkgPath, JSON.stringify(pkg, null, "\t") + "\n");

	const secret = randomBytes(32).toString("base64url");
	await writeFile(join(target, ".env"), `WUPPY_SECRET=${secret}\nWUPPY_URL=${url}\n`, { mode: 0o600 });
}
