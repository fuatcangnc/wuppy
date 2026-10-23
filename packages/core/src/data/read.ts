import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { siteRoot } from "../themes/site.ts";

/** Read a site data file (the site's, also when a theme runs) without constructing the full server (templates, scripts). */
export async function readData<T>(name: string, fallback: T, root = siteRoot()): Promise<T> {
	if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`Invalid data name: ${name}`);
	try {
		return JSON.parse(await readFile(join(root, ".wuppy", "data", `${name}.json`), "utf8")) as T;
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
		throw e;
	}
}
