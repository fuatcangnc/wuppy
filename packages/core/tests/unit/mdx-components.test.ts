import { describe, expect, it } from "vitest";
import { findDisallowed } from "../../src/mdx/index.ts";

const allowed = ["Callout", "Figure"];
const mdx = (body: string) => findDisallowed(body, allowed, "mdx");
const md = (body: string) => findDisallowed(body, allowed, "md");

describe("findDisallowed (MDX)", () => {
	it("allows plain markdown, listed components and JSON props", async () => {
		expect(
			await mdx(
				'# Hi\n\nText with <Callout type="note" level={2} tags={["a", "b"]}>x **y**</Callout>\n\n<Figure src="/a.png" />\n\n{/* a note */}',
			),
		).toEqual([]);
	});
	it("flags unlisted and member components", async () => {
		expect(await mdx("<Evil />\n\n<Callout>ok</Callout>")).toEqual(["Evil"]);
		expect(await mdx("<x.y />")).toEqual(["x.y"]);
	});
	it("flags imports, exports and every JavaScript expression", async () => {
		expect(await mdx('import x from "node:fs";\n\ntext')).toEqual(["import"]);
		expect(await mdx("export const a = 1;")).toEqual(["export"]);
		expect(await mdx("Hello {process.env.WUPPY_SECRET}")).toEqual(["{expression}"]);
		expect(await mdx("{/* a */ fetch('x') /* b */}")).toEqual(["{expression}"]);
		expect(await mdx('<Callout type={fetch("x")}>a</Callout>')).toEqual(["type={…}"]);
		expect(await mdx("<Callout {...props}>a</Callout>")).toEqual(["{...spread}"]);
	});
	it("flags dangerous elements, event handlers, directives and code URLs", async () => {
		expect(await mdx("<script>alert(1)</script>")).toEqual(["script"]);
		expect(await mdx('<img src="x" onError="alert(1)" />')).toEqual(["onError"]);
		expect(await mdx('<Callout set:html="<b>x</b>">a</Callout>')).toEqual(["set:html"]);
		expect(await mdx('<a href="java\tscript:alert(1)">x</a>')).toEqual(["javascript:"]);
		expect(await mdx("[x](javascript:alert(1))")).toEqual(["javascript:"]);
		expect(await mdx('<img src="data:image/png;base64,AAAA" />')).toEqual([]);
	});
	it("ignores code and reports MDX that would not compile", async () => {
		expect(await mdx("```html\n<script>1</script>\n```\n\nUse `<Evil />` carefully.")).toEqual([]);
		expect(await mdx("if a < b and c > d")).toEqual([]);
		expect((await mdx("<Callout>never closed"))[0]).toMatch(/^invalid MDX: /);
	});
});

describe("findDisallowed (Markdown)", () => {
	it("allows ordinary Markdown and harmless HTML", async () => {
		expect(await md('# Hi\n\n<b>bold</b> and <img src="/a.png" alt="a">\n\n{not code here}')).toEqual([]);
	});
	it("flags dangerous HTML, event handlers and code URLs", async () => {
		expect(await md("<script>alert(1)</script>")).toEqual(["script"]);
		expect(await md("<iframe src=x></iframe>")).toEqual(["iframe"]);
		expect(await md("<img src=x onerror=alert(1)>")).toEqual(["onerror"]);
		expect(await md('<a href="javascript:alert(1)">x</a>')).toEqual(["javascript:"]);
		expect(await md("[x](javascript:alert(1))")).toEqual(["javascript:"]);
	});
});
