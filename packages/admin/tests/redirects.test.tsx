import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RedirectsPage } from "../src/components/redirects/RedirectsPage.tsx";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const server = () => {
	let rules = [{ from: "/old", to: "/new", status: 301 as const }];
	const puts: unknown[] = [];
	vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
		if (url.endsWith("/api/redirects/404")) {
			return new Response(JSON.stringify({ data: [{ path: "/gone", count: 3, lastSeen: "2026-05-01T00:00:00Z" }] }));
		}
		if (url.endsWith("/api/redirects") && init.method === "PUT") {
			const body = JSON.parse(String(init.body)) as { data: typeof rules };
			rules = body.data;
			puts.push(body.data);
			return new Response(JSON.stringify({ data: rules }));
		}
		if (url.endsWith("/api/redirects")) return new Response(JSON.stringify({ data: rules }));
		return new Response(JSON.stringify({ data: [] }));
	});
	return puts;
};

describe("RedirectsPage", () => {
	it("edits a rule in the split detail pane and saves it", async () => {
		const puts = server();
		render(<RedirectsPage />);
		await userEvent.setup().click(await screen.findByRole("button", { name: "Open redirect /old" }));
		expect(screen.getByLabelText("From")).toHaveValue("/old");
		fireEvent.change(screen.getByLabelText("To"), { target: { value: "/newer" } });
		await userEvent.setup().click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(puts).toHaveLength(1));
		expect((puts[0] as Array<{ to: string }>)[0]!.to).toBe("/newer");
	});

	it("creates a redirect from a missing path", async () => {
		server();
		render(<RedirectsPage />);
		const user = userEvent.setup();
		await screen.findByRole("button", { name: "Open redirect /old" });
		await user.click(screen.getByRole("button", { name: /404 log/ }));
		await user.click(await screen.findByRole("button", { name: "Open missing path /gone" }));
		await user.click(screen.getByRole("button", { name: "Create redirect" }));
		expect(await screen.findByLabelText("From")).toHaveValue("/gone");
		expect(screen.getByLabelText("To")).toHaveValue("/");
	});
});
