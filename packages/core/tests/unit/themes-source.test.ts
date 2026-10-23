import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GithubThemes } from "../../src/themes/github.ts";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("active theme source files", () => {
	it("lists source files and saves a valid theme file", async () => {
		const base = await mkdtemp(join(tmpdir(), "wuppy-theme-source-"));
		roots.push(base);
		const theme = join(base, ".wuppy", "themes", "acme__blog");
		await mkdir(join(theme, "src", "pages"), { recursive: true });
		await mkdir(join(theme, "node_modules", "pkg"), { recursive: true });
		await writeFile(join(base, ".wuppy", "themes", "active.json"), JSON.stringify({ repo: "acme/blog" }));
		await writeFile(join(theme, "src", "pages", "index.astro"), "---\nconst title = 'Home';\n---\n<h1>{title}</h1>\n");
		await writeFile(join(theme, "src", "styles.css"), "body { color: red; }\n");
		await writeFile(join(theme, "node_modules", "pkg", "index.js"), "ignored");
		await writeFile(join(theme, ".env"), "SECRET=nope");
		// Sample content is imported into the site, so the theme's collection folder is not listed.
		await mkdir(join(theme, "src", "content", "blog"), { recursive: true });
		await writeFile(join(theme, "src", "content", "blog", "a.md"), "# a\n");
		await writeFile(
			join(theme, "wuppy.config.mjs"),
			'export default { collections: [{ name: "blog", dir: "src/content/blog", fields: {} }] };\n',
		);

		const themes = new GithubThemes({ base });
		const source = await themes.sourceFiles();
		expect(source?.repo).toBe("acme/blog");
		expect(source?.files.map((file) => file.path)).toEqual([
			"src/pages/index.astro",
			"src/styles.css",
			"wuppy.config.mjs",
		]);
		expect(source?.files[0]?.content).toContain("<h1>");
		expect(source?.files.some((file) => file.path.includes(".env"))).toBe(false);
		expect(source?.files.some((file) => file.path.includes("node_modules"))).toBe(false);

		await themes.writeSource("src/pages/index.astro", "<h1>Changed</h1>\n");
		expect(await readFile(join(theme, "src", "pages", "index.astro"), "utf8")).toBe("<h1>Changed</h1>\n");
		await expect(themes.writeSource("../escape.astro", "x")).rejects.toThrow(/escapes/);
		await expect(themes.writeSource("src/pages/index.astro.jpg", "x")).rejects.toThrow(/text files/);
		await expect(themes.writeSource("node_modules/pkg/index.js", "x")).rejects.toThrow(/read-only/);
		await expect(themes.writeSource("package-lock.json", "x")).rejects.toThrow(/read-only/);
	});
});
