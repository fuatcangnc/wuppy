import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { FieldType } from "../content-types/index.ts";
import { parseDocument } from "../content/parsers/frontmatter.ts";

const exec = promisify(execFile);

/**
 * `wuppy init`: wraps an existing Astro project. Finds its Markdown/MDX content collections, writes wuppy.config.mjs,
 * adds the integration (plus MDX, and a Node adapter when there is none) to astro.config, lets the content globs load
 * .mdx, and adds the dependencies to package.json.
 * Files are only patched when the pattern is recognised; otherwise the manual step is printed instead.
 */

const exists = (p: string) =>
	access(p).then(
		() => true,
		() => false,
	);
const read = (p: string) => readFile(p, "utf8").catch(() => null);

export interface FoundCollection {
	name: string;
	dir: string;
	format: "md" | "mdx";
	route?: string;
	fields: Record<string, FieldType>;
	files: number;
}

export interface InitPlan {
	collections: FoundCollection[];
	/** Collections Wuppy cannot edit (JSON/YAML data, remote loaders) with the reason. */
	skipped: string[];
	/** Things the integration would clash with, turned off in `wuppy({...})`. */
	integration: { sitemap?: false; robots?: false; rss?: false };
	components: string[];
	warnings: string[];
}

export const CONFIGS = ["astro.config.mjs", "astro.config.ts", "astro.config.js", "astro.config.mts"];
const CONTENT_CONFIGS = [
	"src/content.config.ts",
	"src/content.config.mjs",
	"src/content.config.js",
	"src/content/config.ts",
];

async function walk(dir: string): Promise<string[]> {
	const names = await readdir(dir, { recursive: true }).catch(() => [] as string[]);
	return names.map((n) => join(dir, n));
}

const IMAGE = /\.(png|jpe?g|webp|avif|gif|svg)$/i;
const DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/;

/** Guesses one field's type from the values it has across the existing files. */
export function inferField(key: string, values: unknown[]): FieldType {
	const present = values.filter((v) => v !== undefined && v !== null);
	const all = (test: (v: unknown) => boolean) => present.length > 0 && present.every(test);
	let type: FieldType;
	if (all((v) => typeof v === "boolean")) type = "boolean";
	else if (all((v) => typeof v === "number")) type = "number";
	else if (all((v) => v instanceof Date || (typeof v === "string" && DATE.test(v)))) type = "date";
	else if (all((v) => Array.isArray(v) && v.every((i) => typeof i === "string" && i.length <= 100))) type = "list";
	else if (all((v) => typeof v === "string")) {
		const strings = present as string[];
		if (/image|cover|thumbnail|photo|avatar|logo|banner/i.test(key) || strings.every((v) => IMAGE.test(v)))
			type = "image";
		else if (strings.some((v) => v.includes("\n") || v.length > 160)) type = "text";
		else type = "string";
	} else type = "json";
	// Present in every file: the site's own schema most likely requires it.
	return present.length === values.length && values.length > 0 ? { type, multiple: false, required: true } : type;
}

/** `const posts = defineCollection({ loader: glob({ pattern, base }) ... })` -> name, base, pattern. */
function collectionsFromConfig(
	source: string,
): Array<{ name: string; base?: string; pattern?: string; loader: string }> {
	const out: Array<{ name: string; base?: string; pattern?: string; loader: string }> = [];
	const re = /(?:const|let)\s+(\w+)\s*=\s*defineCollection\(\s*\{([\s\S]*?)\n\}\s*\)/g;
	for (const m of source.matchAll(re)) {
		const body = m[2] ?? "";
		const glob = /loader:\s*glob\(\s*\{([\s\S]*?)\}\s*\)/.exec(body)?.[1];
		const str = (key: string) => (glob ? new RegExp(`${key}:\\s*["'\`]([^"'\`]+)["'\`]`).exec(glob)?.[1] : undefined);
		out.push({
			name: m[1]!,
			base: str("base"),
			pattern: str("pattern"),
			loader: glob ? "glob" : (/loader:\s*(\w+)/.exec(body)?.[1] ?? "legacy"),
		});
	}
	return out;
}

