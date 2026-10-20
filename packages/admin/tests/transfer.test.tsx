import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TransferPage } from "../src/components/content/TransferPage.tsx";

afterEach(() => vi.unstubAllGlobals());

describe("TransferPage", () => {
	it("offers the export as a download", () => {
		render(<TransferPage />);
		expect(screen.getByRole("link", { name: "Download content (JSON)" })).toHaveAttribute("href", "/api/export");
	});

	it("imports a chosen file and reports what happened, including per-entry errors", async () => {
		const bodies: string[] = [];
		vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
			bodies.push(init.body as string);
			return new Response(
				JSON.stringify({ data: { imported: 2, errors: [{ entry: "posts/bad", message: "title must be a string" }] } }),
			);
		});
		render(<TransferPage />);
		const file = new File([JSON.stringify({ version: 1, collections: {} })], "bundle.json", {
			type: "application/json",
		});
		await userEvent.setup().upload(screen.getByLabelText("Import content"), file);
		expect(await screen.findByText("Imported 2 entries")).toBeInTheDocument();
		expect(screen.getByText(/posts\/bad/)).toBeInTheDocument();
		expect(JSON.parse(bodies[0]!)).toEqual({ version: 1, collections: {} });
	});

	it("shows a readable message when the file is not JSON", async () => {
		render(<TransferPage />);
		await userEvent.setup().upload(screen.getByLabelText("Import content"), new File(["not json"], "x.json"));
		expect(await screen.findByRole("alert")).toHaveTextContent(/not valid JSON/i);
	});
});
