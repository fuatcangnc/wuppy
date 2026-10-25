import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markSource } from "../../src/astro/source-marks.ts";
import type { ElementEdit } from "../../src/themes/astro-edit.ts";
import { GithubThemes } from "../../src/themes/github.ts";
import { applyOverlay, htmlElements, missingClasses, readOverlay, rebaseShadow } from "../../src/themes/overlay.ts";

const HERO = `const title = "Welcome";
export function Hero() {
	return (
		<section className="p-4">
			<h1 className="text-xl">Hello</h1>
			<p>World</p>
			<h2>{title}</h2>
		</section>
	);
}
`;

let base: string;
let theme: string;
beforeEach(async () => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	base = await mkdtemp(join(tmpdir(), "wuppy-overlay-"));
	theme = join(base, ".wuppy", "themes", "me__site");
	await mkdir(join(theme, "src"), { recursive: true });
	await writeFile(join(theme, "src", "hero.tsx"), HERO);
	await writeFile(join(base, ".wuppy", "themes", "active.json"), JSON.stringify({ repo: "me/site" }));
});
afterEach(async () => {
	vi.useRealTimers();
	await rm(base, { recursive: true, force: true });
});

/** The build's page: the file's elements with the marks the production build puts on them. */
async function built(): Promise<{ html: string; locs: Record<string, string> }> {
	const marked = await markSource(HERO, "src/hero.tsx");
	const locs = Object.fromEntries(
		[...marked.matchAll(/<(\w+) data-wuppy-file="[^"]*" data-wuppy-loc="([^"]*)"/g)].map((m) => [m[1]!, m[2]!]),
	);
	const m = (tag: string) => `data-wuppy-file="src/hero.tsx" data-wuppy-loc="${locs[tag]}"`;
	const html = `<html><body><section class="p-4" ${m("section")}><h1 class="text-xl" ${m("h1")}>Hello</h1><p ${m("p")}>World</p><h2 ${m("h2")}>Welcome</h2></section></body></html>`;
	return { html, locs };
}

const edit = (themes: GithubThemes, loc: string, e: ElementEdit, tag?: string) =>
	(
		themes as unknown as {
			editBuilt: (...a: [string, string, string, ElementEdit, string?]) => ReturnType<GithubThemes["editElement"]>;
		}
	).editBuilt(theme, "src/hero.tsx", loc, e, tag);

describe("production theme edits (overlay)", () => {
	it("changes the file and shows every edit on the built page, by the build's locations", async () => {
		const { html, locs } = await built();
		const themes = new GithubThemes({ base });

		// A new line after the heading moves the paragraph down; it is still found by its build location.
		const added = await edit(themes, locs.h1!, { action: "insert", html: '<span class="font-bold">New</span>' }, "h1");
		expect(added).toMatchObject({ loc: "0:1", refresh: true });
		await edit(themes, locs.p!, { action: "delete" }, "p");
		await edit(themes, added.loc!, { action: "text", value: "Newer" }, "span");
		expect(await edit(themes, locs.h1!, { action: "text", value: "Hi <you>" }, "h1")).toMatchObject({
			loc: locs.h1,
			refresh: false,
		});
		// Text from a variable: its string changes, the page shows it where it showed the old text.
		await edit(themes, locs.h2!, { action: "text", value: "Hey", from: "Welcome" }, "h2");

		const file = await readFile(join(theme, "src", "hero.tsx"), "utf8");
		expect(file).toContain('const title = "Hey";');
		expect(file).toContain('<h1 className="text-xl">Hi &lt;you&gt;</h1>');
		expect(file).toContain('<span className="font-bold">Newer</span>');
		expect(file).not.toContain("World");
		expect(file).not.toContain("data-wuppy");

		const { ops } = await readOverlay(base);
		const page = applyOverlay(html, ops);
		expect(page.replace(/ data-wuppy-(file|loc)="[^"]*"/g, "")).toBe(
			'<html><body><section class="p-4"><h1 class="text-xl">Hi &lt;you&gt;</h1><span class="font-bold">Newer</span><h2>Hey</h2></section></body></html>',
		);
	});

	it("duplicates without copying the build's marks", async () => {
		const { html, locs } = await built();
		const themes = new GithubThemes({ base });
		await edit(themes, locs.h1!, { action: "duplicate" }, "h1");
		await edit(themes, locs.h1!, { action: "attrs", attrs: { class: "text-2xl" } }, "h1");
		const file = await readFile(join(theme, "src", "hero.tsx"), "utf8");
		// Only the original takes the later edit, in the file as on the page.
		expect(file.match(/<h1 className="[^"]*">Hello<\/h1>/g)).toEqual([
			'<h1 className="text-2xl">Hello</h1>',
			'<h1 className="text-xl">Hello</h1>',
		]);
		const page = applyOverlay(html, (await readOverlay(base)).ops);
		expect(page).toContain(
			`<h1 class="text-2xl" data-wuppy-file="src/hero.tsx" data-wuppy-loc="${locs.h1}">Hello</h1><h1 class="text-xl">Hello</h1>`,
		);
	});

	it("keeps finding elements after a change made in Code view, except the changed ones", async () => {
		const { locs } = await built();
		const themes = new GithubThemes({ base });
		await edit(themes, locs.h1!, { action: "text", value: "A" }, "h1");
		// Code view (or an AI undo): the heading's text back, the paragraph made a div.
		const file = join(theme, "src", "hero.tsx");
		await writeFile(file, HERO.replace("<p>World</p>", "<div>World</div>"));
		await edit(themes, locs.h1!, { action: "attrs", attrs: { class: "x" } }, "h1");
		await edit(themes, locs.h2!, { action: "attrs", attrs: { class: "y" } }, "h2");
		expect(await readFile(file, "utf8")).toBe(
			HERO.replace("<p>World</p>", "<div>World</div>")
				.replace('className="text-xl"', 'className="x"')
				.replace("<h2>", '<h2 className="y">'),
		);
		await expect(edit(themes, locs.p!, { action: "delete" }, "p")).rejects.toThrow(/not in the file/);
	});

	it("drops a build that edits came in during, and keeps showing them", async () => {
		const { locs } = await built();
		await mkdir(join(theme, "dist", "server"), { recursive: true });
		await writeFile(join(theme, "dist", "server", "entry.mjs"), "old");
		await mkdir(join(theme, ".git"));
		await writeFile(join(theme, "package.json"), JSON.stringify({ dependencies: { astro: "7" } }));
		await writeFile(join(theme, "astro.config.mjs"), "export default {};\n");
		await mkdir(join(theme, "node_modules", "astro"), { recursive: true });
		await writeFile(join(theme, "node_modules", "astro", "package.json"), JSON.stringify({ version: "7.4.2" }));
		await mkdir(join(base, "node_modules", "wuppycms"), { recursive: true });
		const restart = vi.fn(() => true);
		let themes: GithubThemes;
		const run = async (_cmd: string, args: string[], { cwd }: { cwd: string }) => {
			if (!args.includes("build")) return;
			// The user edits while the theme builds.
			await edit(themes, locs.h1!, { action: "text", value: "During" }, "h1");
			await mkdir(join(cwd, "dist-next", "server"), { recursive: true });
			await writeFile(join(cwd, "dist-next", "server", "entry.mjs"), "new");
		};
		themes = new GithubThemes({ base, run, restart });
		await edit(themes, locs.h1!, { action: "text", value: "Before" }, "h1");
		const job = await themes.rebuild();
		await vi.waitFor(() => expect(job.status).not.toBe("running"));
		expect(job.error).toBeUndefined();
		expect(restart).not.toHaveBeenCalled();
		expect(await readFile(join(theme, "dist", "server", "entry.mjs"), "utf8")).toBe("old");
		expect((await readOverlay(base)).ops.map((o) => o.edit)).toMatchObject([{ value: "Before" }, { value: "During" }]);

		// The next build has every edit: it replaces the running one and the overlay is cleared.
		const quiet = new GithubThemes({
			base,
			restart,
			run: async (_c, args, { cwd }) => {
				if (!args.includes("build")) return;
				await mkdir(join(cwd, "dist-next", "server"), { recursive: true });
				await writeFile(join(cwd, "dist-next", "server", "entry.mjs"), "new");
			},
		});
		const next = await quiet.rebuild();
		await vi.waitFor(() => expect(next.status).toBe("done"));
		expect(restart).toHaveBeenCalledOnce();
		expect(await readFile(join(theme, "dist", "server", "entry.mjs"), "utf8")).toBe("new");
		expect((await readOverlay(base)).ops).toEqual([]);
	});
});

