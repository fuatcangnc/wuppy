import { describe, expect, it } from "vitest";
import { classInCode } from "../../src/themes/astro-edit.ts";
import { editInstance, passesClass } from "../../src/themes/instance-edit.ts";
import { applyOverlay } from "../../src/themes/overlay.ts";

// Stand-in for tailwind-merge: a later gap-* replaces an earlier one.
const merge = (classes: string) =>
	classes
		.split(" ")
		.filter((c, i, all) => !(c.startsWith("gap-") && all.slice(i + 1).some((d) => d.startsWith("gap-"))))
		.join(" ");

const page = `export const Page = () => (
	<main>
		<Header title="A" />
		<Header title="B" className="mt-4" />
	</main>
);
`;
// The build marks an element at its first child.
const host = (slot: number) => ({ file: "src/page.tsx", loc: "3:4", tag: "main", slot, count: 2 });

describe("classInCode", () => {
	const code = `{cn("flex gap-5", align === "center" ? "items-center" : "items-start", className)}`;

	it("adds to the first literal and removes from every literal", () => {
		expect(classInCode(code, "flex gap-5 items-start", "flex gap-8 items-start grid")).toBe(
			`{cn("flex gap-8 grid", align === "center" ? "items-center" : "items-start", className)}`,
		);
	});

	it("leaves compared strings alone", () => {
		expect(classInCode(code, "flex gap-5", "flex gap-5 center")).toContain(`=== "center"`);
	});
});

describe("editInstance", () => {
	const o = { jsx: true, takesClass: true, merge };

	it("puts a class on this use only, replacing the component's", () => {
		const out = editInstance(
			page,
			"3:4",
			host(1),
			{
				action: "attrs",
				attrs: { class: "flex gap-8 mt-4" },
				from: { class: "flex gap-5 mt-4" },
			},
			o,
		);
		expect(out.source).toContain(`<Header title="A" />`);
		expect(out.source).toContain(`<Header title="B" className="gap-8 mt-4" />`);
	});

	it("will not drop a class of the component for one use", () => {
		expect(() =>
			editInstance(
				page,
				"3:4",
				host(0),
				{ action: "attrs", attrs: { class: "gap-5" }, from: { class: "flex gap-5" } },
				o,
			),
		).toThrow(/"flex" comes from Header/);
	});

	it("deletes, copies and moves the call, and says where this use went", () => {
		expect(editInstance(page, "3:4", host(0), { action: "delete" }, o).source).not.toContain(`title="A"`);
		expect(editInstance(page, "3:4", host(1), { action: "duplicate" }, o).source.match(/title="B"/g)).toHaveLength(2);
		const moved = editInstance(page, "3:4", host(1), { action: "move", by: -1 }, o);
		expect(moved.source.indexOf(`title="B"`)).toBeLessThan(moved.source.indexOf(`title="A"`));
		expect(moved.slot).toBe(0);
	});

	it("gives up when code renders some of the children", () => {
		const mapped = page.replace(`<Header title="B" className="mt-4" />`, `{items.map((i) => <Header title={i} />)}`);
		expect(() => editInstance(mapped, "3:4", host(0), { action: "delete" }, o)).toThrow(/which use/);
	});

	it("knows when a component takes a class", () => {
		const ui = `export const Header = ({ className }) => <div className={cn("flex", className)} />;\n`;
		expect(passesClass(ui, "1:43", "div", true)).toBe(true);
		expect(passesClass(ui.replace(", className)", ")"), "1:43", "div", true)).toBe(false);
	});
});

const mark = (file: string, loc: string) => `data-wuppy-file="${file}" data-wuppy-loc="${loc}"`;

describe("overlay on one use", () => {
	const header = `<div class="flex gap-5" ${mark("src/ui.tsx", "6:3")}></div>`;
	const html = `<main ${mark("src/page.tsx", "2:2")}>${header}${header}</main>`;

	it("changes only the use the edit was made on", () => {
		const out = applyOverlay(html, [
			{
				file: "src/ui.tsx",
				loc: "6:3",
				host: { file: "src/page.tsx", loc: "2:2", slot: 1 },
				edit: { action: "attrs", attrs: { class: "flex gap-8" }, from: { class: "flex gap-5" } },
			},
		]);
		expect(out.match(/class="flex gap-5"/g)).toHaveLength(1);
		expect(out.indexOf("gap-8")).toBeGreaterThan(out.indexOf("gap-5"));
	});
});
