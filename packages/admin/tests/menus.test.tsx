import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { MenuItemsEditor } from "../src/components/menus/MenuItemsEditor.tsx";
import { MenusPage } from "../src/components/menus/MenusPage.tsx";
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
		const openOptions = async (name: string) => {
			const button = screen.getByLabelText(`Toggle options for ${name}`);
			if (button.getAttribute("aria-expanded") !== "true") await user.click(button);
		};

		await openOptions("About");
		fireEvent.change(screen.getByLabelText("Label of About"), { target: { value: "Contact" } });
		await user.click(screen.getByLabelText("Move Contact up"));
		expect(screen.getByLabelText("shape")).toHaveTextContent("Home|Contact|Blog[News,Tips]");

		await openOptions("Contact");
		await user.click(screen.getByLabelText("Make Contact a submenu item"));
		expect(screen.getByLabelText("shape")).toHaveTextContent("Home[Contact]|Blog[News,Tips]");

		await openOptions("Contact");
		await user.click(screen.getByLabelText("Move Contact to the top level"));
		await openOptions("Home");
		await user.click(screen.getByLabelText("Remove Home"));
		expect(screen.getByLabelText("shape")).toHaveTextContent("Contact|Blog[News,Tips]");
		await user.click(screen.getByRole("button", { name: "Add link" }));
		await user.click(screen.getByLabelText("Toggle options for New link"));
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

describe("MenusPage", () => {
	it("creates a menu, adds a page link and saves it", async () => {
		const writes: Array<{
			data: Array<{ name: string; items: Array<{ label: string; href: string; kind?: string }> }>;
		}> = [];
		vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
			const method = init.method ?? "GET";
			const body = init.body ? (JSON.parse(String(init.body)) as { data?: unknown }) : undefined;
			if (url === "/api/data/menus") {
				if (method === "PUT") {
					writes.push(body as (typeof writes)[number]);
					return new Response(JSON.stringify({ data: body?.data }));
				}
				return new Response(JSON.stringify({ data: [] }));
			}
			if (url === "/api/collections") {
				return new Response(
					JSON.stringify({
						data: [
							{ name: "pages", dir: "content/pages", format: "md", route: "/{slug}", fields: { title: "string" } },
						],
					}),
				);
			}
			if (url.startsWith("/api/content/pages")) {
				return new Response(
					JSON.stringify({
						data: [{ slug: "home", data: { title: "Home" }, body: "", modified: "2026-01-01T00:00:00Z" }],
						total: 1,
						nextCursor: null,
					}),
				);
			}
			if (url === "/api/data/taxonomies") return new Response(JSON.stringify({ data: [] }));
			return new Response(JSON.stringify({ data: [] }));
		});
		render(<MenusPage />);
		const user = userEvent.setup();
		await user.click(await screen.findByRole("button", { name: "Create a menu" }));
		const dialog = within(screen.getByRole("dialog", { name: "Create a menu" }));
		await user.type(dialog.getByLabelText("Menu name"), "Main menu");
		expect(dialog.getByLabelText("Key")).toHaveValue("main-menu");
		await user.click(dialog.getByRole("button", { name: "Create menu" }));
		expect(await screen.findByRole("heading", { name: "Menus" })).toBeInTheDocument();
		expect(await screen.findByDisplayValue("Main menu")).toBeInTheDocument();

		await user.click(await screen.findByLabelText("Add Home"));
		await user.click(screen.getByRole("button", { name: /Add to menu/ }));
		await user.click(screen.getByRole("button", { name: "Save menu" }));
		await waitFor(() => expect(writes.length).toBeGreaterThanOrEqual(2));
		const saved = writes.at(-1)!.data[0]!;
		expect(saved.name).toBe("main-menu");
		expect(saved.items[0]).toMatchObject({ label: "Home", href: "/home", kind: "page" });
	});
});
