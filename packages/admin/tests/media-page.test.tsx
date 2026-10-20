import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MediaPage } from "../src/components/media/MediaPage.tsx";
import { ToastHost } from "../src/ui/index.tsx";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const item = { url: "/uploads/2026/01/a.png", name: "2026/01/a.png", size: 10, modified: "2026-01-01T00:00:00Z" };

/** Minimal fake server: records calls, answers by "METHOD path-prefix". */
function server(handlers: Record<string, () => Response>) {
	const calls: string[] = [];
	vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
		const key = `${init.method ?? "GET"} ${url}`;
		calls.push(key);
		const match = Object.keys(handlers).find((k) => key.startsWith(k));
		return match ? handlers[match]!() : new Response(JSON.stringify({ data: [] }));
	});
	return calls;
}
const json =
	(data: unknown, status = 200) =>
	() =>
		new Response(JSON.stringify({ data }), { status });
const error = (status: number, code: string, message: string) => () =>
	new Response(JSON.stringify({ error: { code, message } }), { status });

describe("MediaPage", () => {
	it("asks before force-deleting an image an entry still uses", async () => {
		const calls = server({
			"GET /api/media/folders": json([]),
			"GET /api/media/usage": json([]),
			"GET /api/media": json([item]),
			"DELETE /api/media?url=%2Fuploads%2F2026%2F01%2Fa.png&force=1": json({ ok: true }),
			"DELETE /api/media": error(409, "IN_USE", "Used by 1 entry"),
		});
		const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
		render(<MediaPage />);
		const user = userEvent.setup();
		await user.click(await screen.findByRole("button", { name: "Open 2026/01/a.png" }));
		await user.click(screen.getByRole("button", { name: /Delete/ }));
		await waitFor(() => expect(calls.some((c) => c.includes("force=1"))).toBe(true));
		expect(confirm).toHaveBeenCalledTimes(2);
		expect(confirm.mock.calls[1]?.[0]).toContain("Used by 1 entry");
	});

	it("keeps the file when the user declines the in-use warning", async () => {
		const calls = server({
			"GET /api/media/folders": json([]),
			"GET /api/media/usage": json([]),
			"GET /api/media": json([item]),
			"DELETE /api/media": error(409, "IN_USE", "Used by 1 entry"),
		});
		vi.spyOn(window, "confirm").mockReturnValueOnce(true).mockReturnValueOnce(false);
		render(<MediaPage />);
		const user = userEvent.setup();
		await user.click(await screen.findByRole("button", { name: "Open 2026/01/a.png" }));
		await user.click(screen.getByRole("button", { name: /Delete/ }));
		await waitFor(() => expect(calls.filter((c) => c.startsWith("DELETE")).length).toBe(1));
		expect(calls.some((c) => c.includes("force=1"))).toBe(false);
	});

	it("cleans up unused files after confirmation", async () => {
		const calls = server({
			"GET /api/media/folders": json([]),
			"GET /api/media": json([item]),
			"DELETE /api/media/orphans": json({ deleted: 3 }),
		});
		vi.spyOn(window, "confirm").mockReturnValue(true);
		render(
			<>
				<MediaPage />
				<ToastHost />
			</>,
		);
		await userEvent.setup().click(await screen.findByRole("button", { name: "Clean up unused" }));
		await waitFor(() => expect(calls).toContain("DELETE /api/media/orphans"));
		expect(await screen.findByText("Removed 3 unused files")).toBeInTheDocument();
	});

	it("edits details with an explicit Save, lists where the file is used and offers crop and focal point", async () => {
		const calls = server({
			"GET /api/media/folders": json(["farm"]),
			"GET /api/media/usage": json([{ collection: "posts", slug: "hello", title: "Hello" }]),
			"GET /api/media": json([{ ...item, alt: "Old alt", width: 40, height: 20 }]),
			"PATCH /api/media/meta": json({}),
		});
		render(<MediaPage />);
		const user = userEvent.setup();
		await user.click(await screen.findByRole("button", { name: "Open 2026/01/a.png" }));
		const save = screen.getByRole("button", { name: "Save" });
		expect(save).toBeDisabled();
		expect(screen.getByText("40 × 20")).toBeInTheDocument();
		await user.clear(screen.getByLabelText("Alt text"));
		await user.type(screen.getByLabelText("Alt text"), "New alt");
		expect(calls.some((c) => c.startsWith("PATCH"))).toBe(false); // nothing is saved while typing
		await user.click(save);
		await waitFor(() => expect(calls.some((c) => c.startsWith("PATCH /api/media/meta"))).toBe(true));

		await user.click(screen.getByRole("tab", { name: "Edit image" }));
		expect(screen.getByTestId("image-cropper")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Replace original" })).toBeDisabled(); // no area chosen yet
		await user.click(screen.getByRole("tab", { name: "Focal point" }));
		fireEvent.load(screen.getByTestId("focal-image")); // jsdom never loads images
		expect(await screen.findByRole("button", { name: /Focal point\. Use arrow keys/ })).toBeInTheDocument();
		expect(screen.getByTestId("focal-previews")).toBeInTheDocument();

		await user.click(screen.getByRole("tab", { name: /Used in/ }));
		expect(screen.getByRole("link", { name: /Hello/ })).toHaveAttribute("href", "/admin/e/posts/hello");
	});

	it("switches details tabs with the keyboard and keeps panels accessible", async () => {
		server({
			"GET /api/media/folders": json([]),
			"GET /api/media/usage": json([]),
			"GET /api/media": json([item]),
		});
		render(<MediaPage />);
		const user = userEvent.setup();
		await user.click(await screen.findByRole("button", { name: "Open 2026/01/a.png" }));
		const details = screen.getByRole("tab", { name: "Details" });
		const edit = screen.getByRole("tab", { name: "Edit image" });
		expect(screen.getByRole("tabpanel", { name: "Details" })).toHaveAttribute("data-state", "active");

		details.focus();
		await user.keyboard("{ArrowRight}");
		expect(edit).toHaveAttribute("aria-selected", "true");
		expect(edit).toHaveFocus();
		expect(screen.getByRole("tabpanel", { name: "Edit image" })).toBeInTheDocument();
		expect(screen.queryByRole("tabpanel", { name: "Details" })).toBeNull();

		await user.keyboard("{End}");
		expect(screen.getByRole("tab", { name: "Used in" })).toHaveFocus();
		await user.keyboard("{Home}");
		expect(details).toHaveFocus();
	});

	it("falls back to the preview image dimensions when metadata has none", async () => {
		server({
			"GET /api/media/folders": json([]),
			"GET /api/media/usage": json([]),
			"GET /api/media": json([item]),
		});
		render(<MediaPage />);
		await userEvent.setup().click(await screen.findByRole("button", { name: "Open 2026/01/a.png" }));
		const preview = screen.getByTestId("media-preview");
		Object.defineProperty(preview, "naturalWidth", { configurable: true, value: 640 });
		Object.defineProperty(preview, "naturalHeight", { configurable: true, value: 480 });
		fireEvent.load(preview);
		expect(await screen.findByText("640 × 480")).toBeInTheDocument();
	});
});
