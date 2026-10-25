import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { astroRepos, importRepo, inferField, init, patchAstroConfig } from "../../src/cli/init.ts";
import { THEME_GUIDE, THEME_PROMPTS } from "../../src/cli/theme-guide.ts";

const line = (repo: string, pkg: string) => JSON.stringify({ repo, private: repo.endsWith("b"), description: "", pkg });

describe("wuppycms init helpers", () => {
	it("infers field types from existing frontmatter values", () => {
		expect(inferField("draft", [true, undefined])).toBe("boolean");
		expect(inferField("order", [1, 2])).toEqual({ type: "number", multiple: false, required: true });
		expect(inferField("pubDate", [new Date(), "2024-01-02"])).toMatchObject({ type: "date" });
		expect(inferField("tags", [["a"], undefined])).toBe("list");
		expect(inferField("cover", ["https://x.test/a", undefined])).toBe("image");
		expect(inferField("summary", ["a\nb", undefined])).toBe("text");
		expect(inferField("seo", [{ a: 1 }, undefined])).toBe("json");
	});

	it("adds the integration without an integrations array, keeps an existing adapter, is idempotent", () => {
		const bare = `import { defineConfig } from "astro/config";\nexport default defineConfig({\n  site: "x",\n});\n`;
		const out = patchAstroConfig(bare, {})!;
		expect(out).toContain("  integrations: [wuppycms(), mdx()],");
		expect(out).toContain('import node from "@astrojs/node";');
		expect(out).toContain('import mdx from "@astrojs/mdx";');
		const withAdapter = `import { defineConfig } from "astro/config";\nexport default defineConfig({ adapter: vercel(), integrations: [] });\n`;
		expect(patchAstroConfig(withAdapter, { rss: false })).not.toContain("@astrojs/node");
		expect(patchAstroConfig(out, {})).toBe(out);
		expect(patchAstroConfig("module.exports = {}", {})).toBeNull();
	});

	it("wraps a site that has no Markdown content collections", async () => {
		const root = await mkdtemp(join(tmpdir(), "wuppy-init-"));
		await writeFile(
			join(root, "astro.config.mjs"),
			`import { defineConfig } from "astro/config";\nexport default defineConfig({});\n`,
		);
		await writeFile(join(root, "package.json"), '{"name":"site"}');
		const r = await init(root);
		expect(r.code).toBe(0);
		expect(r.stdout).toContain("no Markdown/MDX content collections found");
		expect(await readFile(join(root, "wuppy.config.mjs"), "utf8")).toContain('"collections": []');
	});

	it("writes the agents guide once, leaves a project's own AGENTS.md alone, and matches the shipped skill", async () => {
		const root = await mkdtemp(join(tmpdir(), "wuppy-init-"));
		await writeFile(join(root, "astro.config.mjs"), `export default {};\n`);
		await writeFile(join(root, "package.json"), '{"name":"site"}');
		await init(root);
		expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe(THEME_GUIDE);
		await writeFile(join(root, "AGENTS.md"), "mine");
		await init(root, { force: true });
		expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe("mine");
		const skill = await readFile(new URL("../../../../skills/wuppy-theme/SKILL.md", import.meta.url), "utf8");
		expect(skill.endsWith(`---\n\n${THEME_GUIDE}`)).toBe(true);
	});

	it("lists every theme prompt in the docs, in both languages", async () => {
		for (const page of ["ai/theme-agents.md", "tr/ai/theme-agents.md"]) {
			const docs = await readFile(new URL(`../../../../docs/src/content/docs/${page}`, import.meta.url), "utf8");
			for (const p of THEME_PROMPTS) expect(docs).toContain(p.prompt);
		}
	});

	it("lists only Astro repos from GitHub and clones the picked one with gh", async () => {
		const calls: string[][] = [];
		const exec = async (cmd: string, args: string[]) => {
			calls.push([cmd, ...args]);
			return {
				stdout: [line("me/a", '{"dependencies":{"react":"1"}}'), line("me/b", '{"dependencies":{"astro": "7"}}')].join(
					"\n",
				),
			};
		};
		expect(await astroRepos(exec)).toEqual([{ repo: "me/b", private: true, description: "" }]);
		const cwd = await mkdtemp(join(tmpdir(), "wuppy-import-"));
		const r = await importRepo("", "", cwd, { exec, choose: async (repos) => repos[0] });
		expect(calls.at(-1)).toEqual(["gh", "repo", "clone", "me/b", join(cwd, "b")]);
		// The fake clone wrote nothing, so init finds no Astro project.
		expect(r.code).toBe(1);
		const none = await importRepo("", "", cwd, { exec: async () => ({ stdout: "" }) });
		expect(none.stderr).toMatch(/no astro repositories/i);
		const noGh = await importRepo("", "", cwd, { exec: () => Promise.reject(new Error("spawn gh ENOENT")) });
		expect(noGh.stderr).toMatch(/gh auth login/);
	});
});
