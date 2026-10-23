import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { componentPreview } from "../../src/astro/integration.ts";
import { mapSource } from "../../src/astro/theme-components.ts";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("component preview page", () => {
	it("is generated only when the project has components, and maps names to their files", async () => {
		const root = await mkdtemp(join(tmpdir(), "wuppy-preview-"));
		roots.push(root);
		expect(await componentPreview(root)).toBeUndefined();
		await mkdir(join(root, "src", "components"), { recursive: true });
		await writeFile(join(root, "src", "components", "BackToTop.astro"), "<button>Top</button>\n");
		const file = await componentPreview(root);
		const page = await readFile(file!, "utf8");
		expect(page).toContain(`import __wuppyC0 from ${JSON.stringify(join(root, "src/components/BackToTop.astro"))};`);
		expect(page).toContain('const __wuppyComponents = { "BackToTop": __wuppySafe("BackToTop", __wuppyC0) };');
		// Names like "constructor" must not reach Object.prototype.
		expect(page).toContain("Object.hasOwn(map, name)");
	});

	it("renders a component that throws (missing props) as a comment instead of failing the page", async () => {
		const code = mapSource([{ name: "Toc", path: "/x/Toc.astro" }])
			.split("\n")
			.filter((line) => !line.startsWith("import "))
			.join("\n");
		const run = new Function("__wuppyHtml", "__wuppyC0", `${code}\nreturn __wuppyComponents;`) as (
			html: (s: string) => string,
			c: (...a: unknown[]) => unknown,
		) => Record<string, (...a: unknown[]) => unknown>;
		const error = console.error;
		console.error = () => undefined;
		try {
			const sync = run(
				(s) => s,
				() => {
					throw new TypeError("headings is undefined");
				},
			);
			expect(sync.Toc!({}, {}, {})).toBe("<!-- wuppy: <Toc> could not render -->");
			const factory = Object.assign(async () => Promise.reject(new Error("no")), { isAstroComponentFactory: true });
			const async = run((s) => s, factory);
			expect(await async.Toc!({}, {}, {})).toBe("<!-- wuppy: <Toc> could not render -->");
			expect((async.Toc as unknown as { isAstroComponentFactory: boolean }).isAstroComponentFactory).toBe(true);
			expect(
				run(
					(s) => s,
					() => "ok",
				).Toc!({}, {}, {}),
			).toBe("ok");
		} finally {
			console.error = error;
		}
	});
});
