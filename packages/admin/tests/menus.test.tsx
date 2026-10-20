import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { MenuItemsEditor } from "../src/components/menus/MenuItemsEditor.tsx";
import { add, indent, outdent, relocate, remove, shift, update, type MenuItem } from "../src/components/menus/tree.ts";

const link = (label: string, children: string[] = []): MenuItem => ({
	label,
	href: `/${label.toLowerCase()}`,
	children: children.map((c) => ({ label: c, href: `/${c.toLowerCase()}` })),
});
const shape = (items: MenuItem[]) =>
	items.map((i) => (i.children.length ? `${i.label}[${i.children.map((c) => c.label).join(",")}]` : i.label));
const base = () => [link("Home"), link("Blog", ["News", "Tips"]), link("About")];

describe("menu tree", () => {
	it("adds, edits and removes without touching the original", () => {
		const items = base();
		expect(shape(add(items))).toEqual(["Home", "Blog[News,Tips]", "About", "New link"]);
		expect(shape(update(items, [1, 0], { label: "Latest" }))).toEqual(["Home", "Blog[Latest,Tips]", "About"]);
		expect(shape(remove(items, [1, 1]))).toEqual(["Home", "Blog[News]", "About"]);
		expect(shape(remove(items, [0]))).toEqual(["Blog[News,Tips]", "About"]);
		expect(shape(items)).toEqual(["Home", "Blog[News,Tips]", "About"]);
	});

	it("shifts within a level and stops at the ends", () => {
		expect(shape(shift(base(), [2], -1))).toEqual(["Home", "About", "Blog[News,Tips]"]);
		expect(shape(shift(base(), [1, 0], 1))).toEqual(["Home", "Blog[Tips,News]", "About"]);
		const items = base();
		expect(shift(items, [0], -1)).toBe(items);
		expect(shift(items, [1, 1], 1)).toBe(items);
	});

	it("indents into the item above and outdents after the parent; menus stay two levels deep", () => {
		expect(shape(indent(base(), [2]))).toEqual(["Home", "Blog[News,Tips,About]"]);
		expect(shape(indent(base(), [0]))).toEqual(["Home", "Blog[News,Tips]", "About"]); // nothing above
		const items = base();
		expect(indent(items, [1])).toBe(items); // Blog has children
		expect(shape(outdent(base(), [1, 0]))).toEqual(["Home", "Blog[Tips]", "News", "About"]);
	});

	it("relocates by drag: reorder, into a submenu, and out of one", () => {
		expect(shape(relocate(base(), [2], [0]))).toEqual(["About", "Home", "Blog[News,Tips]"]);
		expect(shape(relocate(base(), [0], [2]))).toEqual(["Blog[News,Tips]", "Home", "About"]);
		expect(shape(relocate(base(), [1, 1], [1, 0]))).toEqual(["Home", "Blog[Tips,News]", "About"]);
		expect(shape(relocate(base(), [1, 0], [0]))).toEqual(["News", "Home", "Blog[Tips]", "About"]);
		expect(shape(relocate(base(), [0], [1, 0]))).toEqual(["Blog[Home,News,Tips]", "About"]);
		const items = base();
		expect(relocate(items, [1], [0, 0])).toBe(items); // Blog has children, so it cannot become a child
		expect(relocate(items, [0], [0])).toBe(items);
	});
});

function Harness({ initial }: { initial: MenuItem[] }) {
	const [items, setItems] = useState(initial);
	return (
		<>
			<MenuItemsEditor items={items} onChange={setItems} />
			<output aria-label="shape">{shape(items).join("|")}</output>
		</>
	);
}

describe("MenuItemsEditor", () => {
	it("edits in place and reorders with the buttons", async () => {
		render(<Harness initial={base()} />);
		const user = userEvent.setup();
		fireEvent.change(screen.getByLabelText("Label of About"), { target: { value: "Contact" } });
		await user.click(screen.getByLabelText("Move Contact up"));
		expect(screen.getByLabelText("shape")).toHaveTextContent("Home|Contact|Blog[News,Tips]");
		await user.click(screen.getByLabelText("Make Contact a submenu item"));
		expect(screen.getByLabelText("shape")).toHaveTextContent("Home[Contact]|Blog[News,Tips]");
		await user.click(screen.getByLabelText("Move Contact to the top level"));
		await user.click(screen.getByLabelText("Remove Home"));
		expect(screen.getByLabelText("shape")).toHaveTextContent("Contact|Blog[News,Tips]");
		await user.click(screen.getByRole("button", { name: "+ Add link" }));
		expect(screen.getByLabelText("Label of New link")).toBeInTheDocument();
	});

	it("reorders by dragging a row onto another", () => {
		render(<Harness initial={[link("Home"), link("About")]} />);
		const rows = screen.getAllByRole("listitem");
		fireEvent.dragStart(rows[1]!);
		fireEvent.dragOver(rows[0]!);
		fireEvent.drop(rows[0]!);
		expect(screen.getByLabelText("shape")).toHaveTextContent("About|Home");
	});
});
