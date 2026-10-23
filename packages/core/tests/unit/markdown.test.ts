import { describe, expect, it } from "vitest";
import { mdxToMarkdown } from "../../src/cli/mdx-to-md.ts";
import { componentTags, findDisallowed, stripComponentImports } from "../../src/markdown/index.ts";
import { markdownContent } from "../../src/markdown/render.ts";

const md = (body: string) => findDisallowed(body, [], "md");
const mdx = (body: string) => findDisallowed(body, ["Callout", "Figure"], "mdx");

describe("findDisallowed", () => {
	it("allows ordinary Markdown and harmless HTML", async () => {
		expect(await md('# Hi\n\n<b>bold</b> and <img src="/a.png" alt="a">\n\n{not code here}')).toEqual([]);
		expect(await md("```html\n<script>1</script>\n```\n\nUse `<Evil />` carefully.")).toEqual([]);
	});
	it("flags dangerous HTML, event handlers, code URLs and components", async () => {
		expect(await md("<script>alert(1)</script>")).toEqual(["script"]);
		expect(await md("<iframe src=x></iframe>")).toEqual(["iframe"]);
		expect(await md("<img src=x onerror=alert(1)>")).toEqual(["onerror"]);
		expect(await md('<a href="java\tscript:alert(1)">x</a>')).toEqual(["javascript:"]);
		expect(await md("[x](javascript:alert(1))")).toEqual(["javascript:"]);
		expect(await md("<Callout>x</Callout>")).toEqual(["Callout"]);
		expect(await findDisallowed("<Callout />", ["Callout"], "md")).toEqual(["Callout"]);
	});
});

describe("findDisallowed (MDX)", () => {
	it("allows listed components and JSON props, and flags imports and expressions", async () => {
		expect(
			await mdx(
				'# Hi\n\n<Callout type="note" level={2} tags={["a", "b"]}>x **y**</Callout>\n\n<Figure src="/a.png" />',
			),
		).toEqual([]);
		expect(await mdx("<Evil />")).toEqual(["Evil"]);
		expect(await mdx('import x from "./x.astro";')).toEqual(["import"]);
		expect(await mdx("Hello {process.env.SECRET}")).toEqual(["{expression}"]);
	});

	it("strips theme component imports and detects component tags", async () => {
		const body = 'import Callout from "../../components/Callout.astro";\n\n<Callout type="tip">Hi</Callout>';
		expect(stripComponentImports(body)).toBe('<Callout type="tip">Hi</Callout>');
		expect(await componentTags(body)).toEqual(["Callout"]);
	});

	it("finds component tags in a body that is not valid MDX yet, so it is checked as MDX", async () => {
		const body = '<div data-ve="container"></div>\n\n</div>\n\n<BackToTop data-ve="component" />';
		expect(await componentTags(body)).toEqual(["BackToTop"]);
		expect((await findDisallowed(body, ["BackToTop"], "mdx"))[0]).toMatch(/^invalid MDX: .*<\/div>/);
	});
});

describe("markdownContent", () => {
	it("renders Markdown with heading ids and refuses unsafe bodies", async () => {
		const { html, headings } = await markdownContent('## Hello there\n\n<p class="x">hi</p>');
		expect(html).toContain('<h2 id="hello-there">');
		expect(html).toContain('<p class="x">hi</p>');
		expect(headings).toEqual([{ depth: 2, slug: "hello-there", text: "Hello there" }]);
		await expect(markdownContent("<script>1</script>")).rejects.toThrow(/not allowed: script/);
	});
});

describe("mdxToMarkdown", () => {
	it("converts plain MDX and reports components and expressions", async () => {
		const out = await mdxToMarkdown(
			'---\ntitle: A\n---\nimport X from "./x.astro";\n\n{/* note */}\n<div className="a">**b**</div>\n\n```js\nconst a = {b};\n```\n',
		);
		expect(out).toEqual({
			markdown: '---\ntitle: A\n---\n<!-- note -->\n<div class="a">**b**</div>\n\n```js\nconst a = {b};\n```\n',
		});
		expect(await mdxToMarkdown("<Callout>x</Callout>")).toEqual({ problems: ["Callout"] });
		expect(await mdxToMarkdown("Hi {name}")).toEqual({ problems: ["JSX expression {…}", "{expression}"] });
	});
});
