import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compactField, ContentTypesPage } from "../src/components/content-types/ContentTypesPage.tsx";
import { chooseSelect } from "./utils/select.ts";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("compactField", () => {
	it("collapses to the short form unless an option is set, and keeps unknown options", () => {
		expect(compactField({ type: "string", required: false, help: "" })).toBe("string");
		expect(compactField({ type: "string", required: true })).toEqual({ type: "string", required: true });
		expect(compactField({ type: "number", min: 0 })).toEqual({ type: "number", min: 0 });
	});
});

describe("ContentTypesPage", () => {
	it("edits fields, checks the impact and saves after confirmation", async () => {
		const calls: Array<{ method: string; url: string; body?: unknown }> = [];
		const types = [
			{ name: "posts", dir: "content/posts", format: "md", route: "/{slug}", fields: { title: "string" } },
		];
		vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
			const method = init.method ?? "GET";
			calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
			if (url.includes("/impact"))
				return new Response(
					JSON.stringify({
						data: { invalid: [{ slug: "a", errors: ["views: Invalid input"] }], removedFields: [], types: "// t" },
					}),
				);
			if (method === "PUT")
				return new Response(
					JSON.stringify({ data: calls.at(-1)!.body && (calls.at(-1)!.body as { data: unknown }).data }),
				);
			return new Response(JSON.stringify({ data: url.includes("content-types") ? types : [] }));
		});
		const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
		render(<ContentTypesPage />);
		const user = userEvent.setup();
		await user.click(await screen.findByRole("button", { name: "Open posts" }));
		await user.click(screen.getByRole("button", { name: "+ Add field" }));
		await chooseSelect(user, "Type of field1", "number");
		await user.click(screen.getAllByLabelText("Required")[1]!);
		await user.click(screen.getByRole("button", { name: "Check impact" }));
		expect(await screen.findByText(/views: Invalid input/)).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
		expect(confirm).toHaveBeenCalledOnce();
		const saved = (calls.find((c) => c.method === "PUT")!.body as { data: typeof types }).data;
		expect(saved[0]!.fields).toEqual({ title: "string", field1: { type: "number", required: true } });
	});
});
