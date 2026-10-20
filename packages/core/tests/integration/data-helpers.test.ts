import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getByline, getMenu, getSection, getSections, getWidgetArea, pathMatches } from "../../src/data/helpers.ts";
import { menuSchema } from "../../src/data/schemas.ts";

let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-helpers-"));
	await mkdir(join(root, ".wuppy/data"), { recursive: true });
});
afterEach(() => rm(root, { recursive: true, force: true }));
const data = (name: string, value: unknown) => writeFile(join(root, `.wuppy/data/${name}.json`), JSON.stringify(value));

const bad = (href: string) => menuSchema.safeParse({ name: "m", label: "M", items: [{ label: "x", href }] }).success;

describe("section locales", () => {
	it("prefers the locale variant and falls back to the neutral one", async () => {
		await data("sections", [
			{ slug: "hero", title: "Hero" },
			{ slug: "hero", title: "Kahraman", locale: "tr" },
			{ slug: "cta", title: "CTA", locale: "tr" },
		]);
		expect((await getSection("hero", root, "tr"))?.title).toBe("Kahraman");
		expect((await getSection("hero", root, "de"))?.title).toBe("Hero");
		expect(await getSection("cta", root, "de")).toBeNull();
		expect((await getSections(["hero", "cta"], root, "tr")).map((x) => x.title)).toEqual(["Kahraman", "CTA"]);
	});
});

describe("getSections", () => {
	it("keeps the requested order and skips drafts and unknown slugs", async () => {
		await data("sections", [
			{ slug: "a", title: "A" },
			{ slug: "b", title: "B", draft: true },
			{ slug: "c", title: "C" },
		]);
		expect((await getSections(["c", "b", "zzz", "a"], root)).map((x) => x.slug)).toEqual(["c", "a"]);
	});
});

const ids = async (path?: string) => (await getWidgetArea("side", { path }, root)).map((w) => w.id);

describe("template helpers", () => {
	it("getMenu prefers the locale variant and falls back to the default", async () => {
		await data("menus", [
			{ name: "main", label: "Main", location: "header", items: [] },
			{ name: "main", label: "Ana", location: "header", locale: "tr", items: [] },
		]);
		expect((await getMenu("main", "tr", root))?.label).toBe("Ana");
		expect((await getMenu("main", "de", root))?.label).toBe("Main");
		expect(await getMenu("nope", "tr", root)).toBeNull();
	});

	it("menu links reject javascript: and protocol-relative URLs", () => {
		expect(bad("javascript:alert(1)")).toBe(false);
		expect(bad("//evil.com")).toBe(false);
		expect(bad("/ok")).toBe(true);
		expect(bad("https://ok.com")).toBe(true);
	});

	it("getWidgetArea filters by locale/collection and sanitizes html widgets", async () => {
		await data("widgets", [
			{
				name: "sidebar",
				label: "Sidebar",
				widgets: [
					{ id: "a", type: "html", body: "<p>ok</p><script>x()</script>" },
					{ id: "b", type: "text", body: "tr only", locales: ["tr"] },
					{ id: "c", type: "text", body: "posts only", collections: ["posts"] },
				],
			},
		]);
		const all = await getWidgetArea("sidebar", {}, root);
		expect(all.map((w) => w.id)).toEqual(["a"]);
		expect(all[0]?.body).not.toContain("<script");
		const tr = await getWidgetArea("sidebar", { locale: "tr", collection: "posts" }, root);
		expect(tr.map((w) => w.id)).toEqual(["a", "b", "c"]);
	});

	it("getWidgetArea can limit a widget to pages", async () => {
		await data("widgets", [
			{
				name: "side",
				label: "Side",
				widgets: [
					{ id: "everywhere", type: "text" },
					{ id: "blog", type: "text", paths: ["/blog/*"] },
					{ id: "about", type: "text", paths: ["/about"] },
				],
			},
		]);
		expect(await ids("/blog/hello")).toEqual(["everywhere", "blog"]);
		expect(await ids("/blog")).toEqual(["everywhere", "blog"]);
		expect(await ids("/about/")).toEqual(["everywhere", "about"]);
		expect(await ids("/blogger")).toEqual(["everywhere"]);
		expect(await ids()).toEqual(["everywhere"]);
		expect(pathMatches("/*", "/")).toBe(true);
	});

	it("getByline and getSection (published only)", async () => {
		await data("bylines", [{ slug: "ada", name: "Ada" }]);
		await data("sections", [
			{ slug: "cta", title: "CTA", body: "x", draft: false },
			{ slug: "wip", title: "WIP", body: "x", draft: true },
		]);
		expect((await getByline("ada", root))?.name).toBe("Ada");
		expect((await getSection("cta", root))?.title).toBe("CTA");
		expect(await getSection("wip", root)).toBeNull();
	});
});
