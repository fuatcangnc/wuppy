import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isLiveRoute, routePattern, wrapPage } from "../../src/astro/live-content.ts";
import { findDisallowed } from "../../src/mdx/index.ts";
import {
	type AstroEntry,
	createLive,
	defaultId,
	livePage,
	mdxContent,
	paginator,
} from "../../src/astro/live-runtime.ts";

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
		collections: [{ name: "posts", dir: "src/content/posts", format: "md" }],
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

	it("reads .md and .mdx side by side; a changed .mdx renders on request, an unchanged one keeps its build", async () => {
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
		expect(l.rendersAtRuntime(await l.getEntry("posts", "built"))).toBe(false);
		expect(l.rendersAtRuntime(await l.getEntry("posts", "plain"))).toBe(false);
		await write("built.mdx", "---\ntitle: Edited\n---\n# Changed");
		const edited = await l.getEntry("posts", "built");
		expect(edited).toMatchObject({ body: "# Changed", data: { title: "Edited" } });
		expect(l.rendersAtRuntime(edited)).toBe(true);
	});

	it("compiles stored MDX into a component Astro's MDX renderer accepts, after the security checks", async () => {
		const opts = { allowed: ["Callout"], root };
		const { Content, headings } = await mdxContent(
			'# Hi *there*\n\n## Hi *there*\n\n<Callout tone="info">ok</Callout>\n\n```js\nconst x = 1\n```\n\n| a |\n|---|\n| 1 |\n',
			opts,
		);
		expect((Content as unknown as Record<symbol, unknown>)[Symbol.for("mdx-component")]).toBe(true);
		// Same heading ids and list as Astro's build gives.
		expect(headings).toEqual([
			{ depth: 1, slug: "hi-there", text: "Hi there" },
			{ depth: 2, slug: "hi-there-1", text: "Hi there" },
		]);
		const tree = JSON.stringify(Content({ components: { Callout: "aside" } }));
		expect(tree).toContain('"id":"hi-there"');
		expect(tree).toContain("aside");
		expect(tree).toContain("astro-code"); // highlighted like the build
		expect(tree).toContain('"table"'); // GFM
		await expect(mdxContent("{process.exit(1)}", opts)).rejects.toThrow(/expression/);
		await expect(mdxContent("<Evil />", opts)).rejects.toThrow(/Evil/);
		await expect(mdxContent("import fs from 'node:fs'", opts)).rejects.toThrow(/import/);
	});

	it("renders the visual editor's blocks (one line of JSX each) with the author's text kept literal", async () => {
		// What packages/admin/src/components/visual-editor/mdx.ts writes.
		const body =
			'<section data-ve="container" data-ve-label="Hero" style="padding: 32px 16px"><h2 data-ve="heading">Hi &#42;there&#42; &#123;x&#125; &lt;b&gt;</h2>' +
			'<p data-ve="text" class="lead">a<br />b</p><a data-ve="button" href="/x" style="color: #fff">Go</a>' +
			'<img data-ve="image" src="/a.png" alt="" /><ul data-ve="list"><li>One</li></ul>' +
			'<video data-ve="video" src="/v.mp4" controls></video><hr data-ve="divider" /></section>\n\n' +
			'# Markdown kept\n\n<p data-ve="text" hidden>secret</p>\n';
		const { Content } = await mdxContent(body, { allowed: [], root });
		const tree = JSON.stringify(Content({}));
		expect(tree).toContain("Hi *there* {x} <b>");
		expect(tree).not.toContain('"em"');
		for (const tag of ["section", "h2", "br", "img", "li", "video", "hr", "h1"]) expect(tree).toContain(`"${tag}"`);
		expect(tree).toContain('"padding: 32px 16px"');
		expect(await findDisallowed(body, [], "md")).toEqual([]);
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
