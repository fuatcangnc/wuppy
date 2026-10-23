import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../../src/cli/index.ts";
import { compareVersions, MIGRATIONS } from "../../src/cli/upgrade.ts";
import { capabilityHash } from "../../src/plugins/loader.ts";

let root: string;
beforeEach(async () => void (root = await mkdtemp(join(tmpdir(), "wuppy-cli-"))));
afterEach(() => rm(root, { recursive: true, force: true }));

describe("wuppy plugin hash", () => {
	it("prints the capabilities to review and the approve value", async () => {
		const manifest = { id: "p", version: "1.0.0", capabilities: { content: { read: ["posts"] } } };
		await mkdir(join(root, "plugins/p"), { recursive: true });
		await writeFile(join(root, "plugins/p/manifest.json"), JSON.stringify(manifest));
		const out = await run(["plugin", "hash", "plugins/p"], root);
		expect(out.code).toBe(0);
		expect(out.stdout).toContain(`approve: "${capabilityHash(manifest)}"`);
		expect(out.stdout).toContain("posts");
	});

	it("explains usage and fails on unknown commands", async () => {
		expect((await run(["nope"], root)).code).toBe(1);
		expect((await run(["plugin", "hash"], root)).stderr).toMatch(/usage/i);
	});

	it("reports a missing manifest clearly", async () => {
		const out = await run(["plugin", "hash", "plugins/none"], root);
		expect(out.code).toBe(1);
		expect(out.stderr).toMatch(/manifest/i);
	});
});

describe("wuppy doctor", () => {
	const secret = { WUPPY_SECRET: "x".repeat(32) };
	it("passes for a healthy project", async () => {
		await mkdir(join(root, "content/posts"), { recursive: true });
		await mkdir(join(root, ".git"));
		await writeFile(
			join(root, "wuppy.config.mjs"),
			`export default { collections: [{ name: "posts", dir: "content/posts" }] };`,
		);
		const out = await run(["doctor"], root, secret);
		expect(out.code).toBe(0);
		expect(out.stdout).not.toContain("FAIL");
	});
	it("flags a short secret, a missing content dir and a missing repo", async () => {
		await writeFile(
			join(root, "wuppy.config.mjs"),
			`export default { collections: [{ name: "posts", dir: "content/posts" }] };`,
		);
		const out = await run(["doctor"], root, { WUPPY_SECRET: "short" });
		expect(out.code).toBe(1);
		expect(out.stdout).toMatch(/FAIL WUPPY_SECRET/);
		expect(out.stdout).toMatch(/FAIL content dir content\/posts/);
		expect(out.stdout).toMatch(/FAIL Git repository/);
	});
	it("reports a missing config", async () => {
		const out = await run(["doctor"], root, secret);
		expect(out.code).toBe(1);
		expect(out.stdout).toMatch(/FAIL wuppy.config loads/);
	});
});

describe("wuppy types", () => {
	it("writes frontmatter types for every collection", async () => {
		await writeFile(
			join(root, "wuppy.config.mjs"),
			`export default { collections: [{ name: "blog-posts", dir: "c", fields: { title: { type: "string", required: true }, kind: { type: "select", options: ["a","b"] }, n: "number" } }] };`,
		);
		const out = await run(["types"], root);
		expect(out.code).toBe(0);
		const dts = await readFile(join(root, "wuppy-env.d.ts"), "utf8");
		expect(dts).toContain("export type BlogPostsData");
		expect(dts).toContain('"title": string');
		expect(dts).toContain('"kind"?: "a" | "b"');
		expect(dts).toContain('"n"?: number');
	});
});

const install = (version: string) =>
	mkdir(join(root, "node_modules/wuppy"), { recursive: true }).then(() =>
		writeFile(join(root, "node_modules/wuppy/package.json"), JSON.stringify({ version })),
	);

