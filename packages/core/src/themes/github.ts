import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { cp, lstat, mkdir, readdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { loadConfig } from "../config/index.ts";
import { open, seal } from "../security/secret-box.ts";
import { astroOnly, CONFIGS, CONTENT_CONFIGS, init, NODE_ADAPTER, REPOS_QUERY, type GithubRepo } from "../cli/init.ts";
import { quietNextChange } from "../astro/quiet-hmr.ts";
import { markSource } from "../astro/source-marks.ts";
import { themeBodyShift, themePageRel } from "../astro/theme-pages.ts";
import type { ElementEdit } from "./astro-edit.ts";
import type { ElementHost } from "./instance-edit.ts";
import { importDemo, importPages } from "./site.ts";
import {
	clearOverlay,
	readOverlay,
	rebaseShadow,
	shadowMark,
	unshadow,
	writeOverlay,
	type Overlay,
} from "./overlay.ts";
import { findTextSource } from "./text-source.ts";

/** `"12:5"` moved by `n` lines. */
/** What an element edit answers: where the element is now, and how the editor shows the change. */
export interface EditResult {
	loc?: string;
	/** The file an added element is in, when not the edited element's (added next to a component's use). */
	file?: string;
	/** Which use of its component the element is now (after a move). */
	slot?: number;
	reload: boolean;
	refresh?: boolean;
}
/** Only the first copy of each shadow mark: a duplicated element's copy has no build location. */
const firstMarks = (shadow: string) => {
	const seen = new Set<string>();
	return shadow.replace(/ data-wuppy-o="[^"]*"/g, (m) => (seen.has(m) ? "" : (seen.add(m), m)));
};
const TW_MERGE = "tailwind-merge";
/** The theme's own `tailwind-merge`, when it has one (see instance-edit.ts). */
async function themeMerge(root: string): Promise<((classes: string) => string) | undefined> {
	const path = (() => {
		try {
			return createRequire(join(root, "package.json")).resolve(TW_MERGE);
		} catch {
			// Not used by the theme: a class of a component then stays for every use.
			return undefined;
		}
	})();
	if (!path) return undefined;
	return ((await import(/* @vite-ignore */ pathToFileURL(path).href)) as { twMerge?: (c: string) => string }).twMerge;
}
/** Markup with attributes added to its first tag. */
const markFirst = (html: string, attrs: string) => html.replace(/^(\s*<[a-zA-Z][\w.:-]*)/, `$1${attrs}`);
const shiftLine = (loc: string, n: number) => loc.replace(/^\d+/, (line) => String(Number(line) + n));

/**
 * A GitHub repository as this site's theme: the server clones it under `.wuppy/themes/`, wraps it (`wuppycms init`),
 * installs and builds it, then points `.wuppy/themes/active.json` at it. The launcher (`serve.mjs` in the starter)
 * starts the active build after the restart. The repo is the user's own code, so only admins may install one.
 */

export type Run = (cmd: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }) => Promise<unknown>;

export interface ThemeJob {
	repo: string;
	status: "running" | "done" | "failed";
	step: string;
	error?: string;
}

// GitHub names: letters, digits, "-", "_", "."; never starting with a dot, so no ".." path parts.
const MARKDOWN_REMARK = "^7.3.4";
// Astro before 7.4 (its Rust compiler before 0.5) does not mark elements with their source spot in dev, and the visual
// editor finds theme elements by those marks: an older theme gets this Astro.
const ASTRO = "^7.4.0";
const version = (range: string) =>
	range
		.match(/\d+(?:\.\d+){0,2}/)?.[0]
		.split(".")
		.map(Number);
/** Whether an npm range like "^7.3.1" or "7" allows versions older than `min` ("^7.4.0"). */
export const olderThan = (range: string, min: string): boolean => {
	const [a, b] = [version(range), version(min)!];
	if (!a) return false;
	for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== b[i]) return (a[i] ?? 0) < b[i]!;
	return false;
};
/** How long element edits pause before a production theme is built again. */
const REBUILD_AFTER = 90_000;
/** Theme edits are pushed after a short pause, so a visual-edit burst becomes one commit. */
const PUSH_AFTER = 6_000;
const PRODUCTION = (import.meta as { env?: { PROD?: boolean } }).env?.PROD ?? process.env.NODE_ENV === "production";

const REPO = /^[\w-][\w.-]*\/[\w-][\w.-]*$/;
const exec = promisify(execFile);
const defaultRun: Run = (cmd, args, opts) =>
	exec(cmd, args, { ...opts, maxBuffer: 64 * 1024 * 1024, timeout: 20 * 60_000 });

/** The user's Astro repositories on GitHub, newest push first. */
export async function githubAstroRepos(token: string, fetchFn: typeof fetch = fetch): Promise<GithubRepo[]> {
	type Node = {
		nameWithOwner: string;
		isPrivate: boolean;
		description: string | null;
		object: { text?: string } | null;
	};
	const nodes: Node[] = [];
	let endCursor: string | null = null;
	// shortcut: at most 1000 repositories are read; enough for one account, page further if someone has more.
	for (let page = 0; page < 10; page++) {
		const res = await fetchFn("https://api.github.com/graphql", {
			method: "POST",
			headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "user-agent": "wuppycms" },
			body: JSON.stringify({ query: REPOS_QUERY, variables: { endCursor } }),
			signal: AbortSignal.timeout(15_000),
		});
		// 401: the token was revoked on GitHub (or replaced by a newer sign-in); the caller asks to connect again.
		if (!res.ok) throw Object.assign(new Error(`GitHub answered ${res.status}`), { status: res.status });
		const body = (await res.json()) as {
			errors?: { message: string }[];
			data?: { viewer: { repositories: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: Node[] } } };
		};
		if (body.errors?.length || !body.data) throw new Error(body.errors?.[0]?.message ?? "GitHub sent no data");
		const { pageInfo, nodes: more } = body.data.viewer.repositories;
		nodes.push(...more);
		if (!pageInfo.hasNextPage) break;
		endCursor = pageInfo.endCursor;
	}
	return astroOnly(
		nodes.map((n) => ({
			repo: n.nameWithOwner,
			private: n.isPrivate,
			description: n.description ?? "",
			pkg: n.object?.text ?? "",
		})),
	);
}

