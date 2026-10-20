import { totp } from "../utils/totp.ts";
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

// Journey: "Publish my first post, then undo an accidental edit."
test("owner sets up the site, writes a post, edits it and undoes the edit", async ({ page }) => {
	await page.goto("/admin/");

	// First run: create the owner account.
	await expect(page.getByRole("heading", { name: "Set up your site" })).toBeVisible();
	await page.getByLabel("Your name").fill("Owner");
	await page.getByLabel("Email").fill("owner@example.com");
	await page.getByLabel("Password").fill("correct-horse-battery");
	await page.getByLabel("Create a sample post").check();
	await page.getByRole("button", { name: "Create account" }).click();

	// The setup form also stores the site identity for SEO and emails.
	await expect
		.poll(async () => (await (await page.request.get("/api/data/settings")).json()).data)
		.toMatchObject({ siteName: "Wuppy Starter", siteUrl: "http://127.0.0.1:4444" });

	// The optional sample post is created through the same content API as normal entries.
	await expect
		.poll(async () => {
			const res = await page.request.get("/api/content/posts");
			if (res.status() !== 200) return false;
			const body = (await res.json()) as { data?: Array<{ slug: string }> };
			return body.data?.some((entry) => entry.slug === "hello-world") ?? false;
		})
		.toBe(true);

	// Collections -> posts -> new entry.
	await page.getByRole("link", { name: "posts", exact: true }).click();
	await expect(page.getByRole("link", { name: "Hello world" })).toBeVisible();
	await page.getByLabel("New entry title").fill("My first post");
	await expect(page.getByLabel("New entry slug")).toHaveValue("my-first-post");
	await page.getByRole("button", { name: "Create" }).click();

	await expect(page.getByLabel("title", { exact: true })).toHaveValue("My first post");
	const editor = page.getByLabel("Content").last();
	await editor.click();
	await page.keyboard.type("Hello from the editor");
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByText("content: create posts/my-first-post")).toBeVisible();

	// Accidental edit, saved.
	await editor.click();
	await page.keyboard.type(" OOPS");
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByText("content: update posts/my-first-post")).toBeVisible();

	// Undo the latest change; text returns, history grows (nothing is lost).
	page.once("dialog", (d) => void d.accept());
	await page.getByRole("button", { name: "Undo" }).first().click();
	await expect(editor).toContainText("Hello from the editor");
	await expect(editor).not.toContainText("OOPS");
	await expect(page.getByText(/^Revert/)).toBeVisible();

	// Insert an image into the body: uploaded, stored under /uploads, referenced as Markdown.
	const png = Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==",
		"base64",
	);
	page.once("dialog", (d) => void d.accept("A pixel"));
	await page.getByLabel("Insert image").setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: png });
	await expect(editor).toContainText("![A pixel](/uploads/");
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByText("Unsaved changes")).toHaveCount(0);

	// Reload: session persists, content persisted as a plain markdown file.
	await page.reload();
	await expect(page.getByText("owner@example.com")).toBeVisible();

	// Creating another entry with the same slug is refused instead of overwriting it.
	await page.getByRole("link", { name: "posts", exact: true }).click();
	await expect(page.getByRole("link", { name: "My first post" })).toBeVisible();
	await page.getByLabel("New entry title").fill("My first post");
	await page.getByRole("button", { name: "Create" }).click();
	await expect(page.getByText("An entry with this slug already exists.")).toBeVisible();
});

