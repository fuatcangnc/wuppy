import { describe, expect, it } from "vitest";
import { editAstroElement } from "../../src/themes/astro-edit.ts";

const page = `---
import L from "../L.astro";
const tags = ["a"];
---
<L>
  <main class="container">
    <h1>Tags</h1>
    <p>One</p>
    <img src="/x.png" />
    {tags.map((t) => <a href={t} class={t}>#{t}</a>)}
  </main>
</L>
`;

describe("editing a theme .astro element", () => {
	it("changes static text and reports the element's location", () => {
		const out = editAstroElement(page, "7:9", { action: "text", value: "Etiketler {x} <b>" });
		expect(out.source).toContain("<h1>Etiketler &#123;x&#125; &lt;b&gt;</h1>");
		expect(out.loc).toBe("7:9");
	});

	it("sets, adds and removes class and style", () => {
		// Astro keeps entities in attributes, so `&` and `"` go in a JS string.
		const out = editAstroElement(page, "6:27", {
			action: "attrs",
			attrs: { class: "wide sm:[&>*]:h-full", style: 'color: "red"' },
		});
		expect(out.source).toContain('<main style={"color: \\"red\\""} class={"wide sm:[&>*]:h-full"}>');
		const loc = out.loc!;
		expect(editAstroElement(out.source, loc, { action: "attrs", attrs: { class: null } }).source).toContain(
			'<main style={"color: \\"red\\""}>',
		);
		// A self-closing element is located inside its tag.
		expect(editAstroElement(page, "9:6", { action: "attrs", attrs: { class: "pic" } }).source).toContain(
			'<img class="pic" src="/x.png" />',
		);
	});

	it("sets any attribute and renames the tag", () => {
		const out = editAstroElement(page, "8:8", { action: "attrs", attrs: { hidden: "", "aria-label": "x" } });
		expect(out.source).toContain('<p aria-label="x" hidden>One</p>');
		expect(editAstroElement(page, "8:8", { action: "tag", name: "h2" }).source).toContain("<h2>One</h2>");
		expect(() => editAstroElement("<L><p>x</p></L>\n", "1:5", { action: "tag", name: "div" }, "l")).toThrow(
			/Components/,
		);
	});

	it("deletes, duplicates and moves whole lines", () => {
		expect(editAstroElement(page, "8:8", { action: "delete" }).source).not.toContain("<p>One</p>");
		expect(editAstroElement(page, "8:8", { action: "duplicate" }).source).toContain("    <p>One</p>\n    <p>One</p>\n");
		const up = editAstroElement(page, "8:8", { action: "move", by: -1 });
		expect(up.source).toContain("    <p>One</p>\n    <h1>Tags</h1>\n");
		expect(up.loc).toBe("7:8");
	});

	it("refuses text made by code and elements inside expressions", () => {
		expect(() => editAstroElement(page, "10:44", { action: "text", value: "x" })).toThrow(/Code view/);
		expect(() => editAstroElement(page, "10:44", { action: "attrs", attrs: { class: "x" } })).toThrow(/set by code/);
		expect(() => editAstroElement(page, "10:44", { action: "move", by: -1 })).toThrow(/made by code/);
	});

	it("inserts markup after an element and reports where it landed", () => {
		const out = editAstroElement(page, "7:9", { action: "insert", html: '<a class="btn" href="/">Go</a>' });
		expect(out.source).toContain('    <h1>Tags</h1>\n    <a class="btn" href="/">Go</a>\n    <p>One</p>');
		expect(out.loc).toBe("8:29"); // Astro locates an element at its first child
		expect(() => editAstroElement(page, "10:44", { action: "insert", html: "<b>x</b>" })).toThrow(/made by code/);
		expect(() => editAstroElement(page, "7:9", { action: "insert", html: "just text" })).toThrow(
			/start with an element/,
		);
	});

	it("moves an element before, after or into another one", () => {
		const src = "<main>\n\t<h1>A</h1>\n\t<p>B</p>\n\t<section>\n\t\t<b>C</b>\n\t</section>\n</main>\n";
		const after = editAstroElement(src, "2:6", { action: "moveTo", loc: "3:5", tag: "p", position: "after" });
		expect(after.source).toBe("<main>\n\t<p>B</p>\n\t<h1>A</h1>\n\t<section>\n\t\t<b>C</b>\n\t</section>\n</main>\n");
		expect(after.loc).toBe("3:6");
		const before = editAstroElement(src, "3:5", { action: "moveTo", loc: "2:6", tag: "h1", position: "before" });
		expect(before.source).toBe(after.source);
		expect(before.loc).toBe("2:5");
		const inside = editAstroElement(src, "2:6", { action: "moveTo", loc: "4:11", tag: "section", position: "inside" });
		expect(inside.source).toBe(
			"<main>\n\t<p>B</p>\n\t<section>\n\t\t<b>C</b>\n\t\t<h1>A</h1>\n\t</section>\n</main>\n",
		);
		expect(() =>
			editAstroElement(src, "4:11", { action: "moveTo", loc: "5:6", tag: "b", position: "inside" }, "section"),
		).toThrow(/inside itself/);
	});

	it("replaces text made by code only when asked", () => {
		const src = "<h1>{site.title}</h1>\n<ul>{xs.map((x) => <li>{x}</li>)}</ul>\n";
		expect(() => editAstroElement(src, "1:5", { action: "text", value: "Fuat" })).toThrow(/Code view/);
		expect(editAstroElement(src, "1:5", { action: "text", value: "Fuat", code: true }).source).toContain(
			"<h1>Fuat</h1>",
		);
	});

	it("says when a text or attribute edit moves no other element", () => {
		expect(editAstroElement(page, "7:9", { action: "text", value: "Etiketler" }).quiet).toBe(true);
		expect(editAstroElement(page, "6:27", { action: "attrs", attrs: { class: "wide" } }).quiet).toBe(true);
		expect(editAstroElement(page, "7:9", { action: "tag", name: "h2" }).quiet).toBeUndefined();
		// The <b> after it on the same line shifts.
		expect(
			editAstroElement("<p><i>a</i><b>b</b></p>\n", "1:7", { action: "text", value: "longer" }).quiet,
		).toBeUndefined();
	});

	it("tells an element from the empty child it opens with", () => {
		const src = '<h3><a href="/"></a></h3>\n';
		expect(editAstroElement(src, "1:6", { action: "attrs", attrs: { class: "t" } }, "h3").source).toBe(
			'<h3 class="t"><a href="/"></a></h3>\n',
		);
		expect(editAstroElement(src, "1:6", { action: "attrs", attrs: { class: "l" } }, "a").source).toBe(
			'<h3><a class="l" href="/"></a></h3>\n',
		);
	});
});
