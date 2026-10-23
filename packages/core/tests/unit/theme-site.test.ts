import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLive } from "../../src/astro/live-runtime.ts";
import { themePageRel } from "../../src/astro/theme-pages.ts";
import { importDemo, importPages, linkTheme } from "../../src/themes/site.ts";

let site: string;
let theme: string;
beforeEach(async () => {
	site = await mkdtemp(join(tmpdir(), "wuppy-site-"));
	theme = join(site, ".wuppy/themes/me__theme");
	await mkdir(join(site, "content/posts"), { recursive: true });
	await mkdir(join(theme, "src/content/blog"), { recursive: true });
	await writeFile(
		join(site, "wuppy.config.mjs"),
		`export default { collections: [{ name: "posts", dir: "content/posts", route: "/posts/{slug}", fields: { title: "string", date: "date" } }, { name: "pages", dir: "content/pages", fields: { title: "string" } }] };`,
	);
	await writeFile(
		join(theme, "wuppy.config.mjs"),
		`export default { collections: [{ name: "blog", dir: "src/content/blog", kind: "posts", map: { pubDate: "date" }, route: "/{slug}", fields: { title: "string", pubDate: "date", pinned: "boolean" } }, { name: "projects", dir: "src/content/projects", fields: { title: "string" } }] };`,
	);
});
afterEach(() => rm(site, { recursive: true, force: true }));

describe("theme content lives in the site", () => {
	it("links a theme's blog to the site's posts, adds its extra fields and route", () => {
		const { collections, links } = linkTheme(
			[
				{
					name: "posts",
					dir: "content/posts",
					format: "md",
					route: "/posts/{slug}",
					fields: { title: "string", date: "date" },
				},
			],
			[
				{
					name: "blog",
					dir: "src/content/blog",
					format: "md",
					kind: "posts",
					map: { pubDate: "date" },
					route: "/{slug}",
					fields: { pubDate: "date", pinned: "boolean" },
				},
				{ name: "projects", dir: "src/content/projects", format: "md", fields: { title: "string" } },
			],
		);
		expect(collections[0]).toMatchObject({
			name: "posts",
			route: "/{slug}",
			fields: { title: "string", date: "date", pinned: "boolean" },
		});
		expect(collections[1]).toMatchObject({ name: "projects", dir: "content/projects" });
		expect(links).toEqual([
			{ name: "blog", dir: "content/posts", rename: { date: "pubDate" } },
			{ name: "projects", dir: "content/projects", rename: {} },
		]);
	});

	it("imports the theme's .md and .mdx sample entries once, renamed, without overwriting the site's", async () => {
		await writeFile(join(theme, "src/content/blog/hello.md"), "---\ntitle: Demo\npubDate: 2024-01-02\n---\nHi\n");
		await writeFile(
			join(theme, "src/content/blog/callout.mdx"),
			"---\ntitle: Callout\npubDate: 2024-01-03\n---\nimport Callout from '../../components/Callout.astro';\n\n<Callout />\n",
		);
		await writeFile(join(theme, "src/content/blog/mine.md"), "---\ntitle: Demo\n---\nHi\n");
		await writeFile(join(site, "content/posts/mine.md"), "---\ntitle: Mine\n---\nKeep\n");
		expect(await importDemo(site, theme)).toEqual([
			join("content/posts", "callout.mdx"),
			join("content/posts", "hello.md"),
		]);
		expect(await readFile(join(site, "content/posts/hello.md"), "utf8")).toContain("date: 2024-01-02");
		const callout = await readFile(join(site, "content/posts/callout.mdx"), "utf8");
		expect(callout).toContain("<Callout />");
		expect(callout).not.toContain("import Callout");
		expect(await readFile(join(site, "content/posts/mine.md"), "utf8")).toContain("Keep");
	});

	it("imports the theme's static Markdown and Astro pages into the site's Pages, without the layout or overwriting", async () => {
		await mkdir(join(theme, "src/pages/docs"), { recursive: true });
		await mkdir(join(theme, "src/pages/posts"), { recursive: true });
		await writeFile(
			join(theme, "src/pages/about.md"),
			"---\nlayout: ../layouts/About.astro\ntitle: About\n---\n\nHi\n",
		);
		await writeFile(join(theme, "src/pages/docs/intro.mdx"), "---\ntitle: Intro\n---\n\nX\n");
		await writeFile(join(theme, "src/pages/posts/[slug].md"), "x");
		await writeFile(join(theme, "src/pages/_draft.md"), "x");
		await writeFile(join(theme, "src/pages/index.astro"), "x");
		await writeFile(join(theme, "src/pages/docs/getting-started.astro"), "x");
		await writeFile(join(theme, "src/pages/rss.xml.js"), "x");
		await mkdir(join(site, "content/pages/docs"), { recursive: true });
		await writeFile(join(site, "content/pages/docs/intro.md"), "---\ntitle: Mine\n---\n\nmine\n");
		await writeFile(
			join(site, "wuppy.config.mjs"),
			`export default { collections: [{ name: "pages", dir: "content/pages", fields: { title: "string", description: { type: "string", required: true } } }] };`,
		);
		expect(await importPages(site, theme)).toEqual(
			["about.md", "docs/getting-started.md", "index.md"].map((f) => join("content/pages", f)),
		);
		const home = await readFile(join(site, "content/pages/index.md"), "utf8");
		expect(home).toContain("title: Home");
		expect(home).toContain("template: src/pages/index.astro");
		expect(home).toContain('description: ""');
		expect(await readFile(join(site, "content/pages/docs/getting-started.md"), "utf8")).toContain(
			"title: Getting started",
		);
		const about = await readFile(join(site, "content/pages/about.md"), "utf8");
		expect(about).toContain("title: About");
		expect(about).not.toContain("layout");
		expect(await readFile(join(site, "content/pages/docs/intro.md"), "utf8")).toContain("mine");
		expect(themePageRel(theme, join(theme, "src/pages/docs/intro.mdx"))).toBe("docs/intro");
		expect(themePageRel(theme, join(theme, "src/pages/tags/index.astro"))).toBe("tags/index");
		expect(themePageRel(theme, join(theme, "src/pages/posts/[slug].md"))).toBeUndefined();
		expect(themePageRel(theme, join(theme, "src/pages/_draft.md"))).toBeUndefined();
		expect(themePageRel(theme, join(theme, "src/content/blog/a.md"))).toBeUndefined();
	});

	it("serves the site's entries to the theme under the theme's field names", async () => {
		await writeFile(join(site, "content/posts/a.md"), "---\ntitle: A\ndate: 2024-01-02\n---\nBody\n");
		const before = process.env.WUPPY_BASE_ROOT;
		process.env.WUPPY_BASE_ROOT = site;
		try {
			const live = createLive({
				root: theme,
				built: async () => [],
				schema: () => undefined,
				parseFrontmatter: (s) => {
					const [, head = "", content = ""] = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(s) ?? [];
					return { frontmatter: Object.fromEntries(head.split("\n").map((l) => l.split(": "))), content };
				},
				digest: async (s) => s,
				renderMarkdown: async (body) => ({ html: body }),
			});
			const [entry] = await live.getCollection("blog");
			expect(entry).toMatchObject({ id: "a", data: { title: "A", pubDate: "2024-01-02" } });
		} finally {
			if (before === undefined) delete process.env.WUPPY_BASE_ROOT;
			else process.env.WUPPY_BASE_ROOT = before;
		}
	});
});
