import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { filterMedia } from "../src/components/media/filter.ts";
import { MediaPage } from "../src/components/media/MediaPage.tsx";
import { imagesFrom, uploadWithProgress } from "../src/lib/upload.ts";
import type { MediaItem } from "../src/stores/content.ts";
import { chooseSelect } from "./utils/select.ts";

const item = (name: string, over: Partial<MediaItem> = {}): MediaItem => ({
	url: `/uploads/${name}`,
	name,
	size: 10,
	modified: "2026-03-10T00:00:00Z",
	...over,
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("filterMedia", () => {
	const items = [
		item("2026/03/a.png", { alt: "Red barn", folder: "farm" }),
		item("2026/03/b.jpg", { title: "Sunset" }),
		item("2026/01/c.jpeg", { modified: "2026-01-05T00:00:00Z" }),
		item("2026/04/d.webp", { modified: "2026-04-20T00:00:00Z" }),
	];
	const names = (f: Partial<Parameters<typeof filterMedia>[1]>) =>
		filterMedia(items, { folder: "all", query: "", type: "", from: "", to: "", ...f }).map((i) =>
			i.name.split("/").pop(),
		);

	it("filters by folder, text (name, alt, title), type and modified date", () => {
		expect(names({ folder: "farm" })).toEqual(["a.png"]);
		expect(names({ folder: "" })).toEqual(["b.jpg", "c.jpeg", "d.webp"]);
		expect(names({ query: "barn" })).toEqual(["a.png"]);
		expect(names({ query: "sunset" })).toEqual(["b.jpg"]);
		expect(names({ type: "jpg" })).toEqual(["b.jpg", "c.jpeg"]);
		expect(names({ type: "webp" })).toEqual(["d.webp"]);
		expect(names({ from: "2026-03-01", to: "2026-03-31" })).toEqual(["a.png", "b.jpg"]);
	});
});

describe("imagesFrom", () => {
	it("keeps only image files", () => {
		const files = [new File(["x"], "a.png", { type: "image/png" }), new File(["x"], "a.txt", { type: "text/plain" })];
		expect(imagesFrom({ files } as unknown as DataTransfer).map((f) => f.name)).toEqual(["a.png"]);
		expect(imagesFrom(null)).toEqual([]);
	});
});

type Listener = (e?: unknown) => void;
class FakeXhr {
	static all: FakeXhr[] = [];
	listeners: Record<string, Listener[]> = {};
	upload = { addEventListener: (type: string, fn: Listener) => this.on(`upload.${type}`, fn) };
	headers: Record<string, string> = {};
	status = 0;
	statusText = "";
	responseText = "";
	body?: FormData;
	withCredentials = false;
	on(type: string, fn: Listener) {
		(this.listeners[type] ??= []).push(fn);
	}
	addEventListener(type: string, fn: Listener) {
		this.on(type, fn);
	}
	emit(type: string, e?: unknown) {
		for (const fn of this.listeners[type] ?? []) fn(e);
	}
	open() {}
	setRequestHeader(k: string, v: string) {
		this.headers[k] = v;
	}
	send(body: FormData) {
		this.body = body;
		FakeXhr.all.push(this);
	}
	abort() {
		this.emit("abort");
	}
	reply(status: number, json: unknown) {
		this.status = status;
		this.responseText = JSON.stringify(json);
		this.emit("load");
	}
}

describe("uploadWithProgress", () => {
	it("sends the CSRF header and folder, reports progress and resolves to the url", async () => {
		FakeXhr.all = [];
		vi.stubGlobal("XMLHttpRequest", FakeXhr);
		const progress: number[] = [];
		const handle = uploadWithProgress(new File(["x"], "a.png"), { folder: "farm" }, (f) => progress.push(f));
		const xhr = FakeXhr.all[0]!;
		xhr.emit("upload.progress", { lengthComputable: true, loaded: 5, total: 10 });
		xhr.reply(201, { data: { url: "/uploads/x.png" } });
		await expect(handle.done).resolves.toBe("/uploads/x.png");
		expect(progress).toEqual([0.5, 1]);
		expect(xhr.headers["X-Wuppy-Request"]).toBe("1");
		expect(xhr.body?.get("folder")).toBe("farm");
	});

	it("rejects with the server's code and message, and with AbortError on cancel", async () => {
		FakeXhr.all = [];
		vi.stubGlobal("XMLHttpRequest", FakeXhr);
		const failed = uploadWithProgress(new File(["x"], "a.png"));
		FakeXhr.all[0]!.reply(415, { error: { code: "UNSUPPORTED_MEDIA", message: "Only images" } });
		await expect(failed.done).rejects.toMatchObject({ status: 415, code: "UNSUPPORTED_MEDIA", message: "Only images" });
		const cancelled = uploadWithProgress(new File(["x"], "b.png"));
		cancelled.cancel();
		await expect(cancelled.done).rejects.toMatchObject({ name: "AbortError" });
	});
});

const setup = (list: MediaItem[]) => {
	FakeXhr.all = [];
	vi.stubGlobal("XMLHttpRequest", FakeXhr);
	const calls: string[] = [];
	vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
		calls.push(`${init.method ?? "GET"} ${url}`);
		if (url === "/api/media") return new Response(JSON.stringify({ data: list }));
		if (url === "/api/media/folders") return new Response(JSON.stringify({ data: ["farm"] }));
		if (url.startsWith("/api/media/usage")) return new Response(JSON.stringify({ data: [] }));
		return new Response(JSON.stringify({ data: {} }));
	});
	return calls;
};

