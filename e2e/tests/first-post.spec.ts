import { deflateSync } from "node:zlib";
import { totp } from "../utils/totp.ts";
import { expect, test, type Page } from "@playwright/test";

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
	await page.getByRole("button", { name: "Image from library" }).click();
	const picker = page.getByRole("dialog", { name: "Choose from the library" });
	await picker.getByLabel("Upload").setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: png });
	await picker.getByRole("button", { name: "Insert", exact: true }).click();
	const details = page.getByRole("dialog", { name: "Insert image" });
	await details.getByLabel("Alt text").fill("A pixel");
	await details.getByRole("button", { name: "Insert", exact: true }).click();
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

// Journey: "Upload a photo with its details, fix the alt text, and crop a copy."
const crc = (buf: Buffer) => {
	let c = ~0;
	for (const b of buf) {
		c ^= b;
		for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
	}
	return ~c >>> 0;
};
const chunk = (type: string, data: Buffer) => {
	const body = Buffer.concat([Buffer.from(type), data]);
	const out = Buffer.alloc(body.length + 8);
	out.writeUInt32BE(data.length, 0);
	body.copy(out, 4);
	out.writeUInt32BE(crc(body), body.length + 4);
	return out;
};

async function mediaJourney(page: Page) {
	await page.goto("/admin/media");

	// A solid 200x100 PNG, built here so the test needs no binary fixture.
	const header = Buffer.alloc(13);
	header.writeUInt32BE(200, 0);
	header.writeUInt32BE(100, 4);
	header.set([8, 2, 0, 0, 0], 8);
	const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(200 * 3, 0x80)]);
	const png = Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", header),
		chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: 100 }, () => row)))),
		chunk("IEND", Buffer.alloc(0)),
	]);

	await page.getByRole("button", { name: "Upload media" }).click();
	const upload = page.getByRole("dialog", { name: "Upload files" });
	await upload
		.getByLabel("Choose files to upload")
		.setInputFiles({ name: "barn.png", mimeType: "image/png", buffer: png });
	await upload.getByLabel("Filename of barn.png").fill("Red barn");
	await upload.getByLabel("Alt text of barn.png").fill("A barn");
	await upload.getByLabel("Caption of barn.png").fill("At dusk");
	await upload.getByRole("button", { name: /Upload file/ }).click();

	await page.getByRole("button", { name: "Open Red barn" }).click();
	const details = page.getByRole("dialog", { name: "Media details" });
	await expect(details.getByLabel("Filename")).toHaveValue("Red barn");
	await expect(details.getByLabel("Alt text")).toHaveValue("A barn");
	await expect(details.getByText("200 × 100")).toBeVisible();
	await details.getByLabel("Alt text").fill("A red barn at dusk");
	await details.getByRole("button", { name: "Save" }).click();
	await expect(page.getByText("Saved")).toBeVisible();

	await details.getByRole("tab", { name: "Edit image" }).click();
	await details.getByLabel("Aspect ratio").selectOption("square");
	await expect(details.getByText("Output size").locator("..")).toContainText("100 × 100");
	await details.getByRole("button", { name: "Create cropped copy" }).click();
	await expect(page.getByText("Cropped copy created")).toBeVisible();
	await expect
		.poll(async () => ((await (await page.request.get("/api/media")).json()) as { data: unknown[] }).data.length)
		.toBe(3); // the image from the first journey, the upload and its cropped copy
}

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

	await mediaJourney(page);
	await page.keyboard.press("Escape"); // the cropped copy opened in its own dialog

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

// Journey: "My browser crashed mid-sentence, and a colleague edited the same page meanwhile."
test("unsaved work is recovered, a concurrent edit is caught, and publish/unpublish is one click", async ({
	browser,
}) => {
	// A distinct forwarded IP keeps earlier sign-ins from exhausting this test's rate-limit bucket.
	const context = await browser.newContext({
		baseURL: "http://127.0.0.1:4444",
		extraHTTPHeaders: { "x-forwarded-for": "198.51.100.77" },
	});
	const page = await context.newPage();
	page.on("dialog", (d) => void d.accept());
	await page.goto("/admin/");
	await page.getByLabel("Email").fill("owner@example.com");
	await page.getByLabel("Password").fill("correct-horse-battery");
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
	await page.goto("/admin/e/posts/hello-world");
	const editor = page.getByLabel("Content", { exact: true }).last();
	await expect(editor).toBeVisible();

	// Typing without saving leaves a recovery copy after a short pause (no Git commit).
	await editor.click();
	await page.keyboard.type(" RECOVER-ME");
	await expect
		.poll(async () => (await (await page.request.get("/api/autosave/posts/hello-world")).json()).data?.body ?? "")
		.toContain("RECOVER-ME");
	await page.reload();
	await expect(page.getByRole("alert").filter({ hasText: "were recovered" })).toBeVisible();
	await page.getByRole("button", { name: "Restore them" }).click();
	await expect(page.getByLabel("Content", { exact: true }).last()).toContainText("RECOVER-ME");

	// A colleague saves the same entry first; our save is refused instead of silently overwriting theirs.
	const theirs = await (await page.request.get("/api/content/posts/hello-world")).json();
	await page.request.put("/api/content/posts/hello-world", {
		headers: { "X-Wuppy-Request": "1" },
		data: { data: theirs.data.data, body: `${theirs.data.body}\nTHEIR-EDIT`, message: "colleague edit" },
	});
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByText("Someone else saved this entry")).toBeVisible();
	await page.getByRole("button", { name: "Keep mine (overwrite)" }).click();
	await expect(page.getByText("All changes saved")).toBeVisible();
	const merged = await (await page.request.get("/api/content/posts/hello-world")).json();
	expect(merged.data.body).toContain("RECOVER-ME");
	expect(merged.data.body).not.toContain("THEIR-EDIT");

	// Publish toggle saves immediately.
	await page.getByRole("button", { name: "Unpublish" }).click();
	await expect(page.getByLabel("Draft", { exact: true })).toBeChecked();
	await page.getByRole("button", { name: "Publish", exact: true }).click();
	await expect(page.getByLabel("Draft", { exact: true })).not.toBeChecked();
	await expect(page.getByRole("button", { name: "Unpublish" })).toBeVisible();

	// A shareable preview link is minted for the entry.
	await page.getByRole("button", { name: "Preview link" }).click();
	await expect(page.getByText("Anyone with this link can see this entry")).toBeVisible();

	await context.close();
});
