import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig, type WuppyConfig } from "../config/index.ts";
import { type RedirectRule, resolveRedirect } from "../redirects/index.ts";

let config: Promise<WuppyConfig> | undefined;
let stored: { mtime: number; rules: RedirectRule[] } | undefined;

async function storedRedirects(root: string): Promise<RedirectRule[]> {
	const path = join(root, ".wuppy", "data", "redirects.json");
	try {
		const info = await stat(path);
		if (stored?.mtime === info.mtimeMs) return stored.rules;
		const rules = JSON.parse(await readFile(path, "utf8")) as RedirectRule[];
		stored = { mtime: info.mtimeMs, rules };
		return rules;
	} catch {
		return [];
	}
}

export const onRequest = async (ctx: { url: URL }, next: () => Promise<Response>): Promise<Response> => {
	const root = process.cwd();
	config ??= loadConfig(root);
	const [cfg, dynamic] = await Promise.all([config, storedRedirects(root)]);
	const hit = resolveRedirect([...cfg.redirects, ...dynamic], ctx.url.pathname);
	return hit ? new Response(null, { status: hit.status, headers: { location: hit.to } }) : next();
};
