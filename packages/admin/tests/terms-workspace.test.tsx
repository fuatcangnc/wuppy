import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaxonomiesPage } from "../src/components/taxonomies/TaxonomiesPage.tsx";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("taxonomy workspace", () => {
	it("selects a term and saves its inline editor", async () => {
		let taxonomies = [
			{
				name: "categories",
				label: "Categories",
				hierarchical: true,
				collections: ["posts"],
				terms: [{ slug: "news", name: "News", description: "", order: 0, translations: {} }],
			},
		];
		let saved: unknown;
		vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
			if (url.endsWith("/api/data/taxonomies") && init.method === "PUT") {
				saved = JSON.parse(String(init.body)).data;
				taxonomies = saved as typeof taxonomies;
				return new Response(JSON.stringify({ data: saved }));
			}
			if (url.endsWith("/api/data/taxonomies")) return new Response(JSON.stringify({ data: taxonomies }));
			if (url.endsWith("/api/taxonomies/counts")) return new Response(JSON.stringify({ data: {} }));
			return new Response(JSON.stringify({ data: [] }));
		});
		render(<TaxonomiesPage />);
		await userEvent.setup().click(await screen.findByRole("button", { name: "Open News" }));
		expect(await screen.findByRole("heading", { name: "News" })).toBeInTheDocument();
		await userEvent.setup().type(screen.getByLabelText("Description"), "Latest updates");
		await userEvent.setup().click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(saved).toBeTruthy());
		expect(JSON.stringify(saved)).toContain("Latest updates");
	});
});
