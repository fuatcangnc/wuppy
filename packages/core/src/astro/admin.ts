import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve, sep } from "node:path";

const TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".map": "application/json",
	".svg": "image/svg+xml",
	".png": "image/png",
	".ico": "image/x-icon",
	".woff2": "font/woff2",
};

const CSP = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'";

const notFound = () => new Response("Not found", { status: 404 });

/** Serves the built admin SPA from `dist`; extensionless paths fall back to index.html (client-side routing). */
export async function serveAdmin(dist: string, rel: string): Promise<Response> {
	let path: string;
	try {
		path = decodeURIComponent(rel);
	} catch {
		return notFound();
	}
	const root = resolve(dist);
	const ext = extname(path);
	const target = resolve(root, ext ? path : "index.html");
	if (!target.startsWith(root + sep)) return notFound();

	try {
		const body = await readFile(target);
		const html = ext === "" || ext === ".html";
		return new Response(body, {
			headers: {
				"content-type": TYPES[html ? ".html" : ext] ?? "application/octet-stream",
				"x-content-type-options": "nosniff",
				"cache-control": html ? "no-cache" : "public, max-age=31536000, immutable",
				...(html ? { "content-security-policy": CSP } : {}),
			},
		});
	} catch {
		return notFound();
	}
}

const findAdminDist = (): string => {
	const req = createRequire(import.meta.url);
	const candidates: string[] = [];
	try {
		const pkg = req.resolve("wuppy/package.json");
		const dir = dirname(pkg);
		candidates.push(
			join(dir, "node_modules", "@wuppy", "admin", "dist"),
			join(dir, "..", "admin", "dist"),
			join(dir, "..", "..", "packages", "admin", "dist"),
		);
	} catch {
		// published layouts where only the package entry is resolvable
	}
	candidates.push(
		join(process.cwd(), "node_modules", "@wuppy", "admin", "dist"),
		join(process.cwd(), "packages", "admin", "dist"),
	);
	const found = candidates.find((dir) => existsSync(join(dir, "index.html")));
	if (!found) throw new Error("Cannot locate @wuppy/admin/dist");
	return found;
};

export const adminDist = (_resolveFrom?: (id: string) => string) => findAdminDist();
