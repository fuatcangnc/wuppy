import { describe, expect, it } from "vitest";
import { themeBodyShift, withThemeBody } from "../../src/astro/theme-pages.ts";

describe("theme .astro page body", () => {
	it("imports the body component and renders it at the end of <main>", () => {
		const out = withThemeBody(
			"---\nimport L from '../L.astro';\n---\n<L><main><h1>Tags</h1></main><footer>f</footer></L>\n<style>a{}</style>\n",
			"tags/index",
		);
		expect(out).toBe(
			"---\nimport WuppyThemeBody from \"virtual:wuppy-theme-body/tags/index\"; import L from '../L.astro';\n---\n<L><main><h1>Tags</h1><WuppyThemeBody /></main><footer>f</footer></L>\n<style>a{}</style>\n",
		);
	});

	it("uses the last element when there is no <main>, and adds a frontmatter when missing", () => {
		expect(withThemeBody("<Layout><p>x</p></Layout>\n<script>1</script>", "about")).toBe(
			'---\nimport WuppyThemeBody from "virtual:wuppy-theme-body/about";\n---\n<Layout><p>x</p><WuppyThemeBody /></Layout>\n<script>1</script>',
		);
	});

	it("keeps the template's line numbers when the page has a frontmatter", () => {
		expect(themeBodyShift("---\nimport L from 'l';\n---\n<p/>")).toBe(0);
		expect(themeBodyShift("---\n---\n<p/>")).toBe(1);
		expect(themeBodyShift("<p/>")).toBe(3);
		const page = "---\n---\n<main><p/></main>";
		expect(withThemeBody(page, "a").split("\n").length - page.split("\n").length).toBe(themeBodyShift(page));
	});
});
