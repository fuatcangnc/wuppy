import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { themeComponentsPlugin } from "../../src/astro/theme-components.ts";
import { listThemeComponents, themeComponentNames } from "../../src/themes/components.ts";

let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-components-"));
	await mkdir(join(root, "src/components/nested"), { recursive: true });
	await writeFile(join(root, "src/components/Callout.astro"), "<div />");
	await writeFile(join(root, "src/components/nested/Figure.astro"), "<figure />");
	await writeFile(join(root, "src/components/not-a-component.astro"), "<div />");
	await writeFile(join(root, "src/components/partials.ts"), "export {}");
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("theme components", () => {
	it("lists PascalCase .astro files recursively and skips other files", async () => {
		expect(await listThemeComponents(root)).toEqual([
			{ name: "Callout", path: "src/components/Callout.astro" },
			{ name: "Figure", path: "src/components/nested/Figure.astro" },
		]);
		expect(await themeComponentNames(root)).toEqual(["Callout", "Figure"]);
	});

	it("patches a compiled Content render with direct component imports", async () => {
		const plugin = themeComponentsPlugin(root) as {
			transform: { handler: (code: string, id: string) => Promise<{ code: string } | null> };
		};
		const out = await plugin.transform.handler(
			'import { renderComponent } from "astro/runtime/server/index.js";\nconst page = () => renderComponent($$result, "Content", Content, { x: 1 });',
			join(root, "src/pages/[slug].astro"),
		);
		expect(out?.code).toContain("import __wuppyC0 from");
		expect(out?.code).toContain('"Callout": __wuppySafe("Callout", __wuppyC0)');
		expect(out?.code).toContain(
			'renderComponent($$result, "Content", __wuppyBody(Content), { components: __wuppyComponents, x: 1 })',
		);
	});

	it("marks where the entry body renders even without theme components", async () => {
		const plugin = themeComponentsPlugin(join(root, "empty")) as {
			transform: { handler: (code: string, id: string) => Promise<{ code: string } | null> };
		};
		const out = await plugin.transform.handler(
			'const page = () => renderComponent($$result, "Content", Content, {});',
			join(root, "src/pages/[slug].astro"),
		);
		expect(out?.code).toContain("<!--wuppy:body-->");
		expect(out?.code).toContain('"Content", __wuppyBody(Content), {})');
		expect(out?.code).not.toContain("__wuppyComponents");
	});

	it("deduplicates the same tag when a site and a theme both provide it", async () => {
		const site = await mkdtemp(join(tmpdir(), "wuppy-site-components-"));
		await mkdir(join(site, "src/components"), { recursive: true });
		await writeFile(join(site, "src/components/Callout.astro"), "<div />");
		await writeFile(join(site, "src/components/Extra.astro"), "<div />");
		expect(await themeComponentNames(root, site)).toEqual(["Callout", "Figure", "Extra"]);
		await rm(site, { recursive: true, force: true });
	});
});
