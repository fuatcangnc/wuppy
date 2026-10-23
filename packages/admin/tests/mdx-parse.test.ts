import { describe, expect, it } from "vitest";
import { parse, serialize } from "../src/components/visual-editor/mdx.ts";

describe("visual MDX parser", () => {
	it("turns single-line plain HTML with Tailwind classes into a visual node", () => {
		const tree = parse(`<p class="text-red-500">dsadas</p>`);
		const root = tree.nodes[tree.rootNodeId]!;
		const node = tree.nodes[root.children[0]!]!;
		expect(node.moduleId).toBe("text");
		expect(node.props.class).toBe("text-red-500");
		expect(node.props.text).toBe("dsadas");
		expect(serialize(tree, [])).toContain('class="text-red-500"');
	});

	it("keeps multi-line JSX/MDX as a Markdown block", () => {
		const tree = parse(`<section className="bg-zinc-900">\n  <p>Hello</p>\n</section>`);
		const root = tree.nodes[tree.rootNodeId]!;
		const node = tree.nodes[root.children[0]!]!;
		expect(node.moduleId).toBe("markdown");
		expect(node.props.source).toContain("<section");
	});
});