/** The page that renders `getCollection("name")` with a [slug] param gives the public route. */
async function findRoute(root: string, name: string): Promise<string | undefined> {
	const pages = join(root, "src/pages");
	for (const file of await walk(pages)) {
		if (!/\[(\.\.\.)?slug\]\.(astro|mdx?|ts|js)$/.test(file)) continue;
		const src = await read(file);
		if (!src || !new RegExp(`get(Collection|Entry)\\(\\s*["'\`]${name}["'\`]`).test(src)) continue;
		const rel = relative(pages, file).split(/[\\/]/);
		rel[rel.length - 1] = "{slug}";
		return `/${rel.join("/")}`;
	}
	return undefined;
}

export async function planInit(root: string): Promise<InitPlan> {
	const plan: InitPlan = { collections: [], skipped: [], integration: {}, components: [], warnings: [] };
	let declared: Array<{ name: string; base?: string; pattern?: string; loader: string }> = [];
	for (const f of CONTENT_CONFIGS) {
		const src = await read(join(root, f));
		if (src) {
			declared = collectionsFromConfig(src);
			break;
		}
	}
	// Pre-loader projects keep each collection in src/content/<name>.
	if (declared.length === 0) {
		const dirs = await readdir(join(root, "src/content"), { withFileTypes: true }).catch(() => []);
		declared = dirs
			.filter((d) => d.isDirectory())
			.map((d) => ({ name: d.name, base: `src/content/${d.name}`, loader: "legacy" }));
	}

	const components = new Set<string>();
	for (const c of declared) {
		if (c.loader !== "glob" && c.loader !== "legacy") {
			plan.skipped.push(`${c.name}: uses the "${c.loader}" loader, only file collections can be edited`);
			continue;
		}
		const dir = (c.base ?? `src/content/${c.name}`).replace(/^\.\//, "").replace(/\/$/, "");
		const files = (await walk(join(root, dir))).filter((f) => /\.(md|mdx)$/.test(f));
		if (files.length === 0 && !/mdx?/.test(c.pattern ?? "")) {
			plan.skipped.push(`${c.name}: no Markdown or MDX files (data collections stay as they are)`);
			continue;
		}
		// New entries are MDX when Astro will load .mdx from here (patchContentConfig widens a `*.md` glob); existing
		// .md files stay Markdown. Both kinds are editable.
		const format = !c.pattern || /mdx|\.md$/.test(c.pattern) ? "mdx" : "md";
		if (format === "md") plan.warnings.push(`${c.name}: its glob does not load .mdx, so new entries stay Markdown`);
		const values = new Map<string, unknown[]>();
		const editable = files;
		for (const [i, file] of editable.entries()) {
			const src = (await read(file)) ?? "";
			let data: Record<string, unknown> = {};
			try {
				data = parseDocument(src).data;
			} catch {
				plan.warnings.push(`${relative(root, file)}: frontmatter is not valid YAML`);
			}
			for (const key of Object.keys(data)) if (!values.has(key)) values.set(key, Array(i).fill(undefined));
			for (const [key, list] of values) list.push(data[key]);
			if (file.endsWith(".mdx")) for (const m of src.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)) components.add(m[1]!);
		}
		const fields = Object.fromEntries([...values].map(([key, list]) => [key, inferField(key, list)]));
		const route = await findRoute(root, c.name);
		if (!route)
			plan.warnings.push(`${c.name}: no page renders it with a [slug] param; set "route" in wuppy.config.mjs`);
		plan.collections.push({ name: c.name, dir, format, route, fields, files: editable.length });
	}
	plan.components = [...components].toSorted();

	const pages = (await walk(join(root, "src/pages"))).map((f) => relative(join(root, "src/pages"), f));
	// @astrojs/sitemap writes /sitemap-index.xml, so it does not clash; it only lists prerendered pages, Wuppy's covers live ones.
	if (pages.some((p) => p.startsWith("sitemap.xml")) || (await exists(join(root, "public/sitemap.xml"))))
		plan.integration.sitemap = false;
	if ((await exists(join(root, "public/robots.txt"))) || pages.some((p) => p.startsWith("robots.txt")))
		plan.integration.robots = false;
	if (pages.some((p) => p.startsWith("rss.xml"))) plan.integration.rss = false;
	for (const taken of ["admin", "api", "uploads"])
		if (pages.some((p) => p === taken || p.startsWith(`${taken}/`) || p.startsWith(`${taken}.`)))
			plan.warnings.push(`src/pages/${taken} exists; Wuppy serves /${taken}, rename yours to avoid a clash`);
	return plan;
}

