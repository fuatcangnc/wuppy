import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FieldsForm } from "../src/components/content/FieldsForm.tsx";

describe("FieldsForm", () => {
	const fields = { title: "string", views: "number", draft: "boolean", date: "date", summary: "text" } as const;

	it("renders one control per declared field with its current value", () => {
		render(
			<FieldsForm
				fields={fields}
				data={{ title: "Hi", views: 3, draft: true, date: "2026-01-02" }}
				onChange={() => {}}
			/>,
		);
		expect(screen.getByLabelText("title")).toHaveValue("Hi");
		expect(screen.getByLabelText("views")).toHaveValue(3);
		expect(screen.getByLabelText("draft")).toBeChecked();
		expect(screen.getByLabelText("date")).toHaveValue("2026-01-02");
		expect(screen.getByLabelText("summary").tagName).toBe("TEXTAREA");
	});

	it("emits typed values (number, boolean) and removes cleared optional fields", async () => {
		const onChange = vi.fn();
		render(<FieldsForm fields={fields} data={{ views: 1 }} onChange={onChange} />);
		const user = userEvent.setup();
		await user.type(screen.getByLabelText("views"), "2");
		expect(onChange).toHaveBeenLastCalledWith("views", 12);
		await user.click(screen.getByLabelText("draft"));
		expect(onChange).toHaveBeenLastCalledWith("draft", true);
		await user.clear(screen.getByLabelText("views"));
		expect(onChange).toHaveBeenLastCalledWith("views", undefined);
	});

	it("image fields take a URL or an uploaded file", async () => {
		const onChange = vi.fn();
		const onUpload = vi.fn(async () => "/uploads/2026/10/x.png");
		render(<FieldsForm fields={{ cover: "image" }} data={{}} onChange={onChange} onUpload={onUpload} />);
		const file = new File([new Uint8Array([1])], "x.png", { type: "image/png" });
		await userEvent.setup().upload(screen.getByLabelText("Upload cover"), file);
		expect(onUpload).toHaveBeenCalledWith(file);
		expect(onChange).toHaveBeenCalledWith("cover", "/uploads/2026/10/x.png");
	});

	it("list fields are comma separated and emit string arrays", async () => {
		const onChange = vi.fn();
		render(<FieldsForm fields={{ tags: "list" }} data={{ tags: ["a"] }} onChange={onChange} />);
		const input = screen.getByLabelText("tags");
		expect(input).toHaveValue("a");
		fireEvent.change(input, { target: { value: "a, b ,, c" } });
		expect(onChange).toHaveBeenLastCalledWith("tags", ["a", "b", "c"]);
	});

	it("select offers the declared options", async () => {
		const onChange = vi.fn();
		render(<FieldsForm fields={{ kind: { type: "select", options: ["a", "b"] } }} data={{}} onChange={onChange} />);
		await userEvent.setup().selectOptions(screen.getByLabelText("kind"), "b");
		expect(onChange).toHaveBeenCalledWith("kind", "b");
	});

	it("hides a conditional field until its condition holds", () => {
		const conditional = { draft: "boolean", publishAt: { type: "date", showIf: { field: "draft", equals: true } } };
		const { rerender } = render(<FieldsForm fields={conditional} data={{ draft: false }} onChange={() => {}} />);
		expect(screen.queryByLabelText("publishAt")).toBeNull();
		rerender(<FieldsForm fields={conditional} data={{ draft: true }} onChange={() => {}} />);
		expect(screen.getByLabelText("publishAt")).toBeInTheDocument();
	});

	it("structured fields emit parsed JSON and flag invalid JSON", () => {
		const onChange = vi.fn();
		render(<FieldsForm fields={{ meta: "json" }} data={{}} onChange={onChange} />);
		const box = screen.getByLabelText("meta");
		fireEvent.change(box, { target: { value: '{"a":1}' } });
		expect(onChange).toHaveBeenLastCalledWith("meta", { a: 1 });
		fireEvent.change(box, { target: { value: "{" } });
		expect(screen.getByText("Invalid JSON")).toBeInTheDocument();
	});
});
