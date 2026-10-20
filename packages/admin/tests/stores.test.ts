import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { $dirty, $doc, $editorError, newEntry, openEntry, save, setBody } from "../src/stores/editor.ts";
import { $history, loadHistory, revert } from "../src/stores/git.ts";
import { $session, loadSession, signIn, verifyCode } from "../src/stores/session.ts";

type Handler = (url: string, init: RequestInit) => { status?: number; body: unknown };
const calls: { url: string; init: RequestInit }[] = [];
function stubFetch(handler: Handler) {
	vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
		calls.push({ url, init });
		const { status = 200, body } = handler(url, init);
		return new Response(JSON.stringify(body), { status });
	});
}
beforeEach(() => {
	calls.length = 0;
	$doc.set(null);
});
afterEach(() => vi.unstubAllGlobals());

describe("editor store", () => {
	it("opens an entry, tracks dirtiness, saves with the CSRF header and clears dirty", async () => {
		stubFetch((url, init) =>
			init.method === "PUT"
				? { body: { data: { ok: true } } }
				: { body: { data: { slug: "a/b", data: { title: "T" }, body: "hi\n" } } },
		);
		await openEntry("posts", "a/b");
		expect(calls[0]?.url).toBe("/api/content/posts/a/b");
		expect($dirty.get()).toBe(false);

		setBody("changed\n");
		expect($dirty.get()).toBe(true);

		expect(await save("fix: typo")).toBe(true);
		const put = calls.at(-1)!;
		expect((put.init.headers as Record<string, string>)["X-Wuppy-Request"]).toBe("1");
		expect(JSON.parse(put.init.body as string)).toEqual({
			data: { title: "T" },
			body: "changed\n",
			message: "fix: typo",
		});
		expect($dirty.get()).toBe(false);
	});

	it("creates a new entry with POST, then updates it with PUT", async () => {
		stubFetch(() => ({ body: { data: { ok: true } } }));
		newEntry("posts", "fresh", { title: "Fresh" });
		setBody("hello\n");
		expect(await save("content: create posts/fresh")).toBe(true);
		const created = calls.at(-1)!;
		expect(created.init.method).toBe("POST");
		expect(created.url).toBe("/api/content/posts");
		expect(JSON.parse(created.init.body as string)).toEqual({
			slug: "fresh",
			data: { title: "Fresh" },
			body: "hello\n",
			message: "content: create posts/fresh",
		});
		expect($dirty.get()).toBe(false);

		setBody("hello again\n");
		expect(await save()).toBe(true);
		expect(calls.at(-1)?.init.method).toBe("PUT");
		expect(calls.at(-1)?.url).toBe("/api/content/posts/fresh");
	});

	it("a new entry is dirty until saved", () => {
		newEntry("posts", "fresh");
		expect($dirty.get()).toBe(true);
	});

	it("surfaces API errors and stays dirty", async () => {
		stubFetch(() => ({ status: 403, body: { error: { code: "FORBIDDEN", message: "Not allowed" } } }));
		newEntry("posts", "x");
		expect(await save()).toBe(false);
		expect($editorError.get()).toBe("Not allowed");
		expect($dirty.get()).toBe(true);
	});
});

describe("git store", () => {
	it("loads history and reloads it after revert", async () => {
		const commits = [{ sha: "abc1234", message: "m", author: "A", date: "d" }];
		stubFetch((url) => ({ body: { data: url.includes("/revert") ? { sha: "def" } : commits } }));
		await loadHistory("posts", "a");
		expect($history.get()).toEqual(commits);
		await revert("abc1234", "posts", "a");
		expect(calls.map((c) => c.init.method)).toEqual(["GET", "POST", "GET"]);
	});
});

describe("session store", () => {
	it("anonymous visitor on a fresh site is told to set up", async () => {
		stubFetch((url) => ({ body: url === "/api/setup" ? { needsSetup: true } : null }));
		await loadSession();
		expect($session.get()).toEqual({ status: "anon", needsSetup: true });
	});

	it("carries the configured site name and URL into first-run setup", async () => {
		stubFetch((url) =>
			url === "/api/setup"
				? { body: { needsSetup: true, siteName: "Field Notes", siteUrl: "https://notes.example.com" } }
				: { body: null },
		);
		await loadSession();
		expect($session.get()).toEqual({
			status: "anon",
			needsSetup: true,
			setup: { siteName: "Field Notes", siteUrl: "https://notes.example.com" },
		});
	});

	it("failed sign-in keeps the user anonymous with the server message", async () => {
		stubFetch((url) =>
			url.includes("sign-in")
				? { status: 401, body: { message: "Invalid email or password", code: "INVALID" } }
				: { body: { needsSetup: false } },
		);
		await signIn("a@x.test", "bad");
		expect($session.get()).toMatchObject({ status: "anon", error: "Invalid email or password" });
	});

	it("a failing server shows an error instead of loading forever", async () => {
		stubFetch(() => ({ status: 500, body: { error: { code: "INTERNAL", message: "Internal server error" } } }));
		await loadSession();
		expect($session.get()).toEqual({ status: "error", message: "Internal server error" });
	});

	it("signed-in user becomes authed", async () => {
		stubFetch((url) => ({
			body:
				url === "/api/setup"
					? { needsSetup: false }
					: url.includes("get-session")
						? { user: { id: "1", email: "a@x.test", name: "A", role: "admin" } }
						: {},
		}));
		await loadSession();
		expect($session.get()).toMatchObject({ status: "authed", user: { email: "a@x.test" } });
	});
});

describe("two-factor sign-in", () => {
	it("a password-only success that still needs a code keeps the user signed out and asks for it", async () => {
		stubFetch((url) => ({
			body: url.includes("sign-in") ? { twoFactorRedirect: true } : url === "/api/setup" ? { needsSetup: false } : null,
		}));
		await signIn("a@x.test", "pw-correct-123");
		expect($session.get()).toEqual({ status: "anon", needsSetup: false, twoFactor: true });
	});

	it("a correct code signs the user in", async () => {
		stubFetch((url) => ({
			body: url.includes("verify-totp")
				? { token: "t" }
				: url === "/api/setup"
					? { needsSetup: false }
					: { user: { id: "1", email: "a@x.test", name: "A", role: "admin" } },
		}));
		await verifyCode("123456");
		expect($session.get()).toMatchObject({ status: "authed" });
		expect(calls.some((c) => c.url.endsWith("/two-factor/verify-totp"))).toBe(true);
	});

	it("a wrong code keeps asking and shows the server message", async () => {
		stubFetch((url) =>
			url.includes("verify-totp")
				? { status: 401, body: { message: "Invalid code", code: "INVALID_CODE" } }
				: { body: { needsSetup: false } },
		);
		await verifyCode("000000");
		expect($session.get()).toMatchObject({ status: "anon", twoFactor: true, error: "Invalid code" });
	});

	it("a backup code is sent to the backup endpoint", async () => {
		stubFetch((url) => ({ body: url.includes("get-session") ? null : { needsSetup: false } }));
		await verifyCode("abcde-12345", true);
		expect(calls.some((c) => c.url.endsWith("/two-factor/verify-backup-code"))).toBe(true);
	});
});