/** Editable text files exposed by the code view. Binaries, dependencies, build output and secrets are never listed. */
const SOURCE_EXTENSIONS = new Set([
	".astro",
	".md",
	".mdx",
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".json",
	".css",
	".html",
	".xml",
	".yml",
	".yaml",
	".toml",
	".txt",
	".svg",
]);
const SOURCE_SKIP_DIRS = new Set([
	"node_modules",
	".git",
	"dist",
	"dist-next",
	"dist-old",
	".astro",
	".wuppy",
	"wuppy-site",
	"coverage",
]);
const SOURCE_SKIP_FILES = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb"]);
const MAX_SOURCE_FILE = 512 * 1024;
const MAX_SOURCE_TOTAL = 4 * 1024 * 1024;
const MAX_SOURCE_FILES = 400;

export interface ThemeSourceFile {
	path: string;
	content: string;
	size: number;
}

/** Only what npm, git and Astro need: the server's secrets must not reach the repo's install scripts or its build. */
const cleanEnv = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
	PATH: process.env.PATH,
	HOME: process.env.HOME,
	TMPDIR: process.env.TMPDIR,
	...extra,
});

const gitEnv = (token: string): NodeJS.ProcessEnv =>
	cleanEnv({
		GIT_TERMINAL_PROMPT: "0",
		// Passed in the environment, not argv or .git/config, so it is not stored or listed.
		...(token && {
			GIT_CONFIG_COUNT: "1",
			GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
			GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`,
		}),
	});

const IDENTITY = ["AUTHOR", "COMMITTER"];

// `wuppycms init` changes these; they are put back before a pull and changed again after it.
const WRAPPED = ["package.json", "package-lock.json", ".gitignore", ...CONFIGS, ...CONTENT_CONFIGS];

/**
 * Brings a cloned theme up to its GitHub repository; false when nothing new was pushed. Edits made on this server
 * (visual editor, Code view) are kept; where GitHub changed or deleted the same file, GitHub's version wins and this
 * server's is left in `git stash`.
 */
export async function pullTheme(dir: string, token: string): Promise<boolean> {
	const git = async (...args: string[]) =>
		(
			await exec("git", args, {
				cwd: dir,
				// `git stash` makes a commit, which needs a name; the server has none set.
				env: {
					...gitEnv(token),
					...Object.fromEntries(
						IDENTITY.flatMap((k) => [
							[`GIT_${k}_NAME`, "Wuppy"],
							[`GIT_${k}_EMAIL`, "wuppy@localhost"],
						]),
					),
				},
				maxBuffer: 64 * 1024 * 1024,
			})
		).stdout.trim();
	await git("fetch", "--quiet", "origin", "HEAD");
	if ((await git("rev-parse", "HEAD")) === (await git("rev-parse", "FETCH_HEAD"))) return false;
	const wrapped = (await git("ls-files", "--", ...WRAPPED)).split("\n").filter(Boolean);
	if (wrapped.length) await git("checkout", "--", ...wrapped);
	const stashed = !(await git("stash", "push", "--message", "Wuppy: edits made on the server")).startsWith("No local");
	await git("reset", "--quiet", "--hard", "FETCH_HEAD");
	if (stashed)
		await git("stash", "pop").catch(async () => {
			for (const f of (await git("diff", "--name-only", "--diff-filter=U")).split("\n").filter(Boolean))
				await git("checkout", "FETCH_HEAD", "--", f).catch(() => git("rm", "--quiet", "--force", "--", f));
			// Unstages what the pop staged; the stash stays, since it was not applied in full.
			await git("reset", "--quiet");
		});
	return true;
}

export class GithubThemes {
	job: ThemeJob | null = null;
	private readonly dir: string;
	private rebuildTimer: ReturnType<typeof setTimeout> | undefined;
	private pushTimer: ReturnType<typeof setTimeout> | undefined;
	private edits: Promise<unknown> = Promise.resolve();
	private pushPaths = new Set<string>();
	private pushRepo: string | undefined;
	private siteSyncPending = false;
	private pushToken: string | undefined;
	private pushState: "idle" | "pending" | "pushing" | "failed" = "idle";
	private pushError: string | undefined;
	private pushAt: string | undefined;

	constructor(
		private readonly o: {
			/** The site the server was started from; themes and the active pointer live in its `.wuppy/`. */
			base: string;
			run?: Run;
			/** Restarts the server so the launcher picks up the new active theme; false when it cannot. */
			restart?: () => boolean;
		},
	) {
		this.dir = join(o.base, ".wuppy", "themes");
	}

	themeDir(repo: string): string {
		return join(this.dir, repo.replace("/", "__"));
	}

	async active(): Promise<string | null> {
		try {
			return (JSON.parse(await readFile(join(this.dir, "active.json"), "utf8")) as { repo: string }).repo;
		} catch {
			return null;
		}
	}

	/** Repos that were built here and can be switched to without a new install. */
	async installed(): Promise<string[]> {
		const names = await readdir(this.dir).catch(() => [] as string[]);
		return names
			.filter((n) => n.includes("__") && existsSync(join(this.dir, n, "dist", "server", "entry.mjs")))
			.map((n) => n.replace("__", "/"));
	}

	install(repo: string, token: string): ThemeJob {
		if (!REPO.test(repo)) throw new Error("Repository must look like owner/name");
		if (this.job?.status === "running") throw new Error(`${this.job.repo} is still being installed`);
		const job: ThemeJob = { repo, status: "running", step: "Cloning" };
		this.job = job;
		void this.build(job, token)
			.then(() => {
				// The theme's sample posts and pages become site content once; the site's own entries are kept.
				job.step = "Importing sample content";
				return importDemo(this.o.base, this.themeDir(repo));
			})
			.then(
				async () => {
					// Finish activation (sample pages + restart) before reporting done: the install is not complete while the
					// running server still serves the old site.
					await this.activate(repo);
					job.status = "done";
					job.step = "Done";
				},
				(e: Error & { stderr?: string }) => {
					job.status = "failed";
					// The last lines of npm/Astro output say what broke; the token never appears there (it is in the environment).
					job.error = (e.stderr?.trim() || e.message).slice(-2000);
				},
			);
		return job;
	}

	/** `keep`: asked before the new build replaces the running one; false drops it (false is then returned). */
	private async build(job: ThemeJob, token: string, keep?: () => Promise<boolean>): Promise<boolean> {
		const run = this.o.run ?? defaultRun;
		const dir = this.themeDir(job.repo);
		await mkdir(this.dir, { recursive: true });
		// A theme that never built is cloned again, so a fix pushed to GitHub after a failed install is picked up.
		if (!(await this.installed()).includes(job.repo)) await rm(dir, { recursive: true, force: true });
		let pulled = false;
		if (!existsSync(join(dir, ".git"))) {
			await rm(dir, { recursive: true, force: true });
			await run("git", ["clone", "--", `https://github.com/${job.repo}.git`, dir], {
				cwd: this.dir,
				env: gitEnv(token),
			}).catch(async (e: unknown) => {
				await rm(dir, { recursive: true, force: true });
				throw e;
			});
		} else if (token) {
			// Install/Rebuild on the Themes page (the only builds with a token) takes what was pushed to GitHub since.
			job.step = "Pulling from GitHub";
			const pull = this.edits.then(() => pullTheme(dir, token));
			this.edits = pull.catch(() => undefined);
			pulled = await pull;
		}
		job.step = "Wrapping";
		const configPath = join(dir, "wuppy.config.mjs");
		const wuppyConfig = existsSync(configPath) ? await readFile(configPath, "utf8") : null;
		if (wuppyConfig === null || pulled) {
			const hadEnv = existsSync(join(dir, ".env"));
			// The server copy needs no guide for coding agents.
			const r = await init(dir, { force: true, agents: false });
			if (r.code !== 0) throw new Error(r.stderr || "wuppycms init failed");
			// The config made at install, and edited since, stays.
			if (wuppyConfig !== null) await writeFile(configPath, wuppyConfig);
			// init writes a fresh secret for local use; the server's own environment is the one to use.
			if (!hadEnv) await rm(join(dir, ".env"), { force: true });
		}
		// Wuppy itself is linked from this server below; npm would look for it in the registry.
		const pkgPath = join(dir, "package.json");
		const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as Record<string, Record<string, string> | undefined>;
		delete pkg.dependencies?.wuppycms;
		delete pkg.devDependencies?.wuppycms;
		// Wuppy runs sites on Node; a repo made for Cloudflare or Vercel is built with the Node adapter instead.
		for (const deps of [pkg.dependencies, pkg.devDependencies])
			if (deps?.astro && olderThan(deps.astro, ASTRO)) deps.astro = ASTRO;
		pkg.dependencies = { ...pkg.dependencies, "@astrojs/node": pkg.dependencies?.["@astrojs/node"] ?? NODE_ADAPTER };
		const config = CONFIGS.find((f) => existsSync(join(dir, f)));
		if (!config) throw new Error("No astro.config file in the repository");
		// The Node adapter needs a newer Astro than an older lockfile pins, and newer Astro no longer ships the
		// remark/rehype processor: a config that uses those plugins gets it back.
		if (
			/\b(remarkPlugins|rehypePlugins|remarkRehype)\b/.test(await readFile(join(dir, config), "utf8")) &&
			!pkg.dependencies["@astrojs/markdown-remark"]
		)
			pkg.dependencies["@astrojs/markdown-remark"] = MARKDOWN_REMARK;
		await writeFile(pkgPath, `${JSON.stringify(pkg, null, "\t")}\n`);
		await writeFile(
			join(dir, "astro.wuppy.config.mjs"),
			[
				"// Made by Wuppy Themes: the site's own config, built for the Node server Wuppy runs it on.",
				`import config from "./${config}";`,
				'import node from "@astrojs/node";',
				"const vite = config.vite ?? {};",
				"// Wuppy is linked from the server, so its packages (zod, better-auth...) must be bundled: left external they",
				"// would resolve to this repo's own, possibly different, versions. sharp is native and stays external.",
				'export default { ...config, adapter: node({ mode: "standalone" }), vite: { ...vite, ssr: { ...vite.ssr, noExternal: true, external: ["sharp"] } } };',
				"",
			].join("\n"),
		);
		job.step = "Installing packages";
		// Lockfiles made behind a mirror (registry.npmmirror.com…) point there; npm 12 refuses such "remote" URLs,
		// so every host is read as the configured registry. Integrity hashes in the lockfile are still checked.
		await run("npm", ["install", "--include=dev", "--no-audit", "--no-fund", "--replace-registry-host=always"], {
			cwd: dir,
			env: cleanEnv(),
		});
		// An override or an odd lockfile can still keep an older Astro; without source marks the editor shows no elements.
		const astro = JSON.parse(await readFile(join(dir, "node_modules", "astro", "package.json"), "utf8")) as {
			version: string;
		};
		if (olderThan(astro.version, ASTRO))
			throw new Error(`The theme installed Astro ${astro.version}; Wuppy needs ${ASTRO} to edit its elements.`);
		const link = join(dir, "node_modules", "wuppycms");
		await rm(link, { recursive: true, force: true });
		await symlink(realpathSync(join(this.o.base, "node_modules", "wuppycms")), link, "dir");
		job.step = "Building";
		// Built beside the running site's dist and swapped in at the end, so the site keeps working during the build.
		await rm(join(dir, "dist-next"), { recursive: true, force: true });
		await run(
			process.execPath,
			[
				join(dir, "node_modules", "astro", "bin", "astro.mjs"),
				"build",
				"--config",
				"astro.wuppy.config.mjs",
				"--outDir",
				"dist-next",
			],
			{
				cwd: dir,
				// The site's folder (no secrets): the build then renders the site's Pages and marks elements for the editor.
				env: cleanEnv({ NODE_ENV: "production", WUPPY_BASE_ROOT: this.o.base }),
			},
		);
		if (!existsSync(join(dir, "dist-next", "server", "entry.mjs")))
			throw new Error("The build has no server entry (dist/server/entry.mjs).");
		if (keep && !(await keep())) {
			await rm(join(dir, "dist-next"), { recursive: true, force: true });
			return false;
		}
		await rm(join(dir, "dist-old"), { recursive: true, force: true });
		if (existsSync(join(dir, "dist"))) await rename(join(dir, "dist"), join(dir, "dist-old"));
		await rename(join(dir, "dist-next"), join(dir, "dist"));
		await rm(join(dir, "dist-old"), { recursive: true, force: true });
		return true;
	}

	/** Active theme as a repo name and filesystem path, or null when the built-in site is active. */
	private async activeTheme(): Promise<{ repo: string; dir: string } | null> {
		const repo = await this.active();
		return repo ? { repo, dir: this.themeDir(repo) } : null;
	}

	/** Rebuilds the active theme after source edits; the launcher restarts when it can. */
	async rebuild(): Promise<ThemeJob> {
		const repo = await this.active();
		if (!repo) throw new Error("No active theme");
		if (this.job?.status === "running") throw new Error(`${this.job.repo} is still being built`);
		if (!(await this.installed()).includes(repo)) throw new Error(`${repo} is not installed`);
		const job: ThemeJob = { repo, status: "running", step: "Building" };
		this.job = job;
		// Edits made while it builds may be missing from it; it then gives way to the next build (their marks hold).
		const edits = (await readOverlay(this.o.base)).ops.length;
		const unchanged = async () => (await readOverlay(this.o.base)).ops.length === edits;
		void this.build(job, "", unchanged)
			.then(async (swapped) => {
				// The new build has every edit the overlay showed.
				if (swapped) await clearOverlay(this.o.base);
				return swapped;
			})
			.then(
				(swapped) => {
					job.status = "done";
					job.step = "Done";
					if (swapped) this.o.restart?.();
				},
				(e: Error & { stderr?: string }) => {
					job.status = "failed";
					job.error = (e.stderr?.trim() || e.message).slice(-2000);
				},
			);
		return job;
	}

	/**
	 * A production server shows the built theme with the edits laid over it (overlay.ts); it is built again once the
	 * edits pause for a while, which also drops the overlay. A build that edits came in during is
	 * dropped and the next one made.
	 */
	private rebuildSoon(): void {
		clearTimeout(this.rebuildTimer);
		this.rebuildTimer = setTimeout(() => {
			// A build in progress: try again after it.
			this.rebuild().catch(() => {
				if (this.job?.status === "running") this.rebuildSoon();
			});
		}, REBUILD_AFTER);
	}

	/** Site data the theme renders (menus) changed: a production server builds the theme again soon. */
	dataChanged(): void {
		if (PRODUCTION) this.rebuildSoon();
	}

	/** Source files for the code view; only admins may call this through the API. */
	async sourceFiles(): Promise<{ repo: string; files: ThemeSourceFile[] } | null> {
		const active = await this.activeTheme();
		if (!active) return null;
		// The theme's sample content lives in the site once installed (ADR-022), so its collection folders are hidden.
		const contentDirs = new Set(
			(await loadConfig(active.dir).catch(() => ({ collections: [] as { dir: string }[] }))).collections.map((c) =>
				c.dir.replace(/^\.\/|\/$/g, ""),
			),
		);
		const files: ThemeSourceFile[] = [];
		let total = 0;
		const walk = async (relativeDir: string): Promise<void> => {
			if (files.length >= MAX_SOURCE_FILES || total >= MAX_SOURCE_TOTAL) return;
			const directory = join(active.dir, relativeDir);
			const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
			for (const entry of entries) {
				if (files.length >= MAX_SOURCE_FILES || total >= MAX_SOURCE_TOTAL) break;
				if (entry.name.startsWith(".") && entry.name !== ".gitignore") continue;
				const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
				if (entry.isDirectory()) {
					if (!SOURCE_SKIP_DIRS.has(entry.name) && !contentDirs.has(relativePath)) await walk(relativePath);
					continue;
				}
				if (!entry.isFile() || SOURCE_SKIP_FILES.has(entry.name)) continue;
				const extension = extname(entry.name).toLowerCase();
				if (!SOURCE_EXTENSIONS.has(extension)) continue;
				const buffer = await readFile(join(active.dir, relativePath)).catch(() => null);
				if (!buffer || buffer.length > MAX_SOURCE_FILE || total + buffer.length > MAX_SOURCE_TOTAL) continue;
				const content = buffer.toString("utf8");
				if (content.includes("\u0000")) continue;
				files.push({ path: relativePath, content, size: buffer.length });
				total += buffer.length;
			}
		};
		await walk("");
		files.sort((a, b) => a.path.localeCompare(b.path));
		return { repo: active.repo, files };
	}

	/** Saves one text file of the active theme after checking its path, extension and size. */
	async writeSource(path: string, content: string): Promise<void> {
		const active = await this.activeTheme();
		if (!active) throw new Error("No active theme");
		const root = resolve(active.dir);
		const target = resolve(root, path);
		if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error("File path escapes the theme");
		const extension = extname(target).toLowerCase();
		if (!SOURCE_EXTENSIONS.has(extension)) throw new Error("Only theme source text files can be edited");
		const segments = path.split("/");
		if (segments.some((segment) => SOURCE_SKIP_DIRS.has(segment) || segment.startsWith(".env")))
			throw new Error("Theme dependencies, build output and secrets are read-only");
		if (SOURCE_SKIP_FILES.has(segments.at(-1) ?? "")) throw new Error("Lockfiles are read-only");
		if (Buffer.byteLength(content) > MAX_SOURCE_FILE) throw new Error("File is too large");
		const existing = await lstat(target).catch(() => null);
		if (existing?.isSymbolicLink() || (existing && !existing.isFile())) throw new Error("Not a regular theme file");
		await writeFile(target, content);
		this.pushRepo = active.repo;
		this.pushPaths.add(relative(root, target).split(sep).join("/"));
		// A production server shows the theme's build: a change made in Code view goes live with the next one.
		if (PRODUCTION) this.rebuildSoon();
	}

	/** Pushes theme changes to GitHub after an edit burst; no token (GitHub disconnected) leaves them local. */
	schedulePush(token?: string): void {
		if (!token) return;
		this.pushToken = token;
		this.pushState = "pending";
		this.pushError = undefined;
		this.scheduleFlush();
	}

	/** Schedules a push that first writes the site's content/settings snapshot into the theme repository. */
	scheduleSitePush(token?: string): void {
		if (!token) return;
		this.pushToken = token;
		this.pushState = "pending";
		this.pushError = undefined;
		this.siteSyncPending = true;
		this.scheduleFlush();
	}

	private scheduleFlush(): void {
		clearTimeout(this.pushTimer);
		this.pushTimer = setTimeout(() => {
			const syncSite = this.siteSyncPending;
			this.siteSyncPending = false;
			void (syncSite ? this.syncSite() : Promise.resolve())
				.then(() => this.pushNow(true))
				.catch((e: Error) => {
					this.pushState = "failed";
					this.pushError = e.message.slice(0, 500);
					console.error("[wuppy] theme push failed:", e.message);
				});
		}, PUSH_AFTER);
	}

	/** Push now, including source changes that were already on disk before this edit. */
	async pushAll(token: string): Promise<{ ok: boolean; error?: string }> {
		this.pushToken = token;
		this.pushRepo = (await this.activeTheme())?.repo;
		await this.syncSite();
		return this.pushNow(true);
	}

	/**
	 * Writes the site content and data into `wuppy-site/` in the theme repository. This makes page/content and
	 * settings CRUD visible in the connected GitHub repo, while the theme code stays the buildable part of the repo.
	 */
	async syncSite(): Promise<void> {
		const active = await this.activeTheme();
		if (!active) return;
		const target = join(active.dir, "wuppy-site");
		await rm(target, { recursive: true, force: true });
		await mkdir(target, { recursive: true });
		const content = join(this.o.base, "content");
		if (existsSync(content)) await cp(content, join(target, "content"), { recursive: true, force: true });
		const data = join(this.o.base, ".wuppy", "data");
		if (existsSync(data)) {
			await mkdir(join(target, "data"), { recursive: true });
			for (const name of await readdir(data)) {
				// Webhook secrets are deliberately not copied into a repository.
				if (name.endsWith(".json") && name !== "webhooks.json")
					await cp(join(data, name), join(target, "data", name), { force: true });
			}
		}
		await writeFile(
			join(target, "README.md"),
			"# Wuppy site snapshot\n\nThis folder is written automatically by Wuppy when site content or settings change.\nTheme code remains in `src/`. Webhook secrets are not included.\n",
		);
		this.pushRepo = active.repo;
	}

	/** Commits the files changed by the editor and pushes them to the repo's current branch. */
	async pushNow(includeSource = false): Promise<{ ok: boolean; error?: string }> {
		clearTimeout(this.pushTimer);
		const token = this.pushToken;
		const active = await this.activeTheme();
		if (!active || !token || active.repo !== this.pushRepo) {
			this.pushState = "idle";
			return { ok: true };
		}
		const run = this.o.run ?? defaultRun;
		const dir = active.dir;
		const git = async (...args: string[]) =>
			String(
				(
					(await run("git", args, {
						cwd: dir,
						env: {
							...gitEnv(token),
							...Object.fromEntries(
								IDENTITY.flatMap((kind) => [
									[`GIT_${kind}_NAME`, "Wuppy"],
									[`GIT_${kind}_EMAIL`, "wuppy@localhost"],
								]),
							),
						},
					})) as { stdout?: string }
				).stdout ?? "",
			).trimEnd();
		if (includeSource) {
			// Changes already on disk (before auto-push was enabled, or made from another editor) travel with the next
			// push too, but only source files: the wrapper configs and generated theme files stay local.
			const status = await git("status", "--porcelain", "--", "src", "wuppy-site");
			for (const line of status.split("\n")) {
				const raw = line.slice(3).trim();
				const path = raw.includes(" -> ") ? raw.split(" -> ").at(-1) : raw;
				if (path) this.pushPaths.add(path);
			}
		}
		const paths = [...this.pushPaths];
		this.pushPaths.clear();
		const previous = new Set(paths);
		this.pushState = "pushing";
		try {
			if (paths.length) {
				await git("add", "--", ...paths);
				const changes = await git("status", "--porcelain", "--", ...paths);
				if (changes) await git("commit", "--quiet", "-m", "Wuppy: theme changes");
			}
			try {
				await git("push", "--quiet", "origin", "HEAD");
			} catch (e) {
				// GitHub may have moved while this server was editing. Rebase the Wuppy commit onto it once, keeping
				// the wrapper files (which Wuppy changes locally) in an autostash, then push again.
				if (!/fetch first|non-fast-forward|rejected/i.test((e as Error).message)) throw e;
				const branch = await git("rev-parse", "--abbrev-ref", "HEAD");
				await git("fetch", "--quiet", "origin", branch);
				// A generated file such as design-system.md can be untracked here while GitHub now tracks it. Let the
				// repository's copy come in; restoring a stale generated copy would make the rebase impossible.
				const remoteFiles = new Set((await git("ls-tree", "-r", "--name-only", `origin/${branch}`)).split("\n"));
				for (const file of (await git("ls-files", "--others", "--exclude-standard")).split("\n"))
					if (remoteFiles.has(file)) await rm(join(dir, file), { force: true, recursive: true });
				// Wuppy's live theme is the source of truth for conflicts; keep remote history and non-conflicting files.
				await git("pull", "--rebase", "--autostash", "--strategy-option=theirs", "origin", branch);
				await git("push", "--quiet", "origin", "HEAD");
			}
			this.pushState = "idle";
			this.pushError = undefined;
			this.pushAt = new Date().toISOString();
			return { ok: true };
		} catch (e) {
			for (const path of previous) this.pushPaths.add(path);
			this.pushState = "failed";
			this.pushError = (e as Error).message.slice(0, 500);
			return { ok: false, error: this.pushError };
		}
	}

	pushStatus(): { state: "idle" | "pending" | "pushing" | "failed"; at?: string; error?: string } {
		return {
			state: this.pushState,
			...(this.pushAt ? { at: this.pushAt } : {}),
			...(this.pushError ? { error: this.pushError } : {}),
		};
	}

	/**
	 * Edits one element of the active theme's `.astro` files in place (see astro-edit.ts). `file` and `loc` are what
	 * Astro's dev server put on the element (`data-astro-source-file`, `data-astro-source-loc`); returns its new `loc`.
	 */
	/** `live`: the editor already shows the change, so a write that moves nothing else skips the page reload. */
	async editElement(
		file: string,
		loc: string,
		edit: ElementEdit,
		tag?: string,
		live = false,
		/** One use of a component, for an edit of its outer element (see instance-edit.ts). */
		host?: ElementHost,
	): Promise<EditResult> {
		const active = await this.activeTheme();
		if (!active) throw new Error("No active theme");
		const root = resolve(active.dir);
		const themePath = (f: string) => {
			const p = relative(root, resolve(root, f)).split(sep).join("/");
			if (p.startsWith("..") || !/\.(astro|[jt]sx)$/.test(p))
				throw new Error("Only the active theme's .astro, .tsx and .jsx files");
			return p;
		};
		const path = themePath(file);
		const { forInstance } = await import("./instance-edit.ts");
		const use = host && forInstance(edit) ? { ...host, file: themePath(host.file) } : undefined;
		if (PRODUCTION) {
			// One at a time: each edit reads and writes the overlay and the file.
			const run = this.edits.then(() => this.editBuilt(root, path, loc, edit, tag, use));
			this.edits = run.catch(() => undefined);
			return run;
		}
		const source = await readFile(join(root, path), "utf8");
		// A theme page's template lines move when its body slot cannot share the frontmatter's first line.
		const shiftOf = (p: string, text: string) => (themePageRel(root, join(root, p)) ? themeBodyShift(text) : 0);
		const shift = shiftOf(path, source);
		// Loaded on use: the Astro compiler is a native module that a bundled production server may not resolve.
		const { editAstroElement, ElementEditError } = await import("./astro-edit.ts");
		if (use) {
			const { editInstance, passesClass } = await import("./instance-edit.ts");
			const hostSource = await readFile(join(root, use.file), "utf8");
			const out = editInstance(hostSource, shiftLine(use.loc, -shiftOf(use.file, hostSource)), use, edit, {
				jsx: !use.file.endsWith(".astro"),
				takesClass: passesClass(source, shiftLine(loc, -shift), tag, !path.endsWith(".astro")),
				merge: await themeMerge(root),
			});
			await this.writeSource(use.file, out.source);
			const added = out.loc && shiftLine(out.loc, shiftOf(use.file, out.source));
			return edit.action === "insert"
				? { loc: added, file: use.file, reload: true }
				: { loc: edit.action === "delete" ? undefined : loc, slot: out.slot, reload: true };
		}
		let out: ReturnType<typeof editAstroElement>;
		try {
			out = editAstroElement(source, shiftLine(loc, -shift), edit, tag, !path.endsWith(".astro"));
		} catch (e) {
			if (!(e instanceof ElementEditError) || edit.action !== "text" || edit.from === undefined) throw e;
			const spot = await this.textSource(edit.from, edit.value, e);
			await this.writeSource(spot.path, spot.next);
			// The canvas already shows the text; dev reloads the changed module itself.
			return { loc, reload: false };
		}
		const reload = !(live && out.quiet);
		if (!reload) quietNextChange(join(root, path));
		await this.writeSource(path, out.source);
		return { loc: out.loc && shiftLine(out.loc, shift), reload };
	}

	/**
	 * An edit on a production server, whose page is a build of the theme: the file is changed as in dev, the edit is
	 * laid over the built pages at once (overlay.ts), and the theme is built again once the edits pause. The page keeps
	 * the build's element locations until then, so the element is found in the file by its shadow mark. `refresh`: the
	 * canvas shows the edit only after loading the page again.
	 */
	private async editBuilt(
		root: string,
		path: string,
		loc: string,
		edit: ElementEdit,
		tag?: string,
		use?: ElementHost,
	): Promise<EditResult> {
		const overlay = await readOverlay(this.o.base);
		const jsx = !path.endsWith(".astro");
		const { editAstroElement, ElementEditError, elements, locOf, nameOf } = await import("./astro-edit.ts");
		const shadow = await this.shadowOf(overlay, root, path);
		// The element whose build location is `at`, as a location in the shadow file.
		const inShadow = (text: string, at: string, name?: string, inJsx = jsx) => {
			const hit = elements(text, inJsx).find(
				({ el }) =>
					el.openingElement.attributes.some((a) => text.slice(a.start, a.end) === shadowMark(at).trim()) &&
					(!name || nameOf(el) === name.toLowerCase()),
			);
			if (!hit) throw new Error("This element is not in the file any more; reload the page");
			return locOf(text, hit.el);
		};
		// An inserted element gets a location no build gives (line 0), so it can be edited before the build too.
		const added = edit.action === "insert" ? `0:${overlay.ops.length + 1}` : undefined;
		const marked = (file: string) =>
			added && edit.action === "insert"
				? markFirst(
						edit.html,
						` data-wuppy-file="${file.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" data-wuppy-loc="${added}"`,
					)
				: undefined;
		if (use) {
			const { editInstance, passesClass } = await import("./instance-edit.ts");
			const hostJsx = !use.file.endsWith(".astro");
			const hostShadow = await this.shadowOf(overlay, root, use.file);
			const out = editInstance(
				hostShadow,
				inShadow(hostShadow, use.loc, use.tag, hostJsx),
				use,
				added && edit.action === "insert" ? { ...edit, html: markFirst(edit.html, shadowMark(added)) } : edit,
				{
					jsx: hostJsx,
					takesClass: passesClass(shadow, inShadow(shadow, loc, tag), tag, jsx),
					merge: await themeMerge(root),
				},
			);
			const next = firstMarks(out.source);
			await this.writeSource(use.file, unshadow(next));
			overlay.shadows[use.file] = next;
			const html = marked(use.file);
			overlay.ops.push({
				file: path,
				loc,
				...(tag ? { tag } : {}),
				host: { file: use.file, loc: use.loc, slot: use.slot },
				edit: html ? { action: "insert", html } : edit,
			});
			await writeOverlay(this.o.base, overlay);
			this.rebuildSoon();
			return added
				? { loc: added, file: use.file, reload: false, refresh: true }
				: { loc: edit.action === "delete" ? undefined : loc, slot: out.slot, reload: false, refresh: true };
		}
		const local: ElementEdit =
			edit.action === "moveTo"
				? { ...edit, loc: inShadow(shadow, edit.loc, edit.tag) }
				: added && edit.action === "insert"
					? { ...edit, html: markFirst(edit.html, shadowMark(added)) }
					: edit;
		let next: string;
		try {
			next = editAstroElement(shadow, inShadow(shadow, loc, tag), local, tag, jsx).source;
		} catch (e) {
			if (!(e instanceof ElementEditError) || edit.action !== "text" || edit.from === undefined) throw e;
			return {
				loc,
				reload: false,
				refresh: false,
				...(await this.textSourceBuilt(overlay, root, edit, path, loc, tag, e)),
			};
		}
		// A copy is new markup: no build location is on it.
		if (edit.action === "duplicate") next = firstMarks(next);
		await this.writeSource(path, unshadow(next));
		overlay.shadows[path] = next;
		const html = marked(path);
		overlay.ops.push({ file: path, loc, ...(tag ? { tag } : {}), edit: html ? { action: "insert", html } : edit });
		await writeOverlay(this.o.base, overlay);
		this.rebuildSoon();
		return {
			loc: edit.action === "delete" ? undefined : (added ?? loc),
			reload: false,
			// Text and attributes are on the canvas already; a new class needs the CSS the page now has for it.
			refresh: !(edit.action === "text" || (edit.action === "attrs" && !("class" in edit.attrs))),
		};
	}

	/** The file with each element's build location on it: the overlay's copy, or made from the file as built. */
	private async shadowOf(overlay: Overlay, root: string, path: string): Promise<string> {
		const source = await readFile(join(root, path), "utf8");
		const have = overlay.shadows[path];
		if (have === undefined) {
			const shift = themePageRel(root, join(root, path)) ? themeBodyShift(source) : 0;
			return markSource(source, path, (l) => shadowMark(shiftLine(l, shift)));
		}
		return unshadow(have) === source ? have : rebaseShadow(have, source);
	}

	/** Text made by code: the one string in the theme it comes from (see text-source.ts), and the file with it. */
	private async textSource(
		from: string,
		value: string,
		why: Error,
	): Promise<{ path: string; old: string; next: string; text: string }> {
		const files = (await this.sourceFiles())?.files ?? [];
		const spot = findTextSource(files, from, value);
		if (typeof spot === "number")
			throw spot > 1 ? new Error(`This text is written ${spot} times in the theme's code; edit it in Code view`) : why;
		const content = files.find((f) => f.path === spot.path)!.content;
		return {
			path: spot.path,
			old: content.slice(spot.start, spot.end),
			next: content.slice(0, spot.start) + spot.text + content.slice(spot.end),
			text: spot.text,
		};
	}

	/** Text made by code on a production server: the string changes in its file, and the page shows it at once. */
	private async textSourceBuilt(
		overlay: Overlay,
		root: string,
		edit: Extract<ElementEdit, { action: "text" }>,
		file: string,
		loc: string,
		tag: string | undefined,
		why: Error,
	): Promise<object> {
		const spot = await this.textSource(edit.from!, edit.value, why);
		// A marked file keeps its shadow in step, so later edits still find their elements.
		if (/\.(astro|[jt]sx)$/.test(spot.path)) {
			const shadow = await this.shadowOf(overlay, root, spot.path);
			const at = shadow.indexOf(spot.old);
			if (at === -1 || shadow.lastIndexOf(spot.old) !== at)
				throw new Error("This text is written more than once in its file; edit it in Code view");
			overlay.shadows[spot.path] = shadow.slice(0, at) + spot.text + shadow.slice(at + spot.old.length);
		}
		await this.writeSource(spot.path, spot.next);
		overlay.ops.push({ file, loc, ...(tag ? { tag } : {}), edit });
		await writeOverlay(this.o.base, overlay);
		this.rebuildSoon();
		return {};
	}

	/** Points the launcher at an installed theme (`null` = the built-in site) and restarts when possible. */
	async activate(repo: string | null): Promise<{ restarting: boolean }> {
		const file = join(this.dir, "active.json");
		if (repo === null) await rm(file, { force: true });
		else {
			if (!(await this.installed()).includes(repo)) throw new Error(`${repo} is not installed`);
			await mkdir(this.dir, { recursive: true });
			const dir = this.themeDir(repo).slice(this.o.base.length + 1);
			await writeFile(file, `${JSON.stringify({ repo, dir })}\n`);
			// The theme's Markdown pages show up in the site's Pages (kept if the site already has them).
			await importPages(this.o.base, this.themeDir(repo));
		}
		// The edits laid over the old theme's pages have no place on another one.
		await clearOverlay(this.o.base);
		this.pushPaths.clear();
		this.pushRepo = undefined;
		this.pushState = "idle";
		clearTimeout(this.pushTimer);
		return { restarting: this.o.restart?.() ?? false };
	}
}

