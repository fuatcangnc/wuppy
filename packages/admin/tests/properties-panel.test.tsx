import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PropertiesPanel } from "../src/components/visual-editor/Properties.tsx";
import { PRESETS } from "../src/components/visual-editor/modules.ts";
import { $context, $selected, $state, $tree, $visual, addPreset, load } from "../src/components/visual-editor/store.ts";
import { $themeElement } from "../src/components/visual-editor/theme-element.ts";
import { $doc } from "../src/stores/editor.ts";
import { defaultVisualData } from "@wuppy/visual-editor";

const textPreset = PRESETS.find((preset) => preset.label === "Text")!;
const renderPanel = () =>
	render(
		<aside aria-label="Properties">
			<PropertiesPanel />
		</aside>,
	);

beforeEach(() => {
	$doc.set({ collection: "pages", slug: "a", data: {}, body: "", saved: { data: {}, body: "" } });
	$visual.set(defaultVisualData());
	$context.set("");
	$state.set("");
	$themeElement.set(null);
	load("");
	addPreset(textPreset);
});

describe("PropertiesPanel", { timeout: 15_000 }, () => {
	it("shows Instatic's Styles/Attributes tabs, class picker, sections and right-side style rail", () => {
		renderPanel();
		const panel = screen.getByLabelText("Properties");
		expect(within(panel).getByRole("tab", { name: "Styles" })).toHaveAttribute("aria-selected", "true");
		expect(within(panel).getByRole("tab", { name: "Attributes" })).toBeInTheDocument();
		expect(within(panel).getByPlaceholderText("Add or create selector…")).toBeInTheDocument();
		expect(within(panel).getByRole("button", { name: "Componentize" })).toBeInTheDocument();
		expect(within(panel).getByText("Tag", { exact: true })).toBeInTheDocument();
		expect(within(panel).getByRole("button", { name: "Flex" })).toBeInTheDocument();
		const rail = within(panel).getByRole("toolbar", { name: "Style categories" });
		expect(rail).toBeInTheDocument();
		expect(within(rail).getAllByRole("button").length).toBeGreaterThanOrEqual(9);
		expect(within(rail).getByRole("button", { name: "Show Layout styles" })).toBeInTheDocument();
		expect(within(rail).getByRole("button", { name: "Show Size styles" })).toBeInTheDocument();
		expect(within(panel).getByPlaceholderText("Search styles in element...")).toBeInTheDocument();
	});

	it("adds a selector pill and uses it in the style search placeholder", () => {
		renderPanel();
		const panel = screen.getByLabelText("Properties");
		fireEvent.change(within(panel).getByPlaceholderText("Add or create selector…"), { target: { value: "dss" } });
		fireEvent.keyDown(within(panel).getByPlaceholderText("Add or create selector…"), { key: "Enter" });
		expect(within(panel).getByText(".dss", { exact: true })).toBeInTheDocument();
		expect(within(panel).getByPlaceholderText("Search styles in .dss...")).toBeInTheDocument();
	});

	it("switches to Attributes, navigates style sections and filters style rows", () => {
		renderPanel();
		const panel = screen.getByLabelText("Properties");
		fireEvent.click(within(panel).getByRole("tab", { name: "Attributes" }));
		expect(within(panel).queryByRole("toolbar", { name: "Style categories" })).not.toBeInTheDocument();
		expect(within(panel).getByText("Tag", { exact: true })).toBeInTheDocument();
		fireEvent.click(within(panel).getByRole("tab", { name: "Styles" }));
		const layout = within(panel).getByRole("button", { name: "Show Layout styles" });
		fireEvent.click(layout);
		expect(layout).toHaveAttribute("aria-pressed", "true");
		fireEvent.click(within(panel).getByRole("button", { name: "Flex" }));
		const selected = $selected.get()!;
		expect($tree.get().nodes[selected]!.styles.display).toBe("flex");
		fireEvent.change(within(panel).getByRole("textbox", { name: "Search styles" }), {
			target: { value: "overflow" },
		});
		expect(within(panel).getByText("Overflow", { exact: true })).toBeInTheDocument();
		expect(within(panel).queryByText("Width", { exact: true })).not.toBeInTheDocument();
	});

	it("reveals the context controls from the right rail when needed", () => {
		renderPanel();
		const panel = screen.getByLabelText("Properties");
		expect(within(panel).queryByText("Context & state", { exact: true })).not.toBeInTheDocument();
		fireEvent.click(within(panel).getByRole("button", { name: "Context and state" }));
		expect(within(panel).getByText("Context & state", { exact: true })).toBeInTheDocument();
	});

	it("gives a selected theme element the same inspector", () => {
		$selected.set(null);
		$themeElement.set({
			selection: 1,
			file: "/site/.wuppy/themes/blog/src/pages/index.astro",
			loc: "12:3",
			tag: "h1",
			text: "Hello",
			cls: "text-4xl font-bold",
			style: "",
			attrs: { id: "hero" },
			computed: {},
			tailwind: true,
		});
		renderPanel();
		const panel = screen.getByLabelText("Properties");
		expect(within(panel).getByRole("tab", { name: "Styles" })).toHaveAttribute("aria-selected", "true");
		expect(within(panel).getByPlaceholderText("Add class…")).toBeInTheDocument();
		expect(within(panel).getByText("<h1>", { exact: true })).toBeInTheDocument();
		expect(within(panel).getByPlaceholderText("Search styles in text-4xl...")).toBeInTheDocument();
		const rail = within(panel).getByRole("toolbar", { name: "Style categories" });
		expect(within(rail).getByRole("button", { name: "Show Layout styles" })).toBeInTheDocument();
		expect(within(rail).getByRole("button", { name: "Context and state" })).toBeInTheDocument();
		fireEvent.change(within(panel).getByRole("textbox", { name: "Search styles" }), {
			target: { value: "overflow" },
		});
		expect(within(panel).getByText("Overflow", { exact: true })).toBeInTheDocument();
		expect(within(panel).queryByText("Width", { exact: true })).not.toBeInTheDocument();
		fireEvent.click(within(panel).getByRole("tab", { name: "Attributes" }));
		expect(within(panel).queryByRole("toolbar", { name: "Style categories" })).not.toBeInTheDocument();
		expect(within(panel).getByLabelText("id")).toHaveValue("hero");
		expect(within(panel).getByRole("button", { name: "Remove id" })).toBeInTheDocument();
		// Rewriting the same element (the API returns a new loc) keeps the panel's tab...
		act(() => $themeElement.set({ ...$themeElement.get()!, loc: "13:3", cls: "text-4xl font-bold underline" }));
		expect(within(panel).getByRole("tab", { name: "Attributes" })).toHaveAttribute("aria-selected", "true");
		// ...but picking another element resets it.
		act(() => $themeElement.set({ ...$themeElement.get()!, selection: 2 }));
		expect(within(panel).getByRole("tab", { name: "Styles" })).toHaveAttribute("aria-selected", "true");
	});
});
