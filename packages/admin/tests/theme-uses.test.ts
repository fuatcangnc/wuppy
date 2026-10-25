import { beforeEach, describe, expect, it, vi } from "vitest";
import { describeElement, isCopy } from "../src/components/visual-editor/theme-element.ts";

const mark = (file: string, loc: string) => `data-wuppy-file="${file}" data-wuppy-loc="${loc}"`;
const header = `<div class="flex" ${mark("src/ui.tsx", "106:5")}><h2 ${mark("src/ui.tsx", "110:9")}>T</h2></div>`;

describe("uses of a theme component", () => {
	// jsdom's computed style cannot be listed.
	beforeEach(() => {
		vi.spyOn(window, "getComputedStyle").mockReturnValue(
			Object.assign([], { getPropertyValue: () => "" }) as unknown as CSSStyleDeclaration,
		);
	});

	it("tells apart the uses of a component in different places", () => {
		document.body.innerHTML = `
			<div ${mark("src/gallery.tsx", "10:3")}>${header}<div ${mark("src/gallery.tsx", "12:5")}></div></div>
			<div ${mark("src/stories.tsx", "8:3")}>${header}</div>`;
		const [first, second] = document.querySelectorAll<HTMLElement>(".flex");
		const el = describeElement(first!);
		expect(el).toMatchObject({
			uses: 2,
			ownUse: true,
			host: { file: "src/gallery.tsx", loc: "10:3", tag: "div", slot: 0, count: 1 },
		});
		expect(isCopy(first!, el)).toBe(true);
		expect(isCopy(second!, el)).toBe(false);
		// An element inside the component: edits change the component, for every use.
		expect(describeElement(first!.querySelector("h2")!)).toMatchObject({ uses: 2, ownUse: false });
	});

	it("keeps a list's copies together", () => {
		document.body.innerHTML = `<ul ${mark("src/list.tsx", "3:3")}>${header}${header}</ul>`;
		const [first, second] = document.querySelectorAll<HTMLElement>(".flex");
		const el = describeElement(first!);
		expect(el).toMatchObject({ uses: 1, ownUse: false });
		expect(isCopy(second!, el)).toBe(true);
	});
});