/** Wuppy's GitHub OAuth app (client ids are public); WUPPY_GITHUB_CLIENT_ID points at another one. */
export const GITHUB_CLIENT_ID = "Ov23lijUhMVRYmyZFAcu";

/**
 * Per-user GitHub tokens from the OAuth web flow (`repo` scope: every repository the user can reach),
 * sealed with the site secret in the auth database.
 */
export class GithubAccounts {
	private readonly states = new Map<string, { userId: string; until: number }>();

	constructor(
		private readonly db: DatabaseSync,
		private readonly secret: string,
		private readonly app: {
			clientId: string;
			clientSecret: string;
			/** `<WUPPY_URL>/api/themes/github/callback`; the OAuth app's callback URL must be it or a parent of it. */
			redirectUri: string;
		},
		private readonly fetchFn: typeof fetch = fetch,
	) {
		db.exec("CREATE TABLE IF NOT EXISTS wuppy_github_tokens (user_id TEXT PRIMARY KEY, token_enc TEXT NOT NULL)");
		if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'user'").get())
			db.exec(`CREATE TRIGGER IF NOT EXISTS wuppy_github_tokens_user_deleted AFTER DELETE ON user
				BEGIN DELETE FROM wuppy_github_tokens WHERE user_id = OLD.id; END`);
	}

