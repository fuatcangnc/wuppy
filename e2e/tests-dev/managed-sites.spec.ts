import { expect, test, type Browser, type Page } from "@playwright/test";

// Both fixture servers are up: 4444 (built) acts as the hub, 4555 (dev, this project) is the managed site.
const HUB = "http://127.0.0.1:4444";
const REMOTE = "http://127.0.0.1:4555";
const W = { "X-Wuppy-Request": "1" };

// Earlier specs use up the sign-in rate limit (5/min per IP), so wait it out instead of failing.
async function signIn(browser: Browser, email: string, password = "correct-horse-battery"): Promise<Page> {
	const context = await browser.newContext({ baseURL: HUB });
	for (;;) {
		const res = await context.request.post("/api/auth/sign-in/email", {
			headers: { Origin: HUB },
			data: { email, password },
		});
		if (res.status() !== 429) {
			expect(res.status()).toBe(200);
			break;
		}
		await new Promise((r) => setTimeout(r, (Number(res.headers()["x-retry-after"]) || 10) * 1000 + 500));
	}
	const page = await context.newPage();
	await page.goto("/admin/");
	return page;
}

// Journey: an agency connects a client's Wuppy, edits it from its own admin, and gives the client access to only that site.
test("a hub manages another Wuppy and a client sees only their site", async ({ request, browser }) => {
	test.setTimeout(180_000);
	// On the managed site, its owner creates a hub token.
	const signedIn = await request.post("/api/auth/sign-in/email", {
		headers: { Origin: REMOTE },
		data: { email: "dev-owner@example.com", password: "correct-horse-battery" },
	});
	expect(signedIn.status()).toBe(200);
	const created = await request.post("/api/tokens", {
		headers: W,
		data: {
			name: "Agency hub",
			kind: "hub",
			permissions: ["content:read", "content:write", "content:publish", "media:write", "site:settings"],
			expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
		},
	});
	expect(created.status()).toBe(201);
	const token = ((await created.json()) as { data: { token: string } }).data.token;

	// On the hub, the owner connects it.
	const owner = await signIn(browser, "owner@example.com");
	await owner.getByRole("link", { name: "Sites" }).click();
	await owner.getByRole("button", { name: "Connect site" }).first().click();
	const dialog = owner.getByRole("dialog", { name: "Connect a site" });
	await dialog.getByLabel("Name").fill("Client site");
	await dialog.getByLabel("Site address").fill(REMOTE);
	await dialog.getByLabel("Hub token").fill(token);
	await dialog.getByRole("button", { name: "Connect" }).click();
	await expect(owner.getByRole("heading", { name: "Client site" })).toBeVisible();
	await expect(owner.getByRole("button", { name: /Client site/ })).toContainText("Connected");
	expect(await owner.content()).not.toContain(token);

	// Switching sites routes the admin to the managed site.
	await owner.getByRole("button", { name: "Local" }).click();
	await owner.getByRole("option", { name: /Client site/ }).click();
	await expect(owner.getByText("Managing 127.0.0.1:4555")).toBeVisible();
	const sites = (await (await owner.request.get("/api/sites")).json()) as { data: { id: string }[] };
	const id = sites.data[0]!.id;
	const write = await owner.request.post(`/api/sites/${id}/proxy/api/content/posts`, {
		headers: W,
		data: { slug: "from-the-hub", data: { title: "From the hub", draft: true }, body: "Hello\n" },
	});
	expect(write.status()).toBe(201);
	// It landed on the managed site, not on the hub.
	expect((await request.get("/api/content/posts/from-the-hub")).status()).toBe(200);
	expect((await owner.request.get("/api/content/posts/from-the-hub")).status()).toBe(404);
	await owner.getByRole("link", { name: "posts", exact: true }).click();
	await expect(owner.getByRole("button", { name: "Open From the hub", exact: true })).toBeVisible();
	// Private surfaces of the managed site stay closed even to the hub owner.
	expect((await owner.request.get(`/api/sites/${id}/proxy/api/auth/get-session`)).status()).toBe(404);
	expect((await owner.request.get(`/api/sites/${id}/proxy/api/tokens`)).status()).toBe(404);

	// The owner adds a client who may only view that site.
	const client = await owner.request.post("/api/auth/admin/create-user", {
		headers: { Origin: HUB },
		data: { email: "client@example.com", password: "client-long-password", name: "Client", role: "client" },
	});
	expect(client.status()).toBe(200);
	const clientId = ((await client.json()) as { user: { id: string } }).user.id;
	expect(
		(
			await owner.request.put(`/api/sites/${id}/members/${clientId}`, { headers: W, data: { role: "viewer" } })
		).status(),
	).toBe(200);

	const clientPage = await signIn(browser, "client@example.com", "client-long-password");
	await expect(clientPage.getByText("Managing 127.0.0.1:4555")).toBeVisible();
	await expect(clientPage.getByRole("link", { name: "Users" })).toHaveCount(0);
	await clientPage.getByRole("button", { name: "Client site" }).click();
	await expect(clientPage.getByRole("option", { name: "Local" })).toHaveCount(0);
	// Nothing on the hub itself, read-only on the managed site.
	expect((await clientPage.request.get("/api/content/posts")).status()).toBe(403);
	expect((await clientPage.request.get(`/api/sites/${id}/proxy/api/content/posts`)).status()).toBe(200);
	const denied = await clientPage.request.post(`/api/sites/${id}/proxy/api/content/posts`, {
		headers: W,
		data: { slug: "nope", data: { title: "Nope" }, body: "" },
	});
	expect(denied.status()).toBe(403);

	// Removing the membership takes effect on the next request.
	await owner.request.delete(`/api/sites/${id}/members/${clientId}`, { headers: W });
	expect((await clientPage.request.get(`/api/sites/${id}/proxy/api/content/posts`)).status()).toBe(404);
});
