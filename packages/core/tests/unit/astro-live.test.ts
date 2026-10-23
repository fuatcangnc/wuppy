import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isLiveRoute, routePattern, wrapPage } from "../../src/astro/live-content.ts";
import { markdownContent } from "../../src/markdown/render.ts";
import { type AstroEntry, createLive, defaultId, livePage, paginator } from "../../src/astro/live-runtime.ts";

let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-live-"));
	await mkdir(join(root, "src/content/posts"), { recursive: true });
});
afterEach(() => rm(root, { recursive: true, force: true }));

const fm = (source: string) => {
	const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(source)!;
	return {
		frontmatter: Object.fromEntries(m[1]!.split("\n").map((l) => l.split(": ") as [string, string])),
		content: m[2]!,
	};
};
const write = (name: string, text: string) => writeFile(join(root, "src/content/posts", name), text);

function live(built: AstroEntry[] = []) {
	return createLive({
		root,
		collections: [{ name: "posts", dir: "src/content/posts" }],
		built: async () => built,
		schema: () => ({
			safeParseAsync: async (d: unknown) =>
				(d as { title?: string }).title
					? { success: true, data: { ...(d as object), parsed: true } }
					: { success: false, error: { message: "title required" } },
		}),
		parseFrontmatter: fm,
		digest: async (s) => `d:${s.length}:${s}`,
		renderMarkdown: async (body) => ({ html: `<p>${body}</p>` }),
	});
}

