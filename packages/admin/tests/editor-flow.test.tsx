import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RevisionCompare } from "../src/components/git/RevisionCompare.tsx";
import {
	$autosaved,
	$conflict,
	$doc,
	$editorError,
	$recovery,
	discardRecovery,
	openEntry,
	restoreRecovery,
	save,
	setBody,
	setField,
	setPublished,
	useTheirs,
} from "../src/stores/editor.ts";

interface Call {
	method: string;
	url: string;
	headers: Record<string, string>;
	body?: unknown;
}
const calls: Call[] = [];
type Reply = { status?: number; body: unknown; etag?: string };
function server(routes: Record<string, Reply | (() => Reply)>) {
	vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
		const method = init.method ?? "GET";
		calls.push({
			method,
			url,
			headers: init.headers as Record<string, string>,
			body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
		});
		const hit = routes[`${method} ${url}`];
		const reply = typeof hit === "function" ? hit() : (hit ?? { body: { data: null } });
		return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
	});
}
const entry = (etag = "W/1") => ({ body: { data: { slug: "a", data: { title: "T" }, body: "hi" }, etag } });

beforeEach(() => {
	calls.length = 0;
	$doc.set(null);
	$conflict.set(null);
	$recovery.set(null);
	$editorError.set(null);
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("conflicts", () => {
	it("sends the loaded etag as If-Match and shows the server copy on 409", async () => {
		server({
			"GET /api/content/posts/a": entry("W/1"),
			"PUT /api/content/posts/a": {
				status: 409,
				body: {
					error: {
						code: "CONFLICT",
						message: "Someone else changed this entry",
						details: { current: { data: { title: "Theirs" }, body: "their body" } },
					},
				},
			},
		});
		await openEntry("posts", "a");
		setField("title", "Mine");
		expect(await save()).toBe(false);
		expect(calls.find((c) => c.method === "PUT")?.headers["If-Match"]).toBe("W/1");
		expect($conflict.get()?.theirs).toEqual({ data: { title: "Theirs" }, body: "their body" });
		expect($doc.get()?.data.title).toBe("Mine"); // local edits are never thrown away silently
	});

	it("'keep mine' retries without If-Match and clears the conflict", async () => {
		server({
			"GET /api/content/posts/a": entry("W/1"),
			"PUT /api/content/posts/a": { body: { data: { ok: true, etag: "W/9" } } },
		});
		await openEntry("posts", "a");
		setField("title", "Mine");
		$conflict.set({ theirs: { data: {}, body: "" } });
		expect(await save(undefined, true)).toBe(true);
		expect(calls.at(-1)?.headers["If-Match"]).toBeUndefined();
		expect($conflict.get()).toBeNull();
		expect($doc.get()?.etag).toBe("W/9");
	});

	it("'use theirs' reloads the server version", async () => {
		let version = 1;
		server({
			"GET /api/content/posts/a": () => ({
				body: { data: { slug: "a", data: { title: `v${version}` }, body: "" }, etag: `W/${version}` },
			}),
		});
		await openEntry("posts", "a");
		setField("title", "Mine");
		version = 2;
		await useTheirs();
		expect($doc.get()?.data.title).toBe("v2");
		expect($doc.get()?.etag).toBe("W/2");
	});
});

describe("autosave and recovery", () => {
	it("writes one recovery copy after the user pauses, not on every keystroke", async () => {
		server({
			"GET /api/content/posts/a": entry(),
			"PUT /api/autosave/posts/a": { body: { data: { savedAt: "2026-01-01T00:00:00Z" } } },
		});
		await openEntry("posts", "a");
		setBody("h");
		await vi.advanceTimersByTimeAsync(1000);
		setBody("he");
		await vi.advanceTimersByTimeAsync(1999);
		expect(calls.filter((c) => c.url.startsWith("/api/autosave") && c.method === "PUT")).toHaveLength(0);
		await vi.advanceTimersByTimeAsync(2);
		const puts = calls.filter((c) => c.url.startsWith("/api/autosave") && c.method === "PUT");
		expect(puts).toHaveLength(1);
		expect(puts[0]?.body).toEqual({ data: { title: "T" }, body: "he" });
		expect($autosaved.get()).toBe("2026-01-01T00:00:00Z");
	});

	it("a successful save cancels the pending autosave", async () => {
		server({ "GET /api/content/posts/a": entry(), "PUT /api/content/posts/a": { body: { data: { ok: true } } } });
		await openEntry("posts", "a");
		setBody("changed");
		await save();
		await vi.advanceTimersByTimeAsync(5000);
		expect(calls.some((c) => c.url.startsWith("/api/autosave") && c.method === "PUT")).toBe(false);
	});

	it("offers unsaved work from an earlier session, and restoring marks the entry dirty", async () => {
		server({
			"GET /api/content/posts/a": entry(),
			"GET /api/autosave/posts/a": {
				body: { data: { data: { title: "Lost work" }, body: "typed", savedAt: "2026-01-01T00:00:00Z" } },
			},
		});
		await openEntry("posts", "a");
		expect($recovery.get()?.body).toBe("typed");
		restoreRecovery();
		expect($doc.get()).toMatchObject({ data: { title: "Lost work" }, body: "typed" });
		expect($recovery.get()).toBeNull();
	});

	it("does not offer a recovery copy identical to what is saved, and discard deletes it", async () => {
		server({
			"GET /api/content/posts/a": entry(),
			"GET /api/autosave/posts/a": { body: { data: { data: { title: "T" }, body: "hi", savedAt: "x" } } },
		});
		await openEntry("posts", "a");
		expect($recovery.get()).toBeNull();
		$recovery.set({ data: {}, body: "", savedAt: "x" });
		await discardRecovery();
		expect(calls.at(-1)).toMatchObject({ method: "DELETE", url: "/api/autosave/posts/a" });
		expect($recovery.get()).toBeNull();
	});
});

describe("publish", () => {
	it("publish clears the draft flag and saves with a clear message; unpublish sets it back", async () => {
		server({
			"GET /api/content/posts/a": { body: { data: { slug: "a", data: { title: "T", draft: true }, body: "" } } },
			"PUT /api/content/posts/a": { body: { data: { ok: true } } },
		});
		await openEntry("posts", "a");
		expect(await setPublished(true)).toBe(true);
		expect(calls.at(-1)?.body).toEqual({ data: { title: "T" }, body: "", message: "content: publish" });
		expect(await setPublished(false)).toBe(true);
		expect(calls.at(-1)?.body).toEqual({ data: { title: "T", draft: true }, body: "", message: "content: unpublish" });
	});
});

describe("RevisionCompare", () => {
	it("shows the old and current value per changed field", () => {
		render(
			<RevisionCompare
				changes={[
					{ field: "title", before: "Old", after: "New", kind: "changed" },
					{ field: "cover", after: "/c.png", kind: "added" },
				]}
			/>,
		);
		expect(screen.getByRole("table", { name: "Compare versions" })).toBeInTheDocument();
		expect(screen.getByText("Old")).toBeInTheDocument();
		expect(screen.getByText("New")).toBeInTheDocument();
		expect(screen.getByText("added since")).toBeInTheDocument();
	});
	it("says so when nothing differs", () => {
		render(<RevisionCompare changes={[]} />);
		expect(screen.getByText(/identical/i)).toBeInTheDocument();
	});
});

describe("edit locks", () => {
	it("a lock held by someone else blocks saving until the user takes over", async () => {
		const { $lockedBy, claimLock } = await import("../src/stores/editor.ts");
		let holder: unknown = { name: "Bob", since: "2026-01-01T00:00:00Z" };
		server({
			"GET /api/content/posts/a": entry(),
			"PUT /api/locks/posts/a": () => ({ body: { data: holder } }),
			"PUT /api/locks/posts/a?force=1": () => ({ body: { data: null } }),
			"PUT /api/content/posts/a": { body: { data: { ok: true } } },
		});
		await openEntry("posts", "a");
		setBody("changed");
		await claimLock();
		expect($lockedBy.get()).toEqual(holder);
		expect(await save()).toBe(false);
		expect(calls.some((c) => c.method === "PUT" && c.url === "/api/content/posts/a")).toBe(false);

		holder = null;
		await claimLock(true);
		expect($lockedBy.get()).toBeNull();
		expect(await save()).toBe(true);
	});
});