describe("MediaPage uploads and bulk actions", () => {
	it("uploads dropped images one after another, skipping non-images", async () => {
		setup([]);
		render(<MediaPage />);
		const page = (await screen.findByText(/drop or paste images/)).closest("div.grid") as HTMLElement;
		const a = new File(["x"], "a.png", { type: "image/png" });
		const b = new File(["x"], "b.png", { type: "image/png" });
		const txt = new File(["x"], "n.txt", { type: "text/plain" });
		fireEvent.drop(page, { dataTransfer: { files: [a, txt, b], items: [] } });
		const dialog = await screen.findByRole("dialog", { name: "Upload to Library" });
		expect(await within(dialog).findByText("a.png")).toBeInTheDocument();
		expect(within(dialog).queryByText("n.txt")).toBeNull();
		expect(within(dialog).getByLabelText("Progress of a.png")).toBeInTheDocument();
		expect(within(dialog).getByText("Waiting…")).toBeInTheDocument();
		expect(FakeXhr.all).toHaveLength(1); // b waits for a
		FakeXhr.all[0]!.reply(201, { data: { url: "/uploads/a.png" } });
		await waitFor(() => expect(FakeXhr.all).toHaveLength(2));
		await userEvent.setup().click(within(dialog).getByLabelText("Remove b.png"));
		expect(within(dialog).queryByText("b.png")).toBeNull();
		expect(await within(dialog).findByText("Uploaded")).toBeInTheDocument();
		expect(within(dialog).getByText("1 of 1 complete")).toBeInTheDocument();
		await userEvent.setup().click(within(dialog).getByRole("button", { name: "Done" }));
		await waitFor(() => expect(screen.queryByRole("dialog", { name: "Upload to Library" })).toBeNull());
	});

	it("uploads an image pasted anywhere on the page as soon as it opens", async () => {
		setup([]);
		render(<MediaPage />);
		await screen.findByText(/drop or paste images/);
		const file = new File(["x"], "shot.png", { type: "image/png" });
		const event = new Event("paste") as Event & { clipboardData: unknown };
		event.clipboardData = { files: [file] };
		document.dispatchEvent(event);
		const dialog = await screen.findByRole("dialog", { name: "Upload to Library" });
		expect(await within(dialog).findByLabelText("Progress of shot.png")).toBeInTheDocument();
		expect(FakeXhr.all).toHaveLength(1);
		await userEvent.setup().click(within(dialog).getByRole("button", { name: "Close" }));
		expect(screen.queryByRole("dialog", { name: "Upload to Library" })).toBeNull();
	});

	it("closes after Done and only opens details when the user chooses the file", async () => {
		const list: MediaItem[] = [];
		setup(list);
		render(<MediaPage />);
		const user = userEvent.setup();
		await user.click(await screen.findByRole("button", { name: /Upload media/ }));
		const upload = await screen.findByRole("dialog", { name: "Upload to Library" });
		await user.upload(
			within(upload).getByLabelText("Choose files to upload"),
			new File(["x"], "barn.png", { type: "image/png" }),
		);
		await waitFor(() => expect(FakeXhr.all).toHaveLength(1));
		list.push(item("barn.png", { title: "Red barn" }));
		FakeXhr.all[0]!.reply(201, { data: { url: "/uploads/barn.png" } });
		await within(upload).findByText("Uploaded");
		expect(within(upload).getByText("1 of 1 complete")).toBeInTheDocument();
		await user.click(within(upload).getByRole("button", { name: "Done" }));

		expect(screen.queryByRole("dialog", { name: "Media details" })).toBeNull();
		await user.click(await screen.findByRole("button", { name: "Open Red barn" }));
		const inspector = await screen.findByTestId("media-inspector");
		expect(within(inspector).getByLabelText("Title")).toHaveValue("Red barn");
		expect(within(inspector).getByRole("button", { name: "Convert Webp" })).toBeInTheDocument();
	});

	it("shows a failed upload, retries it and updates the completion count", async () => {
		setup([]);
		render(<MediaPage />);
		const user = userEvent.setup();
		await user.click(await screen.findByRole("button", { name: /Upload media/ }));
		const dialog = await screen.findByRole("dialog", { name: "Upload to Library" });
		await user.upload(
			within(dialog).getByLabelText("Choose files to upload"),
			new File(["x"], "barn.png", { type: "image/png" }),
		);
		await waitFor(() => expect(FakeXhr.all).toHaveLength(1));
		FakeXhr.all[0]!.reply(500, { error: { code: "UPLOAD_FAILED", message: "Server exploded" } });

		expect(await within(dialog).findByText("Upload failed")).toBeInTheDocument();
		expect(within(dialog).getByText("0 of 1 complete")).toBeInTheDocument();
		expect(within(dialog).getByRole("button", { name: "Retry failed" })).toBeEnabled();
		expect(within(dialog).getByRole("button", { name: "Done" })).toBeEnabled();
		await user.click(within(dialog).getByLabelText("Retry barn.png"));
		await waitFor(() => expect(FakeXhr.all).toHaveLength(2));
		FakeXhr.all[1]!.reply(201, { data: { url: "/uploads/barn.png" } });

		expect(await within(dialog).findByText("Uploaded")).toBeInTheDocument();
		expect(within(dialog).getByText("1 of 1 complete")).toBeInTheDocument();
		expect(within(dialog).getByRole("button", { name: "Retry failed" })).toBeDisabled();
	});

	it("uploads into the folder selected in the library", async () => {
		setup([]);
		render(<MediaPage />);
		const user = userEvent.setup();
		await user.click(await screen.findByRole("button", { name: "Show filters" }));
		await waitFor(() => expect(screen.getByRole("combobox", { name: "Folder" })).toBeInTheDocument());
		await chooseSelect(user, "Folder", "farm");
		await user.click(await screen.findByRole("button", { name: /Upload media/ }));
		const dialog = await screen.findByRole("dialog", { name: "Upload to Library" });
		await user.upload(
			within(dialog).getByLabelText("Choose files to upload"),
			new File(["x"], "barn.png", { type: "image/png" }),
		);
		await waitFor(() => expect(FakeXhr.all).toHaveLength(1));
		const body = FakeXhr.all[0]!.body!;
		expect([body.get("title"), body.get("folder")]).toEqual(["barn.png", "farm"]);
	});

	it("moves and deletes the selected files, keeping those still in use", async () => {
		const calls = setup([item("a.png"), item("b.png")]);
		vi.spyOn(window, "confirm").mockReturnValue(true);
		render(<MediaPage />);
		const user = userEvent.setup();
		await user.click(await screen.findByLabelText("Select a.png"));
		await user.click(screen.getByLabelText("Select b.png"));
		expect(screen.getByText("2 items selected")).toBeInTheDocument();
		await user.selectOptions(screen.getByLabelText("Move selected to folder"), "farm");
		await waitFor(() => expect(calls.filter((c) => c.startsWith("PATCH /api/media/meta")).length).toBe(2));
		await user.click(await screen.findByLabelText("Select a.png"));
		await user.click(screen.getByLabelText("Select b.png"));
		await user.click(screen.getByRole("button", { name: "Delete" }));
		await waitFor(() => expect(calls.filter((c) => c.startsWith("DELETE /api/media?")).length).toBe(2));
	});

	it("paginates the media grid and keeps the footer controls", async () => {
		setup(Array.from({ length: 40 }, (_, i) => item(`p${String(i).padStart(2, "0")}.png`)));
		render(<MediaPage />);
		await screen.findByLabelText("Open p00.png");
		expect(screen.getByText("Showing 1-20 of 40")).toBeInTheDocument();
		expect(screen.getByRole("combobox", { name: "Per page" })).toBeInTheDocument();
		expect(screen.queryByLabelText("Open p20.png")).toBeNull();
		await userEvent.setup().click(screen.getByRole("button", { name: "Page 2" }));
		expect(await screen.findByLabelText("Open p20.png")).toBeInTheDocument();
		expect(screen.queryByLabelText("Open p00.png")).toBeNull();
		expect(screen.getByText("Showing 21-40 of 40")).toBeInTheDocument();
	});
});
