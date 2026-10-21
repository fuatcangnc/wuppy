import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WidgetsPage } from "../src/components/widgets/WidgetsPage.tsx";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("resource workspace", () => {
	it("creates a widget area inline in the detail pane", async () => {
		let saved: unknown[] = [];
		vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
			if (url.endsWith("/api/data/widgets") && init.method === "PUT") {
				saved = (JSON.parse(String(init.body)) as { data: unknown[] }).data;
				return new Response(JSON.stringify({ data: saved }));
			}
			if (url.endsWith("/api/data/widgets")) return new Response(JSON.stringify({ data: [] }));
			return new Response(JSON.stringify({ data: [] }));
		});
		render(<WidgetsPage />);
		expect(await screen.findByText("No widget area yet")).toBeInTheDocument();
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "Create widget area" }));
		await user.type(screen.getByLabelText("Key"), "sidebar");
		await user.type(screen.getByLabelText("Label"), "Sidebar");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(saved).toHaveLength(1));
		expect(saved[0]).toMatchObject({ name: "sidebar", label: "Sidebar" });
	});
});
