import { afterEach, describe, expect, it, vi } from "vitest";
import { apiUrl, setApiSite } from "../src/lib/api.ts";
import { $sites, loadSites } from "../src/stores/sites.ts";

afterEach(() => {
	setApiSite("local");
	vi.unstubAllGlobals();
});

describe("site routing", () => {
	it("keeps Local requests as they are", () => {
		expect(apiUrl("/api/content/posts")).toBe("/api/content/posts");
	});

	it("sends a managed site's API and uploads through the hub proxy, but never sign-in or the site list", () => {
		setApiSite("abc");
		expect(apiUrl("/api/content/posts?x=1")).toBe("/api/sites/abc/proxy/api/content/posts?x=1");
		expect(apiUrl("/uploads/a.png?v=1")).toBe("/api/sites/abc/proxy/uploads/a.png?v=1");
		expect(apiUrl("/api/auth/get-session")).toBe("/api/auth/get-session");
		expect(apiUrl("/api/setup")).toBe("/api/setup");
		expect(apiUrl("/api/sites")).toBe("/api/sites");
		expect(apiUrl("https://cdn.test/a.png")).toBe("https://cdn.test/a.png");
		expect(apiUrl("blob:x")).toBe("blob:x");
	});

	it("drops a stored site that is no longer listed, and sends clients to their first site", async () => {
		const site = { id: "s1", name: "One", url: "https://one.test", status: "connected", role: "editor" };
		vi.stubGlobal("fetch", async (url: string) =>
			Response.json(
				url === "/api/sites"
					? { data: [site], meta: { canManage: false } }
					: { data: { permissions: ["content:read"] } },
			),
		);
		setApiSite("gone");
		await loadSites(true);
		expect($sites.get()).toMatchObject({ status: "ready", active: "local", permissions: null });
		setApiSite("gone");
		await loadSites(false);
		expect($sites.get()).toMatchObject({ active: "s1", permissions: ["content:read"] });
		expect(apiUrl("/api/media")).toBe("/api/sites/s1/proxy/api/media");
	});
});
