import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FieldsForm } from "../src/components/content/FieldsForm.tsx";
import { flatten, type Term } from "../src/components/taxonomies/TermManager.tsx";

afterEach(() => vi.unstubAllGlobals());

const term = (slug: string, order = 0, parent?: string): Term => ({
	slug,
	name: slug.toUpperCase(),
	description: "",
	order,
	translations: {},
	parent,
});

describe("flatten", () => {
	it("puts children right after their parent, siblings by order", () => {
		const rows = flatten([term("b", 2), term("c", 0, "a"), term("a", 1)]);
		expect(rows.map((r) => `${r.depth}:${r.term.slug}`)).toEqual(["0:a", "1:c", "0:b"]);
	});
});

describe("inline term creation", () => {
	it("saves the new term and selects it", async () => {
		const seen: unknown[] = [];
		const taxonomies = [
			{ name: "tags", label: "Tags", hierarchical: false, collections: [], terms: [{ slug: "js", name: "JS" }] },
		];
		vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
			if (init.method === "PUT") {
				const { data } = JSON.parse(String(init.body)) as { data: typeof taxonomies };
				seen.push(data);
				return new Response(JSON.stringify({ data }));
			}
			return new Response(JSON.stringify({ data: url.includes("taxonomies") ? taxonomies : [] }));
		});
		const onChange = vi.fn();
		render(
			<FieldsForm
				fields={{ tags: { type: "taxonomy", taxonomy: "tags", multiple: true } }}
				data={{ tags: ["js"] }}
				onChange={onChange}
			/>,
		);
		const user = userEvent.setup();
		await user.type(await screen.findByLabelText("New tags term"), "Type Script{Enter}");
		await waitFor(() => expect(onChange).toHaveBeenCalledWith("tags", ["js", "type-script"]));
		expect(JSON.stringify(seen[0])).toContain('"slug":"type-script"');
	});
});

describe("section field", () => {
	it("orders sections and removes them", async () => {
		const sections = [
			{ slug: "hero", title: "Hero" },
			{ slug: "cta", title: "CTA" },
		];
		vi.stubGlobal(
			"fetch",
			async (url: string) => new Response(JSON.stringify({ data: url.includes("sections") ? sections : [] })),
		);
		const onChange = vi.fn();
		render(<FieldsForm fields={{ blocks: "section" }} data={{ blocks: ["hero", "cta"] }} onChange={onChange} />);
		const user = userEvent.setup();
		await screen.findByText("Hero");
		await user.click(screen.getByLabelText("Move cta up"));
		expect(onChange).toHaveBeenLastCalledWith("blocks", ["cta", "hero"]);
		await user.click(screen.getByLabelText("Remove hero"));
		expect(onChange).toHaveBeenLastCalledWith("blocks", ["cta"]);
	});
});

describe("byline credits", () => {
	it("keeps plain slugs as strings until a role is typed", async () => {
		const bylines = [
			{ slug: "ada", name: "Ada" },
			{ slug: "bob", name: "Bob" },
		];
		vi.stubGlobal(
			"fetch",
			async (url: string) => new Response(JSON.stringify({ data: url.includes("bylines") ? bylines : [] })),
		);
		const onChange = vi.fn();
		render(
			<FieldsForm fields={{ by: { type: "byline", multiple: true } }} data={{ by: ["ada"] }} onChange={onChange} />,
		);
		const user = userEvent.setup();
		await screen.findByText("Ada");
		await user.selectOptions(screen.getByLabelText("Add by"), "bob");
		expect(onChange).toHaveBeenLastCalledWith("by", ["ada", "bob"]);
		await user.type(screen.getByLabelText("Role of ada"), "x");
		expect(onChange).toHaveBeenLastCalledWith("by", [{ byline: "ada", role: "x" }]);
	});
});