describe("wuppy upgrade", () => {
	it("records the installed version and is a no-op the second time", async () => {
		await install("0.2.0");
		const first = await run(["upgrade"], root);
		expect(first.code).toBe(0);
		expect(first.stdout).toContain("0.0.0 -> 0.2.0");
		expect(JSON.parse(await readFile(join(root, ".wuppy/version.json"), "utf8"))).toEqual({ version: "0.2.0" });
		expect((await run(["upgrade"], root)).stdout).toContain("0.2.0 -> 0.2.0");
	});

	it("refuses to run without an install or to downgrade", async () => {
		expect((await run(["upgrade"], root)).stderr).toMatch(/not installed/);
		await install("0.1.0");
		await mkdir(join(root, ".wuppy"));
		await writeFile(join(root, ".wuppy/version.json"), JSON.stringify({ version: "0.3.0" }));
		expect((await run(["upgrade"], root)).stderr).toMatch(/older than the data/);
	});

	it("compares versions numerically", () => {
		expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
		expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBe(0);
	});

	it("runs pending migrations in order and demands a clean Git tree", async () => {
		const ran: string[] = [];
		MIGRATIONS.push(
			{ to: "0.2.0", title: "a", run: async () => void ran.push("a") },
			{ to: "9.0.0", title: "future", run: async () => void ran.push("future") },
		);
		try {
			await install("0.2.0");
			await promisify(execFile)("git", ["init", "-q"], { cwd: root });
			const dirty = await run(["upgrade"], root);
			expect(dirty.stderr).toMatch(/Commit or stash/);
			expect(ran).toEqual([]);
			const out = await run(["upgrade", "--force"], root);
			expect(out.code).toBe(0);
			expect(ran).toEqual(["a"]);
			expect(out.stdout).toContain("- a");
		} finally {
			MIGRATIONS.length = 0;
		}
	});
});

async function project() {
	const files: Record<string, string> = {
		"package.json": JSON.stringify({ name: "acme-site", dependencies: { astro: "^5" } }),
		"astro.config.mjs": `import { defineConfig } from "astro/config";\nimport sitemap from "@astrojs/sitemap";\n\nexport default defineConfig({\n\tsite: "https://acme.test",\n\tintegrations: [sitemap()],\n});\n`,
		"src/content.config.ts": `import { defineCollection } from "astro:content";\nimport { glob, file } from "astro/loaders";\nconst posts = defineCollection({\n\tloader: glob({ pattern: "**/*.md", base: "./src/content/posts" }),\n});\nconst couriers = defineCollection({\n\tloader: glob({ pattern: "**/*.json", base: "./src/data/couriers" }),\n});\nexport const collections = { posts, couriers };\n`,
		"src/content/posts/a.md":
			"---\ntitle: A\npubDate: 2024-01-02\ndraft: false\ntags: [x, y]\nheroImage: /a.png\n---\nHi\n",
		"src/content/posts/b.md": "---\ntitle: B\npubDate: 2024-02-03\ndraft: true\n---\nYo\n",
		"src/data/couriers/c.json": "{}",
		"src/pages/blog/[...slug].astro": `---\nimport { getCollection } from "astro:content";\nconst posts = await getCollection("posts");\n---\n`,
		"public/robots.txt": "User-agent: *\n",
	};
	for (const [name, text] of Object.entries(files)) {
		await mkdir(join(root, name, ".."), { recursive: true });
		await writeFile(join(root, name), text);
	}
}

