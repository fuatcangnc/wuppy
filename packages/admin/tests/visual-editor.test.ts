import { beforeEach, describe, expect, it } from "vitest";
import { importHtml, parse, safeCssValue, serialize } from "../src/components/visual-editor/markdown.ts";
import { PRESETS } from "../src/components/visual-editor/modules.ts";
import {
	$context,
	$selected,
	$state,
	$visual,
	$tree,
	addPreset,
	componentize,
	copySelected,
	detachSelected,
	paste,
	setStyle,
	dropNode,
	load,
	mutate,
	redo,
	undo,
} from "../src/components/visual-editor/store.ts";
import {
	duplicateNode,
	resolveDrop,
	updateNodeProps,
	wrapNode,
	createNode,
} from "../src/components/visual-editor/tree.ts";
import { $doc } from "../src/stores/editor.ts";
import { defaultVisualData, pageCss } from "@wuppy/visual-editor";

const preset = (label: string) => PRESETS.find((p) => p.label === label)!;
const rootChildren = () => $tree.get().nodes[$tree.get().rootNodeId]!.children;

beforeEach(() => {
	$doc.set({ collection: "pages", slug: "a", data: {}, body: "", saved: { data: {}, body: "" } });
	$visual.set(defaultVisualData());
	$context.set("");
	$state.set("");
	load("");
});

describe("visual editor body format", () => {
	it("keeps hand-written Markdown as-is and round-trips visual blocks", () => {
		const body = '# Title\n\nSome *text*.\n\n```html\n<p data-ve="text">not a block</p>\n```\n';
		load(body);
		expect(serialize($tree.get())).toBe(body);

		addPreset(preset("Columns"));
		addPreset(preset("Heading"));
		const out = serialize($tree.get());
		expect(serialize(parse(out))).toBe(out);
		expect(out).toContain('<div data-ve="container" style="padding: 32px 16px; display: grid;');
	});

	it("escapes what an author types so it never becomes Markdown, JSX or an attribute", () => {
		addPreset(preset("Text"));
		const id = $selected.get()!;
		mutate((d) => updateNodeProps(d, id, { text: 'a {x} <b> *y* _z_ `c` [l](u) "q"\nline 2', class: 'c" onload="x' }));
		const out = serialize($tree.get());
		expect(out).toBe(
			'<p data-ve="text" class="c&quot; onload=&quot;x">a &#123;x&#125; &lt;b&gt; &#42;y&#42; &#95;z&#95; &#96;c&#96; &#91;l&#93;(u) "q"<br />line 2</p>\n',
		);
		const back = parse(out);
		const text = back.nodes[back.nodes[back.rootNodeId]!.children[0]!]!;
		expect(text.props).toEqual({ text: 'a {x} <b> *y* _z_ `c` [l](u) "q"\nline 2', class: 'c" onload="x' });
	});

	it("drops CSS that could break out of the declaration or load code", () => {
		for (const bad of ["red; background: url(x)", "url(javascript:alert(1))", "expression(1)", "x}<style>", 'a"b'])
			expect(safeCssValue(bad), bad).toBe(false);
		expect(safeCssValue("url(/media/a.png) center / cover")).toBe(true);
		expect(safeCssValue("url(https://example.com/a.png)")).toBe(true);
		expect(safeCssValue("url(http://example.com/a.png)")).toBe(false);
	});

	it("writes the body of the open entry on every change and undoes it", () => {
		addPreset(preset("Button"));
		expect($doc.get()?.body).toContain('<a data-ve="button" href="/"');
		undo();
		expect($doc.get()?.body).toBe("\n");
		redo();
		expect($doc.get()?.body).toContain("Click me");
	});
});