// Journey: "Add a colleague who can write but cannot manage users or see the security log."
test("owner adds an editor; the editor can edit content but sees no admin-only areas", async ({ page }) => {
	await page.goto("/admin/");
	await page.getByLabel("Email").fill("owner@example.com");
	await page.getByLabel("Password").fill("correct-horse-battery");
	await page.getByRole("button", { name: "Sign in", exact: true }).click();

	await page.getByRole("link", { name: "Users" }).click();

	// The only admin cannot demote itself.
	await page.getByLabel("Role for owner@example.com").selectOption("viewer");
	await expect(page.getByText("Cannot remove, ban or demote the last active admin")).toBeVisible();
	await expect(page.getByLabel("Role for owner@example.com")).toHaveValue("admin");

	await page.getByRole("button", { name: "Add user" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Name").fill("Edna Editor");
	await dialog.getByLabel("Email").fill("edna@example.com");
	await dialog.getByLabel("Temporary password").fill("another-long-password");
	await page.locator("#create-user select").selectOption("editor");
	await page.getByRole("dialog").getByRole("button", { name: "Add user", exact: true }).click();
	await expect(page.getByText("edna@example.com")).toBeVisible();

	await page.getByRole("link", { name: "Security log" }).click();
	await expect(page.getByRole("cell", { name: "user.create" })).toBeVisible();

	await page.getByRole("button", { name: "Sign out", exact: true }).click();
	await page.getByLabel("Email").fill("edna@example.com");
	await page.getByLabel("Password").fill("another-long-password");
	await page.getByRole("button", { name: "Sign in", exact: true }).click();

	await expect(page.getByText("edna@example.com")).toBeVisible();
	await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
	await expect(page.getByRole("link", { name: "Security log" })).toHaveCount(0);

	// The API enforces it too, not just the hidden links.
	const audit = await page.request.get("/api/audit");
	expect(audit.status()).toBe(403);
	const posts = await page.request.get("/api/content/posts");
	expect(posts.status()).toBe(200);
});

// Journey: "Turn on two-factor for my account, then sign in with a code."
test("editor enables two-factor and must present a code on the next sign-in", async ({ page }) => {
	await page.goto("/admin/");
	await page.getByLabel("Email").fill("edna@example.com");
	await page.getByLabel("Password").fill("another-long-password");
	await page.getByRole("button", { name: "Sign in", exact: true }).click();

	await page.getByRole("link", { name: "Account security" }).click();
	await page.getByLabel("Account password").fill("another-long-password");
	await page.getByRole("button", { name: "Enable two-factor" }).click();

	const secret = (await page.locator("code").first().innerText()).trim();
	expect(secret).toMatch(/^[A-Z2-7]+$/);
	await expect(page.getByText(/-/).first()).toBeVisible(); // backup codes are shown
	await page.getByLabel("Authentication code").fill(totp(secret));
	await page.getByRole("button", { name: "Confirm" }).click();
	await expect(page.getByRole("status")).toHaveText("Two-factor authentication is on.");

	await page.getByRole("button", { name: "Sign out", exact: true }).click();
	await page.getByLabel("Email").fill("edna@example.com");
	await page.getByLabel("Password").fill("another-long-password");
	await page.getByRole("button", { name: "Sign in", exact: true }).click();

	// Password alone is not enough now.
	await expect(page.getByRole("heading", { name: "Two-factor authentication" })).toBeVisible();
	await page.getByLabel("Authentication code").fill("000000");
	await page.getByRole("button", { name: "Verify" }).click();
	await expect(page.getByRole("alert")).toBeVisible();

	await page.getByLabel("Authentication code").fill(totp(secret));
	await page.getByRole("button", { name: "Verify" }).click();
	await expect(page.getByText("edna@example.com")).toBeVisible();
});

// Smoke: admin modules render; the owner can reset a colleague's authenticator from Users.
test("admin modules render and the owner resets a colleague's two-factor", async ({ page }) => {
	await page.goto("/admin/");
	await page.getByLabel("Email").fill("owner@example.com");
	await page.getByLabel("Password").fill("correct-horse-battery");
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

	const paths = [
		"/admin/calendar",
		"/admin/c/posts",
		"/admin/media",
		"/admin/comments",
		"/admin/menus",
		"/admin/redirects",
		"/admin/widgets",
		"/admin/sections",
		"/admin/taxonomies",
		"/admin/bylines",
		"/admin/content-types",
		"/admin/byline-schema",
		"/admin/users",
		"/admin/plugins",
		"/admin/import",
		"/admin/webhooks",
		"/admin/settings",
		"/admin/themes",
		"/admin/audit",
		"/admin/transfer",
		"/admin/security",
	];

	for (const path of paths) {
		await page.goto(path);
		await expect(page.locator("main")).toBeVisible();
		await expect(page.getByText("Can't reach the server")).toHaveCount(0);
	}

	await page.getByRole("link", { name: "Users" }).click();
	const row = page.getByRole("row", { name: /edna@example.com/ });
	await row.getByRole("button", { name: "Manage" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByText("Active sessions")).toBeVisible();
	await expect(dialog.getByRole("button", { name: "Set password" })).toBeVisible();

	page.once("dialog", (d) => void d.accept());
	await dialog.getByRole("button", { name: "Reset 2FA" }).click();
	await expect(dialog.getByText("Two-factor authentication is not enabled.")).toBeVisible();
	await dialog.getByRole("button", { name: "Close" }).last().click();
});

// Journey: "Use a passkey instead of my password." WebAuthn only accepts a
// domain RP ID, so this context uses localhost even though the fixture listens
// on 127.0.0.1; the auth trusted-origin list accepts both loopback spellings.
test("owner adds a passkey and signs in with it at localhost", async ({ browser }) => {
	const context = await browser.newContext({
		baseURL: "http://localhost:4444",
		// The fixture trusts loopback proxies; present a distinct forwarded IP
		// so earlier sign-ins do not exhaust the shared rate-limit bucket.
		extraHTTPHeaders: { "x-forwarded-for": "198.51.100.23" },
	});
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);
	await cdp.send("WebAuthn.enable");
	await cdp.send("WebAuthn.addVirtualAuthenticator", {
		options: {
			protocol: "ctap2",
			transport: "internal",
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true,
			automaticPresenceSimulation: true,
		},
	});

	await page.goto("/admin/");
	await page.getByLabel("Email").fill("owner@example.com");
	await page.getByLabel("Password").fill("correct-horse-battery");
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	await page.getByRole("link", { name: "Account security" }).click();
	await page.getByLabel("Passkey name").fill("E2E laptop");
	await page.getByRole("button", { name: "Add passkey" }).click();
	await expect(page.getByText("E2E laptop")).toBeVisible();

	await page.getByRole("button", { name: "Sign out", exact: true }).click();
	await page.getByRole("button", { name: "Sign in with a passkey" }).click();
	await expect(page.getByText("owner@example.com")).toBeVisible();

	await context.close();
});
