import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const mailLog = join(tmpdir(), "wuppy-e2e-4555.log");

// `astro dev` is how people work day to day; it must serve the API, admin, sitemap and content, not only the built server.
test("astro dev serves API, admin, sitemap and robots", async ({ request }) => {
	const setup = await request.get("/api/setup");
	expect(setup.status()).toBe(200);
	expect(await setup.json()).toMatchObject({ needsSetup: true, siteName: "Wuppy Starter" });

	expect((await request.get("/admin/")).status()).toBe(200);
	expect(await (await request.get("/sitemap.xml")).text()).toContain("/posts/hello");
	expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /admin");
	expect((await request.get("/api/content/posts")).status()).toBe(401);
});

// Journey: the owner invites a new author from Users; the invitee accepts the
// emailed link in a fresh browser context and gets the invited role.
test("owner invites an author and the invitee accepts the emailed link", async ({ page, browser }) => {
	await page.goto("/admin/");
	await expect(page.getByRole("heading", { name: "Set up your site" })).toBeVisible();
	await page.getByLabel("Your name").fill("Dev Owner");
	await page.getByLabel("Email").fill("dev-owner@example.com");
	await page.getByLabel("Password").fill("correct-horse-battery");
	await page.getByRole("button", { name: "Create account" }).click();

	await page.getByRole("link", { name: "Users" }).click();
	await page.getByRole("button", { name: "Invite user" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Email").fill("dev-author@example.com");
	await dialog.getByLabel("Role").click();
	await page.getByRole("option", { name: "author" }).click();
	await dialog.getByRole("button", { name: "Send invitation" }).click();
	await expect(page.getByRole("row", { name: /dev-author@example\.com/ })).toBeVisible();

	await expect.poll(() => /\/admin\/\?invite=([A-Za-z0-9_-]+)/.test(readFileSync(mailLog, "utf8"))).toBe(true);
	const token = /\/admin\/\?invite=([A-Za-z0-9_-]+)/.exec(readFileSync(mailLog, "utf8"))![1];

	const origin = new URL(page.url()).origin;
	const inviteeContext = await browser.newContext({ baseURL: origin });
	const invitee = await inviteeContext.newPage();
	await invitee.goto(`/admin/?invite=${encodeURIComponent(token)}`);
	await expect(invitee.getByRole("heading", { name: "Accept your invitation" })).toBeVisible();
	await invitee.getByLabel("Name").fill("Dev Author");
	await invitee.getByLabel("Email").fill("dev-author@example.com");
	await invitee.getByLabel("Password", { exact: true }).fill("another-long-password");
	await invitee.getByLabel("Confirm password").fill("another-long-password");
	await invitee.getByRole("button", { name: "Accept invitation" }).click();

	await expect(invitee.getByText("dev-author@example.com")).toBeVisible();
	await expect(invitee.getByRole("link", { name: "Users" })).toHaveCount(0);
	expect((await invitee.request.get("/api/content/posts")).status()).toBe(200);
	expect((await invitee.request.get("/api/audit")).status()).toBe(403);

	await page.reload();
	await expect(page.getByText("No pending invitations.")).toBeVisible();
	await expect(page.getByRole("button", { name: "Open dev-author@example.com" })).toBeVisible();
	await inviteeContext.close();
});