	get configured(): boolean {
		return !!(this.app.clientId && this.app.clientSecret);
	}

	token(userId: string): string | null {
		const row = this.db.prepare("SELECT token_enc FROM wuppy_github_tokens WHERE user_id = ?").get(userId) as
			{ token_enc: string } | undefined;
		return row ? open(this.secret, row.token_enc, userId, "wuppy-github-v1") : null;
	}

	disconnect(userId: string): void {
		this.db.prepare("DELETE FROM wuppy_github_tokens WHERE user_id = ?").run(userId);
	}

	/** GitHub's consent page; `state` ties the answer to this user and expires in 10 minutes. */
	authorizeUrl(userId: string): string {
		const state = randomBytes(24).toString("base64url");
		const now = Date.now();
		for (const [k, v] of this.states) if (v.until < now) this.states.delete(k);
		this.states.set(state, { userId, until: now + 10 * 60_000 });
		const q = new URLSearchParams({
			client_id: this.app.clientId,
			redirect_uri: this.app.redirectUri,
			scope: "repo",
			state,
			allow_signup: "false",
		});
		return `https://github.com/login/oauth/authorize?${q}`;
	}

	/** Exchanges GitHub's code for a token and stores it for the user who started the flow. */
	async finish(userId: string, code: string, state: string): Promise<void> {
		const s = this.states.get(state);
		this.states.delete(state);
		if (!s || s.userId !== userId || s.until < Date.now()) throw new Error("The GitHub sign-in expired. Try again.");
		const res = await this.fetchFn("https://github.com/login/oauth/access_token", {
			method: "POST",
			headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				client_id: this.app.clientId,
				client_secret: this.app.clientSecret,
				code,
				redirect_uri: this.app.redirectUri,
			}),
			signal: AbortSignal.timeout(15_000),
		});
		const r = (await res.json().catch(() => ({}))) as Record<string, string>;
		if (!res.ok || typeof r.access_token !== "string")
			throw new Error(r.error_description ?? r.error ?? `GitHub answered ${res.status}`);
		this.db
			.prepare("INSERT OR REPLACE INTO wuppy_github_tokens (user_id, token_enc) VALUES (?, ?)")
			.run(userId, seal(this.secret, r.access_token, userId, "wuppy-github-v1"));
	}
}