async function findAstroConfig(root: string) {
	for (const f of CONFIGS) {
		const source = await read(join(root, f));
		if (source !== null) return { file: f, source };
	}
	return null;
}

/** The Node adapter and MDX releases that match the Astro version Wuppy supports. */
export const NODE_ADAPTER = "^11.1.5";
export const MDX_INTEGRATION = "^8.1.0";

/** Lets glob loaders that read only `.md` read `.mdx` too: `pattern: "**\/*.md"` -> `"**\/*.{md,mdx}"`. */
export function patchContentConfig(source: string): string {
	return source.replace(/(pattern:\s*["'`][^"'`]*?)\.md(["'`])/g, "$1.{md,mdx}$2");
}

/** Adds `wuppy(...)`, `mdx()` and a Node adapter when missing. Returns null when the config shape is not recognised. */
export function patchAstroConfig(source: string, integration: InitPlan["integration"]): string | null {
	if (/wuppy\/astro/.test(source)) return source;
	const off = Object.keys(integration);
	const options = off.length ? `{ ${off.map((k) => `${k}: false`).join(", ")} }` : "";
	const mdx = !/@astrojs\/mdx/.test(source);
	const call = `wuppy(${options})${mdx ? ", mdx()" : ""}`;
	const tab = /^([ \t]+)\S/m.exec(source)?.[1] ?? "\t";
	let out = source;
	if (/integrations:\s*\[/.test(out)) out = out.replace(/integrations:\s*\[/, `integrations: [${call}, `);
	else if (/defineConfig\(\s*\{/.test(out))
		out = out.replace(/defineConfig\(\s*\{/, `defineConfig({\n${tab}integrations: [${call}],`);
	else return null;
	const imports = ['import wuppy from "wuppy/astro";'];
	if (mdx) imports.push('import mdx from "@astrojs/mdx";');
	if (!/\badapter\s*:/.test(out)) {
		out = out.replace(/defineConfig\(\s*\{/, `defineConfig({\n${tab}adapter: node({ mode: "standalone" }),`);
		imports.push('import node from "@astrojs/node";');
	}
	const lastImport = [...out.matchAll(/^import .*$/gm)].at(-1);
	const at = lastImport ? lastImport.index + lastImport[0].length + 1 : 0;
	return `${out.slice(0, at)}${imports.join("\n")}\n${out.slice(at)}`;
}

/** Renders wuppy.config.mjs; every value stays editable by hand afterwards. */
export function renderConfig(plan: InitPlan, site: { url?: string; name: string }): string {
	const config = {
		...(site.url ? { site: { url: site.url, name: site.name } } : {}),
		...(plan.components.length ? { components: plan.components } : {}),
		collections: plan.collections.map(({ name, dir, format, route, fields }) => ({
			name,
			dir,
			format,
			...(route ? { route } : {}),
			fields,
		})),
	};
	return `// Made by \`wuppy init\` from the files already in this project. Fields are guessed from the frontmatter; adjust freely.\nexport default ${JSON.stringify(config, null, "\t")};\n`;
}

const IGNORE = [
	"# Wuppy: runtime state stays local; .wuppy/data (menus, settings) is content and is committed",
	".wuppy/*",
	"!.wuppy/data/",
	".env",
];

export async function init(
	root: string,
	{ force = false, version = "latest" } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
	const astro = await findAstroConfig(root);
	if (!astro)
		return {
			code: 1,
			stdout: "",
			stderr: "No astro.config found here. Run `wuppy init` in the root of an Astro project.",
		};
	if (!force && (await exists(join(root, "wuppy.config.mjs"))))
		return { code: 1, stdout: "", stderr: "wuppy.config.mjs already exists (use --force to replace it)." };

	const plan = await planInit(root);
	if (plan.collections.length === 0)
		return { code: 1, stdout: "", stderr: `No Markdown/MDX content collections found.\n${plan.skipped.join("\n")}` };

	const pkgPath = join(root, "package.json");
	const pkg = JSON.parse((await read(pkgPath)) ?? "{}") as { name?: string; dependencies?: Record<string, string> };
	const siteUrl = /\bsite:\s*["'`]([^"'`]+)["'`]/.exec(astro.source)?.[1];
	await writeFile(join(root, "wuppy.config.mjs"), renderConfig(plan, { url: siteUrl, name: pkg.name ?? "Site" }));

	const lines = [`Wrote wuppy.config.mjs with ${plan.collections.length} collection(s):`];
	for (const c of plan.collections)
		lines.push(
			`  ${c.name.padEnd(16)} ${c.dir} (${c.files} .${c.format}, ${Object.keys(c.fields).length} fields) -> ${c.route ?? "route not found"}`,
		);
	for (const s of plan.skipped) lines.push(`  skipped ${s}`);

	const patched = patchAstroConfig(astro.source, plan.integration);
	const adds = (pkgName: string) =>
		patched !== null && patched.includes(`from "${pkgName}"`) && !astro.source.includes(pkgName);
	const addsAdapter = adds("@astrojs/node");
	const addsMdx = adds("@astrojs/mdx");
	if (patched === null) {
		plan.warnings.push(
			`${astro.file}: add \`import wuppy from "wuppy/astro"\` and \`wuppy()\` to integrations by hand (plus a server adapter)`,
		);
	} else if (patched !== astro.source) {
		await writeFile(join(root, astro.file), patched);
		lines.push(
			`Added wuppy()${addsMdx ? ", mdx()" : ""}${addsAdapter ? " and the Node adapter" : ""} to ${astro.file}`,
		);
	}
	for (const f of CONTENT_CONFIGS) {
		const source = await read(join(root, f));
		if (source === null) continue;
		const widened = patchContentConfig(source);
		if (widened !== source) {
			await writeFile(join(root, f), widened);
			lines.push(`Content globs in ${f} now load .mdx too`);
		}
		break;
	}

	pkg.dependencies = { ...pkg.dependencies, wuppy: pkg.dependencies?.wuppy ?? version };
	if (addsAdapter) pkg.dependencies["@astrojs/node"] ??= NODE_ADAPTER;
	if (addsMdx) pkg.dependencies["@astrojs/mdx"] ??= MDX_INTEGRATION;
	await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

	const gitignore = (await read(join(root, ".gitignore"))) ?? "";
	if (!gitignore.includes(".wuppy/*"))
		await writeFile(join(root, ".gitignore"), `${gitignore.replace(/\n?$/, "\n")}${IGNORE.join("\n")}\n`);
	const env = (await read(join(root, ".env"))) ?? "";
	if (!/^WUPPY_SECRET=/m.test(env))
		await writeFile(
			join(root, ".env"),
			`${env.replace(/\n?$/, env ? "\n" : "")}WUPPY_SECRET=${randomBytes(32).toString("base64url")}\nWUPPY_URL=http://localhost:4321\n`,
			{ mode: 0o600 },
		);

	for (const w of plan.warnings) lines.push(`warning: ${w}`);
	lines.push("", "Next: install dependencies (npm install / pnpm install), then run the dev server and open /admin.");
	return { code: 0, stdout: lines.join("\n") + "\n", stderr: "" };
}

export interface GithubRepo {
	repo: string;
	private: boolean;
	description: string;
}

type Run = (cmd: string, args: string[]) => Promise<{ stdout: string }>;
const run: Run = (cmd, args) => exec(cmd, args, { maxBuffer: 64 * 1024 * 1024 });

// One GraphQL call per 100 repos; each repo's package.json comes along, so Astro sites are found without cloning.
export const REPOS_QUERY = `query($endCursor: String) { viewer { repositories(first: 100, after: $endCursor,
  ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER], orderBy: {field: PUSHED_AT, direction: DESC}) {
  pageInfo { hasNextPage endCursor }
  nodes { nameWithOwner isPrivate description object(expression: "HEAD:package.json") { ... on Blob { text } } } } } }`;

/** The signed-in GitHub user's repositories that depend on Astro, newest push first. Needs the GitHub CLI (`gh`). */
export async function astroRepos(sh: Run = run): Promise<GithubRepo[]> {
	const { stdout } = await sh("gh", [
		"api",
		"graphql",
		"--paginate",
		"-f",
		`query=${REPOS_QUERY}`,
		"--jq",
		'.data.viewer.repositories.nodes[] | {repo: .nameWithOwner, private: .isPrivate, description: (.description // ""), pkg: (.object.text // "")}',
	]);
	return astroOnly(
		stdout
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line) as GithubRepo & { pkg: string }),
	);
}

/** Keeps the repos whose root package.json depends on Astro. */
export const astroOnly = (repos: (GithubRepo & { pkg: string })[]): GithubRepo[] =>
	repos
		// shortcut: only the root package.json is checked; an Astro site inside a monorepo folder is not listed, pass its URL.
		.filter((r) => /"astro"\s*:/.test(r.pkg))
		.map((r) => ({ repo: r.repo, private: r.private, description: r.description }));

async function askRepo(repos: GithubRepo[]): Promise<GithubRepo | undefined> {
	const { createInterface } = await import("node:readline/promises");
	const rl = createInterface({ input: process.stdin, output: process.stderr });
	repos.forEach((r, i) =>
		process.stderr.write(
			`${String(i + 1).padStart(3)}. ${r.repo}${r.private ? " (private)" : ""}${r.description ? `  ${r.description}` : ""}\n`,
		),
	);
	const answer = await rl.question("Repository to wrap (number): ").finally(() => rl.close());
	return repos[Number(answer) - 1];
}

const failed = (what: string, e: unknown) => ({
	code: 1,
	stdout: "",
	stderr: `${what} failed: ${(e as { stderr?: string }).stderr?.trim() || (e as Error).message}`,
});

/**
 * `wuppy import <git-url> <dir>`: clone a repository, then wrap it.
 * `wuppy import` with no URL lists the user's Astro repositories on GitHub to pick from (via `gh`, so private repos work).
 */
export async function importRepo(
	url: string,
	dir: string,
	cwd: string,
	deps: { exec?: Run; choose?: (repos: GithubRepo[]) => Promise<GithubRepo | undefined> } = {},
) {
	const sh = deps.exec ?? run;
	if (!url) {
		let repos: GithubRepo[];
		try {
			repos = await astroRepos(sh);
		} catch (e) {
			return failed("Listing GitHub repositories (needs the GitHub CLI: install gh, run `gh auth login`)", e);
		}
		if (repos.length === 0)
			return { code: 1, stdout: "", stderr: "No Astro repositories found on your GitHub account." };
		const picked = await (deps.choose ?? askRepo)(repos);
		if (!picked) return { code: 1, stdout: "", stderr: "No repository picked." };
		const target = resolve(cwd, dir || picked.repo.split("/")[1]!);
		try {
			await sh("gh", ["repo", "clone", picked.repo, target]);
		} catch (e) {
			return failed("gh repo clone", e);
		}
		return init(target);
	}
	// A leading "-" would be read by git as an option (e.g. --upload-pack).
	if (url.startsWith("-") || !dir || dir.startsWith("-"))
		return { code: 1, stdout: "", stderr: "Usage: wuppy import [<git-url> <dir>]" };
	const target = resolve(cwd, dir);
	try {
		await sh("git", ["clone", "--", url, target]);
	} catch (e) {
		return failed("git clone", e);
	}
	return init(target);
}