describe("live content", () => {
	it("reads new and edited files on each call, keeps unchanged built entries, drops deleted ones", async () => {
		const source = "---\ntitle: Kept\n---\nold";
		await write("kept.md", source);
		const built: AstroEntry = {
			id: "kept",
			collection: "posts",
			data: { title: "Built" },
			filePath: "src/content/posts/kept.md",
			digest: `d:${source.length}:${source}`,
		};
		const l = live([built]);
		expect(await l.getCollection("posts")).toEqual([built]);

		await write("My Post.md", "---\ntitle: New\n---\nbody");
		await write("_draft.md", "---\ntitle: Hidden\n---\n");
		const added = await l.getEntry("posts", "my-post");
		expect(added).toMatchObject({
			id: "my-post",
			data: { title: "New", parsed: true },
			body: "body",
			rendered: { html: "<p>body</p>" },
		});

		await write("kept.md", "---\ntitle: Edited\n---\nnew text");
		expect((await l.getEntry("posts", "kept"))?.data.title).toBe("Edited");
		// A save that breaks the schema keeps serving the built version.
		await write("kept.md", "---\nother: x\n---\n");
		expect(await l.getEntry("posts", "kept")).toBe(built);

		await rm(join(root, "src/content/posts/My Post.md"));
		expect((await l.getCollection("posts")).map((e) => e.id)).toEqual(["kept"]);
		expect(await l.isLive("posts")).toBe(true);
		expect(await l.isLive("couriers")).toBe(false);
	});

	it("serves a theme's .mdx from its build only; Wuppy renders .md", async () => {
		const source = "---\ntitle: Built\n---\n# Hi";
		await write("built.mdx", source);
		await write("plain.md", "---\ntitle: Plain\n---\ntext");
		const built: AstroEntry = {
			id: "built",
			collection: "posts",
			data: { title: "Built" },
			filePath: "src/content/posts/built.mdx",
			digest: `d:${source.length}:${source}`,
		};
		const l = live([built]);
		expect((await l.getCollection("posts")).map((e) => e.id)).toEqual(["built", "plain"]);
		await write("built.mdx", "---\ntitle: Edited\n---\n# Changed");
		expect(await l.getEntry("posts", "built")).toMatchObject({ data: { title: "Edited" }, body: "# Changed" });
		await write("new.mdx", "---\ntitle: New\n---\n");
		expect(await l.getEntry("posts", "new")).toMatchObject({ data: { title: "New" } });
	});

	it("renders the visual editor's blocks (one line of HTML each) with the author's text kept literal", async () => {
		// What packages/admin/src/components/visual-editor/markdown.ts writes.
		const body =
			'<section data-ve="container" data-ve-label="Hero" style="padding: 32px 16px"><h2 data-ve="heading">Hi &#42;there&#42; &#123;x&#125; &lt;b&gt;</h2>' +
			'<p data-ve="text" class="lead">a<br />b</p><a data-ve="button" href="/x" style="color: #fff">Go</a>' +
			'<img data-ve="image" src="/a.png" alt="" /><ul data-ve="list"><li>One</li></ul>' +
			'<video data-ve="video" src="/v.mp4" controls></video><hr data-ve="divider" /></section>\n\n' +
			'# Markdown kept\n\n<p data-ve="text" hidden>secret</p>\n';
		const { html } = await markdownContent(body);
		expect(html).toContain("Hi &#42;there&#42; &#123;x&#125; &lt;b&gt;");
		expect(html).not.toContain("<em>");
		for (const tag of ["section", "h2", "br", "img", "li", "video", "hr", "h1"]) expect(html).toContain(`<${tag}`);
		expect(html).toContain('style="padding: 32px 16px"');
	});

	it("matches Astro's default ids", () => {
		expect(defaultId("Hello World.md")).toBe("hello-world");
		expect(defaultId("guides/index.md")).toBe("guides");
		expect(defaultId("a/Çok Güzel!.md")).toBe("a/çok-güzel");
	});

	it("gives a page its getStaticPaths props at request time, 404 when no path matches", async () => {
		const factory = Object.assign((_r: unknown, props: Record<string, unknown>) => props, {
			isAstroComponentFactory: true,
		});
		const page = livePage(factory as never, async () => [{ params: { slug: "a" }, props: { post: 1 } }], "/[slug]");
		expect(page.isAstroComponentFactory).toBe(true);
		expect(await page({ params: { slug: "a" } }, {}, {})).toEqual({ post: 1 });
		expect(((await page({ params: { slug: "b" } }, {}, {})) as Response).status).toBe(404);
	});

	it("paginates like Astro", () => {
		const [first, second] = paginator("/blog/[...page]")([1, 2, 3], { pageSize: 2 });
		expect(first!.params.page).toBeUndefined();
		expect(first!.props.page).toMatchObject({
			data: [1, 2],
			currentPage: 1,
			lastPage: 2,
			url: { current: "/blog", next: "/blog/2" },
		});
		expect(second!.props.page.url).toMatchObject({ current: "/blog/2", prev: "/blog", first: "/blog" });
	});

	it("wraps a compiled page and picks the pages that read collections", async () => {
		const code = "async function getStaticPaths() {}\nconst $$Slug = 1;\nexport default $$Slug;\n";
		const out = wrapPage(code, "/rt.mjs", "/[slug]")!;
		expect(out).toContain('export default __wuppyLivePage($$Slug, getStaticPaths, "/[slug]")');
		expect(out).not.toContain("export default $$Slug");
		expect(wrapPage("export { $$A as default, getStaticPaths };", "/rt.mjs", "/x")).toContain("$$A as __wuppyPage");
		expect(wrapPage("export default $$A;", "/rt.mjs", "/x")).toBeNull();
		expect(routePattern("src/pages/posts/index.astro")).toBe("/posts");
		expect(routePattern("src/pages/[...slug].astro")).toBe("/[...slug]");

		await mkdir(join(root, "src/pages"), { recursive: true });
		await writeFile(join(root, "src/pages/a.astro"), 'import { getCollection } from "astro:content";');
		await writeFile(join(root, "src/pages/b.astro"), "<h1>static</h1>");
		await writeFile(join(root, "src/pages/c.astro"), 'import "astro:content";\nexport const prerender = true;');
		await writeFile(join(root, "src/pages/rss.xml.ts"), 'import "astro:content"; export function getStaticPaths() {}');
		expect(["a.astro", "b.astro", "c.astro", "rss.xml.ts"].map((f) => isLiveRoute(root, `src/pages/${f}`))).toEqual([
			true,
			false,
			false,
			false,
		]);
	});
});
