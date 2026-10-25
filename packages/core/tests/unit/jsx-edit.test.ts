import { describe, expect, it } from "vitest";
import { markSource } from "../../src/astro/source-marks.ts";
import { editAstroElement, htmlToJsx } from "../../src/themes/astro-edit.ts";

const SRC = `import { cn } from "@/lib/utils";

export function Hero({ items }: { items: string[] }) {
	return (
		<section className="py-20">
			<h1 className="text-4xl">Hello {"world"}</h1>
			<p className="lead">Plain text</p>
			<ul>{items.map((i) => <li key={i}>{i}</li>)}</ul>
			<div className={cn("a", "b")} style={{ color: "red" }}>x</div>
		</section>
	);
}
`;

const locOf = async (tag: string) => {
	const marked = await markSource(SRC, "src/components/hero.tsx");
	return new RegExp(`<${tag} data-wuppy-file="src/components/hero.tsx" data-wuppy-loc="([^"]+)"`).exec(marked)![1]!;
};

describe("React (.tsx) theme elements", () => {
	it("marks intrinsic elements, not components, and the marked file still parses as TSX", async () => {
		const marked = await markSource(SRC, "src/components/hero.tsx");
		expect(marked.match(/data-wuppy-loc=/g)).toHaveLength(6);
		expect(marked).toContain('<li data-wuppy-file="src/components/hero.tsx"');
	});

	it("edits text, class and style the React way", async () => {
		const p = await locOf("p");
		expect(editAstroElement(SRC, p, { action: "text", value: "New {text}" }, "p", true).source).toContain(
			'<p className="lead">New &#123;text&#125;</p>',
		);
		expect(editAstroElement(SRC, p, { action: "attrs", attrs: { class: "lead mt-4" } }, "p", true).source).toContain(
			'<p className="lead mt-4">',
		);
		expect(
			editAstroElement(SRC, p, { action: "attrs", attrs: { style: "padding-top: 1rem; --x: 2" } }, "p", true).source,
		).toContain('<p style={{ "paddingTop": "1rem", "--x": "2" }} className="lead">');
		const div = await locOf("div");
		expect(
			editAstroElement(SRC, div, { action: "attrs", attrs: { style: "color: blue" } }, "div", true).source,
		).toContain('style={{ "color": "blue" }}');
		expect(() => editAstroElement(SRC, div, { action: "attrs", attrs: { class: "c" } }, "div", true)).toThrow(
			/set by code/,
		);
	});

	it("inserts editor markup as JSX and deletes elements", async () => {
		const p = await locOf("p");
		const inserted = editAstroElement(
			SRC,
			p,
			{ action: "insert", html: '<div class="x" style="margin: 0"><img src="a.png"><br></div>' },
			"p",
			true,
		).source;
		expect(inserted).toContain('\n\t\t\t<div className="x" style={{ "margin": "0" }}><img src="a.png" /><br /></div>');
		expect(editAstroElement(SRC, p, { action: "delete" }, "p", true).source).not.toContain("Plain text");
		const li = await locOf("li");
		expect(() => editAstroElement(SRC, li, { action: "insert", html: "<li>y</li>" }, "li", true)).toThrow(
			/made by code/,
		);
	});

	it("converts HTML to JSX", () => {
		expect(htmlToJsx('<label for="a" class="b">x</label><input type="text">')).toBe(
			'<label htmlFor="a" className="b">x</label><input type="text" />',
		);
	});
});
