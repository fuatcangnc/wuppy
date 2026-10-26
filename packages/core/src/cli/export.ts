import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve, sep } from "node:path";
import { loadConfig } from "../config/index.ts";
import { readData } from "../data/read.ts";
import { redirectsSchema, type RedirectRule } from "../redirects/index.ts";
import type { CliResult } from "./index.ts";

// The admin and its API need the Node server; a static copy has neither.
const SKIP = /^\/(admin|api|_wuppy|_server-islands)(\/|$)/;
const MAX_FILES = 20000;

/** Same-site paths a page or stylesheet points at (href, src, srcset, CSS url()). */
export function linksIn(text: string, from: URL): string[] {
	const raw = [
		...[...text.matchAll(/\s(?:href|src)=["']([^"']+)["']/g)].map((m) => m[1]!),
		...[...text.matchAll(/\ssrcset=["']([^"']+)["']/g)].flatMap((m) =>
			m[1]!.split(",").map((s) => s.trim().split(/\s+/)[0]!),
		),
		...[...text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1]!),
	];
	const out = new Set<string>();
	for (const href of raw) {
		const link = href.replaceAll("&amp;", "&");
		if (/^(data|mailto|tel|javascript):/i.test(link) || !URL.canParse(link, from)) continue;
		const url = new URL(link, from);
		if (url.origin === from.origin && !SKIP.test(url.pathname)) out.add(url.pathname);
	}
	return [...out];
}

/** Cloudflare `_redirects` lines for the site's exact and wildcard rules; regex rules have no static form. */
export function redirectLines(rules: RedirectRule[]): string[] {
	return rules
		.filter((r) => r.enabled && r.match !== "regex")
		.map((r) => `${r.from} ${r.match === "wildcard" ? r.to.replace("$1", ":splat") : r.to} ${r.status}`);
}

const freePort = () =>
	new Promise<number>((done, fail) => {
		const server = createServer().listen(0, "127.0.0.1", () => {
			const { port } = server.address() as { port: number };
			server.close(() => done(port));
		});
		server.on("error", fail);
	});

/** The file a URL path is saved as; HTML paths become `<path>/index.html`. */
function fileFor(out: string, path: string, html: boolean): string | undefined {
	let clean: string;
	try {
		clean = decodeURIComponent(path);
	} catch {
		return undefined;
	}
	const file = resolve(out, "." + (html && !/\.html?$/.test(clean) ? join(clean, "index.html") : clean));
	return file.startsWith(out + sep) ? file : undefined;
}

/**
 * Writes the built site as static files (`--out`, default `dist-static`) for a static host such as Cloudflare: it starts
 * `dist/server/entry.mjs` on a free port and saves every page reachable from `/`, the sitemap and the feed.
 */
export async function exportSite(cwd: string, argv: string[], env: NodeJS.ProcessEnv): Promise<CliResult> {
	const entry = join(cwd, "dist", "server", "entry.mjs");
	const at = argv.indexOf("--out");
	const out = resolve(cwd, at >= 0 ? (argv[at + 1] ?? "") : "dist-static");
	if (out === resolve(cwd) || out === resolve(cwd, "dist"))
		return { code: 1, stdout: "", stderr: "--out must be a folder of its own" };
	try {
		await access(entry);
	} catch {
		return { code: 1, stdout: "", stderr: "No dist/server/entry.mjs: run `astro build` first" };
	}
	const port = await freePort();
	const base = new URL(`http://127.0.0.1:${port}`);
	const server = spawn(process.execPath, [entry], {
		cwd,
		// A build machine has no .env; a throwaway secret is enough for rendering public pages.
		env: {
			...env,
			HOST: "127.0.0.1",
			PORT: String(port),
			NODE_ENV: "production",
			WUPPY_SECRET: env.WUPPY_SECRET || randomBytes(32).toString("base64url"),
		},
		stdio: ["ignore", "ignore", "pipe"],
	});
	let log = "";
	server.stderr.on("data", (d: Buffer) => (log = (log + d.toString()).slice(-4000)));
	try {
		for (let i = 0; ; i++) {
			if (server.exitCode !== null) throw new Error(`The site server stopped:\n${log}`);
			const up = await fetch(new URL("/robots.txt", base)).then(
				() => true,
				() => false,
			);
			if (up) break;
			if (i > 300) throw new Error(`The site server did not start in 30s:\n${log}`);
			await new Promise((r) => setTimeout(r, 100));
		}
		await rm(out, { recursive: true, force: true });
		await cp(join(cwd, "dist", "client"), out, { recursive: true });

		const queue = ["/", "/sitemap.xml", "/rss.xml", "/robots.txt"];
		const seen = new Set(queue);
		let pages = 0;
		while (queue.length) {
			if (seen.size > MAX_FILES) throw new Error(`More than ${MAX_FILES} files; is a link generating new URLs?`);
			const path = queue.shift()!;
			const url = new URL(path, base);
			const res = await fetch(url, { redirect: "manual" });
			if (res.status !== 200) continue;
			const type = res.headers.get("content-type") ?? "";
			const html = type.includes("text/html");
			const file = fileFor(out, path, html);
			if (!file) continue;
			const body = Buffer.from(await res.arrayBuffer());
			await mkdir(dirname(file), { recursive: true });
			await writeFile(file, body);
			if (html) pages++;
			if (!/html|css|xml/.test(type)) continue;
			const text = body.toString("utf8");
			const found = /xml/.test(type)
				? [...text.matchAll(/<(?:loc|link)>([^<]+)<\/(?:loc|link)>/g)].flatMap((m) => {
						const u = new URL(m[1]!.trim(), base);
						return SKIP.test(u.pathname) ? [] : [u.pathname];
					})
				: linksIn(text, url);
			for (const next of found)
				if (!seen.has(next)) {
					seen.add(next);
					queue.push(next);
				}
		}
		const missing = await fetch(new URL("/__wuppy-export-404", base));
		if (missing.headers.get("content-type")?.includes("text/html"))
			await writeFile(join(out, "404.html"), Buffer.from(await missing.arrayBuffer()));

		const config = await loadConfig(cwd);
		const stored = redirectsSchema.parse(await readData<unknown[]>("redirects", [], cwd));
		const lines = redirectLines([...config.redirects, ...stored]);
		if (lines.length) await writeFile(join(out, "_redirects"), lines.join("\n") + "\n");
		return { code: 0, stdout: `Exported ${pages} pages to ${out}\n`, stderr: "" };
	} catch (e) {
		return { code: 1, stdout: "", stderr: (e as Error).message };
	} finally {
		server.kill();
	}
}