describe("wuppy init", () => {
	it("wraps an existing Astro project: config from its collections, integration, deps, gitignore, secret", async () => {
		await project();
		const out = await run(["init"], root);
		expect(out.stderr).toBe("");
		expect(out.code).toBe(0);
		const config = (await import(join(root, "wuppy.config.mjs"))).default;
		expect(config.site).toEqual({ url: "https://acme.test", name: "acme-site" });
		expect(config.collections).toEqual([
			{
				name: "posts",
				dir: "src/content/posts",
				format: "mdx",
				map: { pubDate: "date", heroImage: "cover" },
				route: "/blog/{slug}",
				fields: {
					title: { type: "string", multiple: false, required: true },
					pubDate: { type: "date", multiple: false, required: true },
					draft: { type: "boolean", multiple: false, required: true },
					tags: "list",
					heroImage: "image",
				},
			},
		]);
		expect(out.stdout).toMatch(/skipped couriers/);
		const astro = await readFile(join(root, "astro.config.mjs"), "utf8");
		expect(astro).toContain('import wuppy from "wuppy/astro";');
		expect(astro).toContain("integrations: [wuppy({ robots: false }), mdx(), sitemap()]");
		expect(astro).toContain("@astrojs/mdx");
		expect(astro).toContain('adapter: node({ mode: "standalone" })');
		const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
		expect(pkg.dependencies).toMatchObject({
			astro: "^5",
			wuppy: "latest",
			"@astrojs/node": expect.any(String),
		});
		expect(pkg.dependencies["@astrojs/mdx"]).toEqual(expect.any(String));
		expect(await readFile(join(root, ".gitignore"), "utf8")).toContain("!.wuppy/data/");
		expect(await readFile(join(root, ".env"), "utf8")).toMatch(/^WUPPY_SECRET=\S{40,}$/m);
		// The written config is accepted by Wuppy itself.
		const { loadConfig } = await import("../../src/config/index.ts");
		expect((await loadConfig(root)).collections[0]?.route).toBe("/blog/{slug}");
	});

	it("maps a theme's blog and about collections to Posts and Pages", async () => {
		await project();
		const config = `const blog = defineCollection({ loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }) });\nconst about = defineCollection({ loader: glob({ pattern: "**/*.md", base: "./src/content/about" }) });\nexport const collections = { blog, about };\n`;
		await writeFile(
			join(root, "src/content.config.ts"),
			`import { defineCollection } from "astro:content";\nimport { glob } from "astro/loaders";\n${config}`,
		);
		await rm(join(root, "src/content/posts"), { recursive: true });
		await mkdir(join(root, "src/content/blog"), { recursive: true });
		await mkdir(join(root, "src/content/about"), { recursive: true });
		await writeFile(join(root, "src/content/blog/a.md"), "---\ntitle: A\npubDate: 2024-01-02\n---\nHi\n");
		await writeFile(join(root, "src/content/about/me.md"), "---\ntitle: Me\n---\nHi\n");
		const { planInit } = await import("../../src/cli/init.ts");
		const kinds = (await planInit(root)).collections.map(({ name, kind }) => [name, kind]);
		expect(Object.fromEntries(kinds)).toEqual({ blog: "posts", about: "pages" });
		expect((await planInit(root)).collections.find((c) => c.name === "blog")?.map).toEqual({ pubDate: "date" });
	});

	it("refuses outside an Astro project and does not overwrite an existing config", async () => {
		expect((await run(["init"], root)).stderr).toMatch(/astro\.config/);
		await project();
		await writeFile(join(root, "wuppy.config.mjs"), "export default {}");
		expect((await run(["init"], root)).stderr).toMatch(/--force/);
	});

	it("import refuses option-like arguments", async () => {
		expect((await run(["import", "--upload-pack=x", "dir"], root)).code).toBe(1);
		expect((await run(["import", "url"], root)).stderr).toMatch(/usage/i);
	});
});

describe("wuppy mdx-to-md", () => {
	it("converts plain .mdx entries to .md and keeps the ones with components", async () => {
		await mkdir(join(root, "content"), { recursive: true });
		await writeFile(
			join(root, "content/a.mdx"),
			'---\ntitle: A\n---\nimport X from "./x";\n\n<p className="a">hi</p>\n',
		);
		await writeFile(join(root, "content/b.mdx"), "<Callout />\n");
		const out = await run(["mdx-to-md", "content"], root);
		expect(out.code).toBe(0);
		expect(out.stdout).toMatch(/converted content\/a\.mdx/);
		expect(out.stdout).toMatch(/kept\s+content\/b\.mdx: Callout/);
		expect(await readFile(join(root, "content/a.md"), "utf8")).toBe('---\ntitle: A\n---\n<p class="a">hi</p>\n');
		await expect(readFile(join(root, "content/a.mdx"), "utf8")).rejects.toThrow();
		expect(await readFile(join(root, "content/b.mdx"), "utf8")).toBe("<Callout />\n");
	});
});
