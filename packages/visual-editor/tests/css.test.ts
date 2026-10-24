import { describe, expect, it } from "vitest";
import {
	defaultVisualData,
	fluidScale,
	frameworkCss,
	frameworkTokens,
	nodeCss,
	pageCss,
	ruleCss,
	safeCssValue,
	safeStylesheet,
	visualCss,
	visualDataSchema,
} from "../src/index.ts";

const contexts = {
	breakpoints: [
		{ id: "mobile", label: "Mobile", width: 375 },
		{ id: "tablet", label: "Tablet", width: 768 },
	],
	conditions: [{ id: "dark", label: "Dark", query: "@media (prefers-color-scheme: dark)" }],
};

describe("visual CSS", () => {
	it("orders contexts like the cascade needs them and applies states", () => {
		const css = ruleCss(
			".card",
			{ padding: "8px" },
			{ mobile: { padding: "2px" }, "|:hover": { color: "red" }, dark: { color: "white" }, tablet: { padding: "4px" } },
			contexts,
		);
		expect(css.split("\n")).toEqual([
			".card { padding: 8px }",
			".card:hover { color: red }",
			"@media (max-width: 768px) { .card { padding: 4px } }",
			"@media (max-width: 375px) { .card { padding: 2px } }",
			"@media (prefers-color-scheme: dark) { .card { color: white } }",
		]);
	});

	it("drops anything that could leave its declaration, rule or style element", () => {
		for (const bad of ["red; x: y", "url(javascript:1)", "expression(1)", "a}b", "</style>", "url(//evil.test/a)"])
			expect(safeCssValue(bad), bad).toBe(false);
		expect(ruleCss(".a{}", { color: "red" }, {}, contexts)).toBe("");
		expect(
			ruleCss(".a", { color: "red", behavior: "url(x)" }, { "|:evil": { color: "x" }, nope: { color: "x" } }, contexts),
		).toBe(".a { color: red }");
		expect(safeStylesheet(".a{color:red}</style><script>")).toBe(false);
		expect(safeStylesheet("@import url(https://x.test/a.css);")).toBe(false);
		expect(safeStylesheet(".a { background: url(/media/a.png) } @media (width < 600px) { .b { c: d } }")).toBe(true);
		expect(() => visualDataSchema.parse({ conditions: [{ id: "x", label: "X", query: "@media x { } .a" }] })).toThrow();
	});

	it("builds a page's node CSS from the rendered HTML", () => {
		const html =
			'<section class="hero ve-ab12" data-ve="container" data-ve-r="{&quot;tablet&quot;:{&quot;padding&quot;:&quot;4px&quot;}}">' +
			'<p data-ve-r=\'{"|:hover":{"color":"red"}}\' class="ve-cd34">x</p>' +
			'<p class="ve-zz" data-ve-r="not json"></p><p data-ve-r="{}">no key</p></section>';
		expect(pageCss(html, contexts)).toBe(
			"@media (max-width: 768px) { .ve-ab12 { padding: 4px !important } }\n.ve-cd34:hover { color: red !important }",
		);
		expect(nodeCss("Bad Key", { tablet: { color: "red" } }, contexts)).toBe("");
	});
});

describe("framework", () => {
	it("computes the WuppyCMS fluid scale", () => {
		const fw = defaultVisualData().framework;
		const [, m] = fluidScale(fw.type, fw).find(([s]) => s === "m")!;
		expect(m).toBe("clamp(1rem, calc(0.19vw + 0.96rem), 1.13rem)");
	});

	it("emits prefixed tokens, steps and utilities", () => {
		const fw = {
			...defaultVisualData().framework,
			colors: [
				{ name: "brand", value: "#ff0000", dark: "#00ff00", shades: 1, tints: 0, transparent: true, utilities: true },
			],
			fonts: [{ name: "body", stack: "'Inter', sans-serif", href: "https://fonts.example/inter.css" }],
		};
		const css = frameworkCss(fw);
		expect(css).toContain("--v-brand: #ff0000; --v-brand-d-1: color-mix(in oklab, var(--v-brand), black 40%)");
		expect(css).toContain("--v-brand-50: color-mix(in srgb, var(--v-brand) 50%, transparent)");
		expect(css).toContain(".dark { --v-brand: #00ff00 }");
		expect(css).toContain(".v-bg-brand-d-1 { background-color: var(--v-brand-d-1) }");
		expect(css).toContain(".v-p-m { padding: var(--v-space-m) }");
		expect(css).toContain(".v-font-body { font-family: var(--v-font-body) }");
		expect(frameworkTokens(fw).colors[0]).toBe("var(--v-brand)");
	});

	it("puts framework, selectors and the user stylesheet in one sheet", () => {
		const data = visualDataSchema.parse({
			selectors: [{ id: "s1", selector: ".card", styles: { color: "red" } }],
			stylesheet: ".x { color: blue }",
		});
		const css = visualCss(data);
		expect(css.indexOf(":root")).toBeLessThan(css.indexOf(".card { color: red }"));
		expect(css.endsWith(".x { color: blue }")).toBe(true);
	});
});
