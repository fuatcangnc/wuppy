import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { lstat, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import { loadConfig } from "../config/index.ts";
import { open, seal } from "../security/secret-box.ts";
import { astroOnly, CONFIGS, init, NODE_ADAPTER, REPOS_QUERY, type GithubRepo } from "../cli/init.ts";
import { themeBodyShift, themePageRel } from "../astro/theme-pages.ts";
import { editAstroElement, type ElementEdit } from "./astro-edit.ts";
import { importDemo, importPages } from "./site.ts";

/** `"12:5"` moved by `n` lines. */
const shiftLine = (loc: string, n: number) => loc.replace(/^\d+/, (line) => String(Number(line) + n));

/**
 * A GitHub repository as this site's theme: the server clones it under `.wuppy/themes/`, wraps it (`wuppy init`),
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
			headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "user-agent": "wuppy" },
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
const SOURCE_SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".astro", ".wuppy", "coverage"]);
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

export class GithubThemes {
	job: ThemeJob | null = null;
	private readonly dir: string;

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

	private async build(job: ThemeJob, token: string): Promise<void> {
		const run = this.o.run ?? defaultRun;
		const dir = this.themeDir(job.repo);
		await mkdir(this.dir, { recursive: true });
		// A theme that never built is cloned again, so a fix pushed to GitHub after a failed install is picked up.
		// shortcut: a built theme is kept as is (local code edits); pulling into it needs a merge, add when asked.
		if (!(await this.installed()).includes(job.repo)) await rm(dir, { recursive: true, force: true });
		if (!existsSync(join(dir, ".git"))) {
			const auth = Buffer.from(`x-access-token:${token}`).toString("base64");
			await rm(dir, { recursive: true, force: true });
			await run("git", ["clone", "--", `https://github.com/${job.repo}.git`, dir], {
				cwd: this.dir,
				env: cleanEnv({
					GIT_TERMINAL_PROMPT: "0",
					// Passed in the environment, not argv or .git/config, so it is not stored or listed.
					GIT_CONFIG_COUNT: "1",
					GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
					GIT_CONFIG_VALUE_0: `Authorization: Basic ${auth}`,
				}),
			}).catch(async (e: unknown) => {
				await rm(dir, { recursive: true, force: true });
				throw e;
			});
		}
		job.step = "Wrapping";
		if (!existsSync(join(dir, "wuppy.config.mjs"))) {
			const hadEnv = existsSync(join(dir, ".env"));
			const r = await init(dir);
			if (r.code !== 0) throw new Error(r.stderr || "wuppy init failed");
			// init writes a fresh secret for local use; the server's own environment is the one to use.
			if (!hadEnv) await rm(join(dir, ".env"), { force: true });
		}
		// Wuppy itself is linked from this server below; npm would look for it in the registry.
		const pkgPath = join(dir, "package.json");
		const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as Record<string, Record<string, string> | undefined>;
		delete pkg.dependencies?.wuppy;
		delete pkg.devDependencies?.wuppy;
		// Wuppy runs sites on Node; a repo made for Cloudflare or Vercel is built with the Node adapter instead.
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
		const link = join(dir, "node_modules", "wuppy");
		await rm(link, { recursive: true, force: true });
		await symlink(realpathSync(join(this.o.base, "node_modules", "wuppy")), link, "dir");
		job.step = "Building";
		await run(
			process.execPath,
			[join(dir, "node_modules", "astro", "bin", "astro.mjs"), "build", "--config", "astro.wuppy.config.mjs"],
			{
				cwd: dir,
				env: cleanEnv({ NODE_ENV: "production" }),
			},
		);
		if (!existsSync(join(dir, "dist", "server", "entry.mjs")))
			throw new Error("The build has no server entry (dist/server/entry.mjs).");
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
		void this.build(job, "").then(
			() => {
				job.status = "done";
				job.step = "Done";
				this.o.restart?.();
			},
			(e: Error & { stderr?: string }) => {
				job.status = "failed";
				job.error = (e.stderr?.trim() || e.message).slice(-2000);
			},
		);
		return job;
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
	}

	/**
	 * Edits one element of the active theme's `.astro` files in place (see astro-edit.ts). `file` and `loc` are what
	 * Astro's dev server put on the element (`data-astro-source-file`, `data-astro-source-loc`); returns its new `loc`.
	 */
	async editElement(file: string, loc: string, edit: ElementEdit, tag?: string): Promise<{ loc?: string }> {
		const active = await this.activeTheme();
		if (!active) throw new Error("No active theme");
		const root = resolve(active.dir);
		const path = relative(root, resolve(root, file)).split(sep).join("/");
		if (path.startsWith("..") || !path.endsWith(".astro")) throw new Error("Only the active theme's .astro files");
		const source = await readFile(join(root, path), "utf8");
		// A theme page's template lines move when its body slot cannot share the frontmatter's first line.
		const shift = themePageRel(root, join(root, path)) ? themeBodyShift(source) : 0;
		const out = editAstroElement(source, shiftLine(loc, -shift), edit, tag);
		await this.writeSource(path, out.source);
		return { loc: out.loc && shiftLine(out.loc, shift) };
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