describe("visual editor tree", () => {
	it("moves by drag-and-drop, never into itself, and keeps Markdown at the top level", () => {
		load("Intro text");
		addPreset(preset("Container"));
		const box = $selected.get()!;
		addPreset(preset("Text"));
		const text = $selected.get()!;
		expect($tree.get().nodes[text]!.parentId).toBe(box);
		const [md] = rootChildren();

		expect(dropNode(box, text, "inside")).toBe(false);
		expect(dropNode(md!, box, "inside")).toBe(false);
		expect(dropNode(text, md!, "before")).toBe(true);
		expect(rootChildren()[0]).toBe(text);
	});

	it("duplicates and wraps a subtree with fresh ids and consistent parents", () => {
		addPreset(preset("Columns"));
		const cols = $selected.get()!;
		mutate((d) => {
			const copy = duplicateNode(d, cols);
			wrapNode(d, copy, createNode("container"));
		});
		const tree = $tree.get();
		for (const n of Object.values(tree.nodes)) for (const c of n.children) expect(tree.nodes[c]!.parentId).toBe(n.id);
		expect(Object.keys(tree.nodes)).toHaveLength(1 + 3 + 1 + 3);
		expect(resolveDrop(tree, cols, cols, "inside", () => true)).toBeNull();
	});
});

describe("visual editor responsive styles, components and import", () => {
	it("stores breakpoint and state styles on the element and turns them into page CSS", () => {
		addPreset(preset("Heading"));
		setStyle("color", "red");
		$context.set("mobile");
		setStyle("font-size", "20px");
		$context.set("");
		$state.set(":hover");
		setStyle("color", "blue");
		const out = serialize($tree.get());
		expect(out).toMatch(
			/<h2 data-ve="heading" class="ve-[a-z0-9]+" style="color: red" data-ve-r='\{"mobile":\{"font-size":"20px"\},"\|:hover":\{"color":"blue"\}\}'>/,
		);
		const back = parse(out);
		const h = back.nodes[back.nodes[back.rootNodeId]!.children[0]!]!;
		expect(h.overrides).toEqual({ mobile: { "font-size": "20px" }, "|:hover": { color: "blue" } });
		expect(serialize(back)).toBe(out);
		const css = pageCss(out, defaultVisualData());
		expect(css).toContain(":hover { color: blue !important }");
		expect(css).toContain("@media (max-width: 375px) { .ve-");
	});

	it("makes a component, writes its markup into the page with a slot, and detaches it back", () => {
		addPreset(preset("Card"));
		componentize("Promo");
		const ref = $selected.get()!;
		expect($tree.get().nodes[ref]!.moduleId).toBe("ref");
		const out = serialize($tree.get(), $visual.get().components);
		expect(out).toContain('data-ve="ref" data-ve-ref="promo"');
		expect(out).toContain("Card title");
		const back = parse(out);
		expect(Object.values(back.nodes).filter((n) => n.moduleId === "ref")).toHaveLength(1);
		detachSelected();
		const after = serialize($tree.get(), $visual.get().components);
		expect(after).not.toContain("data-ve-ref");
		expect(after).toContain("Card title");
	});

	it("copies and pastes a subtree through the clipboard", () => {
		addPreset(preset("Hero"));
		expect(copySelected()).toBe(true);
		expect(paste()).toBe(true);
		expect(rootChildren()).toHaveLength(2);
		expect(serialize($tree.get()).match(/A clear headline/g)).toHaveLength(2);
	});

	it("imports pasted HTML as modules and drops scripts and forms", () => {
		const nodes = importHtml(
			'<section class="hero"><h1 style="color: red">Hi</h1><p>Text</p><a class="btn" href="/x">Go</a><script>alert(1)</script><form><input></form></section>',
		);
		expect(nodes).toHaveLength(1);
		expect(nodes[0]!.props).toEqual({ tag: "section", class: "hero" });
		expect(nodes[0]!.children.map((n) => n.moduleId)).toEqual(["heading", "text", "button"]);
		expect(nodes[0]!.children[0]!.styles).toEqual({ color: "red" });
	});
});
