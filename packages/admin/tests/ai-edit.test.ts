import { describe, expect, it } from "vitest";
import { themeEdits } from "../src/components/visual-editor/ai-edit.ts";
import type { ThemeElement } from "../src/components/visual-editor/theme-element.ts";

const el = (tailwind: boolean): ThemeElement => ({
	selection: 1,
	file: "/t/src/pages/a.astro",
	loc: "3:5",
	uses: 1,
	ownUse: false,
	tag: "h1",
	text: "Tags",
	cls: "title text-lg",
	style: "padding-top: 6rem",
	attrs: {},
	computed: {},
	tailwind,
});

describe("AI edits for theme elements", () => {
	it("writes styles as Tailwind classes, keeping the others", () => {
		expect(
			themeEdits(el(true), { ref: "e1", text: "Etiketler", styles: { color: "#e11d48", "font-size": "" } }),
		).toEqual([
			{ action: "text", value: "Etiketler", code: true },
			{ action: "attrs", attrs: { class: "title text-[#e11d48]" } },
		]);
	});

	it("writes inline style without Tailwind, and skips what does not change", () => {
		expect(themeEdits(el(false), { ref: "e1", tag: "h1", text: "Tags", styles: { color: "red" } })).toEqual([
			{ action: "attrs", attrs: { style: "padding-top: 6rem; color: red" } },
		]);
	});
});
