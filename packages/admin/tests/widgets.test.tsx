import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { newWidget, WidgetListEditor, type Widget } from "../src/components/widgets/WidgetListEditor.tsx";

const w = (id: string, over: Partial<Widget> = {}): Widget => ({
	id,
	type: "text",
	title: "",
	body: "",
	locales: [],
	collections: [],
	paths: [],
	...over,
});

function Harness({ initial }: { initial: Widget[] }) {
	const [widgets, setWidgets] = useState(initial);
	return (
		<>
			<WidgetListEditor widgets={widgets} onChange={setWidgets} />
			<output aria-label="state">{JSON.stringify(widgets)}</output>
		</>
	);
}
const state = () => JSON.parse(screen.getByLabelText("state").textContent ?? "[]") as Widget[];

describe("newWidget", () => {
	it("picks an unused id", () => {
		expect(newWidget([w("widget-1"), w("widget-3")]).id).toBe("widget-4");
	});
});

describe("WidgetListEditor", () => {
	it("adds, edits, reorders and removes widgets", async () => {
		render(<Harness initial={[w("a", { title: "A" }), w("b")]} />);
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "+ Add widget" }));
		expect(state().map((x) => x.id)).toEqual(["a", "b", "widget-3"]);

		fireEvent.change(screen.getByLabelText("Title of b"), { target: { value: "Bee" } });
		await user.selectOptions(screen.getByLabelText("Type of b"), "html");
		fireEvent.change(screen.getByLabelText("Content of b"), { target: { value: "<p>x</p>" } });
		expect(state()[1]).toMatchObject({ title: "Bee", type: "html", body: "<p>x</p>" });

		await user.click(screen.getByLabelText("Move b up"));
		expect(state().map((x) => x.id)).toEqual(["b", "a", "widget-3"]);
		await user.click(screen.getByLabelText("Remove a"));
		expect(state().map((x) => x.id)).toEqual(["b", "widget-3"]);
	});

	it("turns the visibility fields into lists when you leave them", () => {
		render(<Harness initial={[w("a")]} />);
		for (const [label, value] of [
			["Languages of a", "tr, en"],
			["Collections of a", " posts ,, pages"],
			["Pages of a", "/about, /blog/*"],
		] as const) {
			const input = screen.getByLabelText(label);
			fireEvent.change(input, { target: { value } });
			fireEvent.blur(input);
		}
		expect(state()[0]).toMatchObject({
			locales: ["tr", "en"],
			collections: ["posts", "pages"],
			paths: ["/about", "/blog/*"],
		});
	});

	it("shows the field a widget type needs", async () => {
		render(<Harness initial={[w("a")]} />);
		const user = userEvent.setup();
		expect(screen.queryByLabelText("Menu of a")).toBeNull();
		await user.selectOptions(screen.getByLabelText("Type of a"), "menu");
		expect(screen.getByLabelText("Menu of a")).toBeInTheDocument();
		expect(screen.queryByLabelText("Content of a")).toBeNull();
	});
});
