import { describe, expect, it } from "vitest";
import { parse, serialize } from "../src/components/visual-editor/markdown.ts";

describe("visual Markdown parser", () => {
	it("turns single-line plain HTML with Tailwind classes into a visual node", () => {
		const tree = parse(`<p class="text-red-500">dsadas</p>`);
		const root = tree.nodes[tree.rootNodeId]!;
		const node = tree.nodes[root.children[0]!]!;
		expect(node.moduleId).toBe("text");
		expect(node.props.class).toBe("text-red-500");
		expect(node.props.text).toBe("dsadas");
		expect(serialize(tree, [])).toContain('class="text-red-500"');
	});

	it("reads className pasted from JSX as class", () => {
		const tree = parse(`<p className="lead">Hi</p>`);
		const node = tree.nodes[tree.nodes[tree.rootNodeId]!.children[0]!]!;
		expect(node.props.class).toBe("lead");
		expect(serialize(tree, [])).not.toContain("className");
	});

	it("keeps multi-line HTML as a Markdown block", () => {
		const tree = parse(`<section className="bg-zinc-900">\n  <p>Hello</p>\n</section>`);
		const root = tree.nodes[tree.rootNodeId]!;
		const node = tree.nodes[root.children[0]!]!;
		expect(node.moduleId).toBe("markdown");
		expect(node.props.source).toContain("<section");
	});

	it("round-trips a theme Astro component as a visual component node", () => {
		const tree = parse('<Callout data-ve="component" data-ve-name="Callout" type="tip">Hello</Callout>');
		const root = tree.nodes[tree.rootNodeId]!;
		const node = tree.nodes[root.children[0]!]!;
		expect(node.moduleId).toBe("component");
		expect(node.props.name).toBe("Callout");
		expect(serialize(tree, [])).toContain('data-ve="component" data-ve-name="Callout"');
	});
});
