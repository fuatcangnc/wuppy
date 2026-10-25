import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sitePage } from "../../src/astro/live-runtime.ts";
import { sitePageSource } from "../../src/astro/theme-pages.ts";

const o = { runtime: "/rt.ts", components: "", settings: {} };

describe("site page route", () => {
	it("puts the entry body in the home page's <main> and makes its relative imports absolute", () => {
		const out = sitePageSource(
			'---\nimport L from "../layouts/L.astro";\nimport N from "@/N.astro";\nexport const prerender = true;\n---\n<L><N /><main class="m"><Hero /></main><footer /></L>\n',
			"/t/src/pages",
			o,
		)!;
		expect(out).toContain('import L from "/t/src/layouts/L.astro";');
		expect(out).toContain('import N from "@/N.astro";');
		expect(out).not.toContain("prerender = true");
		expect(out).toContain('<main class="m"><Fragment set:html={"<!--wuppy:body-->"} />');
		expect(out).toContain('<Fragment set:html={"<!--/wuppy:body-->"} /></main><footer /></L>');
		expect(out).not.toContain("<Hero />");
		expect(sitePageSource("<div>no main</div>", "/t", o)).toBeUndefined();
	});

	describe("entries", () => {
		afterEach(() => {
			vi.unstubAllEnvs();
			vi.restoreAllMocks();
		});

		it("renders a published page without a theme page, and nothing else", async () => {
			const site = await mkdtemp(join(tmpdir(), "wuppy-site-"));
			const theme = join(site, "theme");
			await mkdir(join(site, "content/pages"), { recursive: true });
			await mkdir(theme);
			await writeFile(
				join(site, "wuppy.config.mjs"),
				'export default { collections: [{ name: "pages", kind: "pages", dir: "content/pages", format: "md", route: "/{slug}", fields: { title: "string" } }] };',
			);
			await writeFile(join(theme, "wuppy.config.mjs"), "export default { collections: [] };");
			await writeFile(join(site, "content/pages/test.md"), "---\ntitle: Test\n---\nHello **there**\n");
			await writeFile(join(site, "content/pages/draft.md"), "---\ntitle: D\ndraft: true\n---\nx\n");
			await writeFile(join(site, "content/pages/home.md"), "---\ntitle: H\ntemplate: src/pages/index.astro\n---\nx\n");
			vi.stubEnv("WUPPY_BASE_ROOT", site);
			vi.spyOn(process, "cwd").mockReturnValue(theme);
			expect((await sitePage("test"))?.html).toContain("<strong>there</strong>");
			for (const path of ["draft", "home", "missing", "../wuppy.config", ""])
				expect(await sitePage(path)).toBeUndefined();
			// A content type made in the admin shows at its route; the Posts every site gets too.
			await mkdir(join(site, ".wuppy/data"), { recursive: true });
			await writeFile(
				join(site, ".wuppy/data/content-types.json"),
				JSON.stringify([{ name: "projects", dir: "content/projects", route: "/work/{slug}", fields: {} }]),
			);
			await mkdir(join(site, "content/projects"), { recursive: true });
			await mkdir(join(site, "content/posts"), { recursive: true });
			await writeFile(join(site, "content/projects/one.md"), "---\ntitle: One\n---\nProject *one*\n");
			await writeFile(join(site, "content/posts/hi.md"), "---\ntitle: Hi\n---\nA post\n");
			expect((await sitePage("work/one"))?.html).toContain("<em>one</em>");
			expect((await sitePage("posts/hi"))?.html).toContain("A post");
			expect(await sitePage("work/two")).toBeUndefined();
		});
	});
});