describe("rebaseShadow", () => {
	it("keeps marks around the change and drops those in it", () => {
		const shadow = '<a data-wuppy-o="1:1">x</a><b data-wuppy-o="1:2">y</b><i data-wuppy-o="1:3">z</i>';
		expect(rebaseShadow(shadow, "<a>x</a><u>yy</u><i>z</i>")).toBe(
			'<a data-wuppy-o="1:1">x</a><u>yy</u><i data-wuppy-o="1:3">z</i>',
		);
		expect(rebaseShadow(shadow, "<a>x</a><b>y</b><i>z</i>")).toBe(shadow);
	});
});

describe("htmlElements", () => {
	it("pairs tags, skips void and raw-text ones", () => {
		const html = '<div><img src="a"><script>if (a < b) "</div>"</script><p>x</p></div>';
		expect(htmlElements(html).map((e) => [e.name, html.slice(e.start, e.end)])).toEqual([
			["div", html],
			["img", '<img src="a">'],
			["script", '<script>if (a < b) "</div>"</script>'],
			["p", "<p>x</p>"],
		]);
	});

	it("makes CSS only for classes the build has no rule for", () => {
		const css = ".flex-col{flex-direction:column}.sm\\:grid{display:grid}.md\\:\\[\\&\\>\\*\\]\\:h-full>*{height:100%}";
		expect(missingClasses(css, ["flex", "flex-col", "sm:grid", "md:[&>*]:h-full", "sm:grid-cols-4"])).toEqual([
			"flex",
			"sm:grid-cols-4",
		]);
	});
});
