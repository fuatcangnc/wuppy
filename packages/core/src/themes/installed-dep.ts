import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Imports a wuppycms dependency from where it is installed. A theme build bundles this server code into the theme's
 * `dist/`, where the Astro compiler cannot find its native binding and TypeScript's CommonJS code fails
 * (`__filename is not defined`); an import by file URL is left alone by the bundler.
 */
export async function importInstalled<T>(name: string): Promise<T> {
	const site = join(process.env.WUPPY_BASE_ROOT || process.cwd(), "node_modules", "wuppycms", "package.json");
	// Unbundled (tests, the workspace): resolve next to this file.
	const require = createRequire(existsSync(site) ? site : import.meta.url);
	return (await import(/* @vite-ignore */ pathToFileURL(require.resolve(name)).href)) as T;
}
