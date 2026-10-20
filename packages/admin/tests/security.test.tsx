import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "../src/components/auth/LoginPage.tsx";
import { SecurityPage } from "../src/components/auth/SecurityPage.tsx";
import { $session, $socialProviders } from "../src/stores/session.ts";

const authMocks = vi.hoisted(() => ({
	signInPasskey: vi.fn(),
	addPasskey: vi.fn(),
	linkSocial: vi.fn(),
	signInSocial: vi.fn(),
}));

vi.mock("../src/lib/auth-client.ts", () => ({
	authClient: {
		signIn: { passkey: authMocks.signInPasskey, social: authMocks.signInSocial },
		linkSocial: authMocks.linkSocial,
		passkey: { addPasskey: authMocks.addPasskey },
	},
}));

afterEach(() => {
	vi.unstubAllGlobals();
	$socialProviders.set([]);
	window.history.replaceState({}, "", "/");
});

function stub(handler: (url: string, body: unknown) => unknown) {
	const calls: { url: string; body: unknown; init?: RequestInit }[] = [];
	const sessions = [
		{
			id: "s-other",
			token: "other-token",
			createdAt: "2026-10-20T10:00:00.000Z",
			expiresAt: "2026-11-19T10:00:00.000Z",
			ipAddress: "203.0.113.4",
			userAgent: "Mozilla/5.0 (X11; Linux x86_64) Firefox/120.0",
		},
		{
			id: "s-current",
			token: "current-token",
			createdAt: "2026-10-20T11:00:00.000Z",
			expiresAt: "2026-11-19T11:00:00.000Z",
			ipAddress: "203.0.113.5",
			userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0",
		},
	];
	vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
		const body = init?.body ? JSON.parse(init.body as string) : undefined;
		calls.push({ url, body, init });
		if (url.endsWith("/api/auth/list-sessions")) return new Response(JSON.stringify(sessions), { status: 200 });
		if (url.endsWith("/api/auth/get-session")) {
			return new Response(JSON.stringify({ session: { token: "current-token" }, user: { id: "u1" } }), {
				status: 200,
			});
		}
		return new Response(JSON.stringify(handler(url, body)), { status: 200 });
	});
	return calls;
}

describe("LoginPage two-factor step", () => {
	beforeEach(() => $session.set({ status: "anon", needsSetup: false, twoFactor: true }));

	it("asks for the authenticator code and submits it", async () => {
		const calls = stub(() => ({ needsSetup: false }));
		render(<LoginPage />);
		expect(screen.getByRole("heading", { name: "Two-factor authentication" })).toBeInTheDocument();
		await userEvent.setup().type(screen.getByLabelText("Authentication code"), "123456");
		await userEvent.setup().click(screen.getByRole("button", { name: "Verify" }));
		await waitFor(() => expect(calls.some((c) => c.url.endsWith("/two-factor/verify-totp"))).toBe(true));
		expect(calls.find((c) => c.url.endsWith("/two-factor/verify-totp"))?.body).toEqual({ code: "123456" });
	});

	it("can switch to a backup code", async () => {
		const calls = stub(() => ({ needsSetup: false }));
		render(<LoginPage />);
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "Use a backup code" }));
		await user.type(screen.getByLabelText("Backup code"), "abcde-12345");
		await user.click(screen.getByRole("button", { name: "Verify" }));
		await waitFor(() => expect(calls.some((c) => c.url.endsWith("/verify-backup-code"))).toBe(true));
	});
});

describe("LoginPage password reset", () => {
	beforeEach(() => {
		$session.set({ status: "anon", needsSetup: false });
	});

	it("submits the reset token and new password", async () => {
		window.history.replaceState({}, "", "/admin/?token=reset-token");
		const calls = stub(() => ({ status: true }));
		render(<LoginPage />);
		expect(screen.getByRole("heading", { name: "Choose a new password" })).toBeInTheDocument();
		const user = userEvent.setup();
		await user.type(screen.getByLabelText("New password"), "new-password-123");
		await user.type(screen.getByLabelText("Confirm new password"), "new-password-123");
		await user.click(screen.getByRole("button", { name: "Reset password" }));
		await waitFor(() => expect(calls.some((c) => c.url.endsWith("/reset-password"))).toBe(true));
		expect(calls.find((c) => c.url.endsWith("/reset-password"))?.body).toEqual({
			newPassword: "new-password-123",
			token: "reset-token",
		});
		expect(await screen.findByText("Password reset. Sign in with your new password.")).toBeInTheDocument();
		expect(window.location.search).toBe("");
	});

	it("requests a reset email", async () => {
		const calls = stub(() => ({ status: true, message: "If this email exists in our system, check your email." }));
		render(<LoginPage />);
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "Forgot password?" }));
		await user.type(screen.getByLabelText("Email"), "a@x.test");
		await user.click(screen.getByRole("button", { name: "Send reset link" }));
		await waitFor(() => expect(calls.some((c) => c.url.endsWith("/request-password-reset"))).toBe(true));
		const body = calls.find((c) => c.url.endsWith("/request-password-reset"))?.body as {
			email: string;
			redirectTo: string;
		};
		expect(body.email).toBe("a@x.test");
		expect(body.redirectTo).toMatch(/\/admin\/$/);
		expect(await screen.findByText("If this email exists in our system, check your email.")).toBeInTheDocument();
	});
});

describe("LoginPage invitation", () => {
	beforeEach(() => {
		$session.set({ status: "anon", needsSetup: false });
	});

	it("creates the account with the invite header and accepts it", async () => {
		window.history.replaceState({}, "", "/admin/?invite=invite-token");
		const calls = stub((url) => {
			if (url.endsWith("/api/invitations/accept")) return { data: { ok: true, role: "editor" } };
			return {};
		});
		render(<LoginPage />);
		expect(screen.getByRole("heading", { name: "Accept your invitation" })).toBeInTheDocument();
		const user = userEvent.setup();
		await user.type(screen.getByLabelText("Name"), "New Person");
		await user.type(screen.getByLabelText("Email"), "new@x.test");
		await user.type(screen.getByLabelText("Password"), "correct-horse-battery");
		await user.type(screen.getByLabelText("Confirm password"), "correct-horse-battery");
		await user.click(screen.getByRole("button", { name: "Accept invitation" }));
		await waitFor(() => expect(calls.some((c) => c.url.endsWith("/api/invitations/accept"))).toBe(true));

		const signUp = calls.find((c) => c.url.endsWith("/api/auth/sign-up/email"))!;
		expect(signUp.init?.headers).toMatchObject({ "x-wuppy-invite": "invite-token" });
		expect(signUp.body).toEqual({ name: "New Person", email: "new@x.test", password: "correct-horse-battery" });
		expect(calls.find((c) => c.url.endsWith("/api/invitations/accept"))?.body).toEqual({ token: "invite-token" });
		expect(await screen.findByText("Invitation accepted. You can sign in now.")).toBeInTheDocument();
		expect(window.location.search).toBe("");
	});
});

describe("LoginPage first-run setup", () => {
	beforeEach(() => {
		$session.set({ status: "anon", needsSetup: true });
	});

	it("creates the owner, saves the site identity and can add a sample post", async () => {
		const calls = stub((url, body) => {
			if (url.endsWith("/api/collections")) return { data: [{ name: "posts" }] };
			if (url.endsWith("/api/content/posts")) return { data: { ok: true, slug: "hello-world" } };
			if (url.endsWith("/api/data/settings") && body === undefined) {
				return { data: { siteName: "Wuppy", siteUrl: "", description: "A site" } };
			}
			return { data: body ?? null };
		});
		render(<LoginPage />);
		expect(screen.getByRole("heading", { name: "Set up your site" })).toBeInTheDocument();
		const user = userEvent.setup();
		await user.clear(screen.getByLabelText("Site name"));
		await user.type(screen.getByLabelText("Site name"), "Field Notes");
		await user.clear(screen.getByLabelText("Site URL"));
		await user.type(screen.getByLabelText("Site URL"), "https://notes.example.com");
		await user.type(screen.getByLabelText("Your name"), "Owner");
		await user.type(screen.getByLabelText("Email"), "owner@example.com");
		await user.type(screen.getByLabelText("Password"), "correct-horse-battery");
		await user.click(screen.getByLabelText("Create a sample post"));
		await user.click(screen.getByRole("button", { name: "Create account" }));
		await waitFor(() =>
			expect(calls.some((c) => c.url.endsWith("/api/data/settings") && c.init?.method === "PUT")).toBe(true),
		);
		const put = calls.find((c) => c.url.endsWith("/api/data/settings") && c.init?.method === "PUT");
		expect(put?.body).toMatchObject({
			data: {
				siteName: "Field Notes",
				siteUrl: "https://notes.example.com",
				description: "A site",
			},
		});
		await waitFor(() => expect(calls.some((c) => c.url.endsWith("/api/content/posts"))).toBe(true));
		expect(calls.find((c) => c.url.endsWith("/api/content/posts"))?.body).toEqual({
			slug: "hello-world",
			data: { title: "Hello world", draft: false },
			body: "This is your first post. You can edit or delete it from the admin.\n",
		});
	});
});

describe("LoginPage passkeys", () => {
	beforeEach(() => {
		authMocks.signInPasskey.mockReset();
		authMocks.signInPasskey.mockResolvedValue({ data: { session: {} }, error: null });
		$session.set({ status: "anon", needsSetup: false });
	});

	it("starts a passkey sign-in", async () => {
		stub(() => ({}));
		render(<LoginPage />);
		await userEvent.setup().click(screen.getByRole("button", { name: "Sign in with a passkey" }));
		await waitFor(() => expect(authMocks.signInPasskey).toHaveBeenCalled());
	});

	it("starts a configured social sign-in and explains an unlinked callback", async () => {
		$socialProviders.set(["github", "google"]);
		authMocks.signInSocial.mockResolvedValue({ data: null, error: null });
		stub(() => ({}));
		render(<LoginPage />);
		await userEvent.setup().click(screen.getByRole("button", { name: "Continue with GitHub" }));
		await waitFor(() =>
			expect(authMocks.signInSocial).toHaveBeenCalledWith({
				provider: "github",
				callbackURL: "/admin/",
				errorCallbackURL: "/admin/?oauth_error=1",
			}),
		);
	});

	it("explains a provider that is not linked", () => {
		window.history.replaceState({}, "", "/admin/?oauth_error=1&error=signup_disabled");
		stub(() => ({}));
		render(<LoginPage />);
		expect(screen.getByText(/not connected to an account/)).toBeInTheDocument();
	});
});

describe("SecurityPage", () => {
	it("enables two-factor: shows the secret and backup codes once, then confirms with a code", async () => {
		const calls = stub((url) =>
			url.endsWith("/two-factor/enable")
				? {
						totpURI: "otpauth://totp/Wuppy:a@x.test?secret=JBSWY3DPEHPK3PXP&issuer=Wuppy",
						backupCodes: ["aaaaa-11111", "bbbbb-22222"],
					}
				: {},
		);
		render(<SecurityPage twoFactorEnabled={false} />);
		const user = userEvent.setup();
		await user.type(screen.getByLabelText("Account password"), "correct-horse-battery");
		await user.click(screen.getByRole("button", { name: "Enable two-factor" }));
		expect(await screen.findByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
		expect(screen.getByText("aaaaa-11111")).toBeInTheDocument();
		expect(calls.find((c) => c.url.endsWith("/two-factor/enable"))?.body).toEqual({
			password: "correct-horse-battery",
			method: "totp",
		});

		await user.type(screen.getByLabelText("Authentication code"), "654321");
		await user.click(screen.getByRole("button", { name: "Confirm" }));
		await waitFor(() => expect(calls.some((c) => c.url.endsWith("/two-factor/verify-totp"))).toBe(true));
	});

	it("offers to disable when already enabled", async () => {
		const calls = stub(() => ({}));
		render(<SecurityPage twoFactorEnabled />);
		const user = userEvent.setup();
		await user.type(screen.getByLabelText("Account password"), "correct-horse-battery");
		await user.click(screen.getByRole("button", { name: "Disable two-factor" }));
		await waitFor(() => expect(calls.some((c) => c.url.endsWith("/two-factor/disable"))).toBe(true));
	});

	it("changes the password and signs out other sessions", async () => {
		const calls = stub(() => ({ status: true }));
		render(<SecurityPage twoFactorEnabled={false} />);
		const user = userEvent.setup();
		await user.type(screen.getByLabelText("Current password"), "old-password");
		await user.type(screen.getByLabelText("New password"), "new-password-123");
		await user.click(screen.getByRole("button", { name: "Change password" }));
		await waitFor(() => expect(calls.some((c) => c.url.endsWith("/change-password"))).toBe(true));
		expect(calls.find((c) => c.url.endsWith("/change-password"))?.body).toEqual({
			currentPassword: "old-password",
			newPassword: "new-password-123",
			revokeOtherSessions: true,
		});
		expect(await screen.findByText("Password changed. Other sessions were signed out.")).toBeInTheDocument();
	});

	it("lists active sessions and revokes another device", async () => {
		const calls = stub(() => ({}));
		render(<SecurityPage twoFactorEnabled={false} />);
		expect(await screen.findByText("This device")).toBeInTheDocument();
		expect(screen.getByText("Firefox on Linux")).toBeInTheDocument();
		expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(1);

		await userEvent.setup().click(screen.getByRole("button", { name: "Revoke" }));
		await waitFor(() => expect(calls.some((c) => c.url.endsWith("/revoke-session"))).toBe(true));
		expect(calls.find((c) => c.url.endsWith("/revoke-session"))?.body).toEqual({ token: "other-token" });
	});

	it("can sign out all other devices", async () => {
		const calls = stub(() => ({}));
		render(<SecurityPage twoFactorEnabled={false} />);
		await screen.findByText("This device");
		await userEvent.setup().click(screen.getByRole("button", { name: "Sign out other devices" }));
		await waitFor(() => expect(calls.some((c) => c.url.endsWith("/revoke-other-sessions"))).toBe(true));
	});

	it("shows configured providers and starts account linking", async () => {
		$socialProviders.set(["github"]);
		authMocks.linkSocial.mockResolvedValue({ data: { url: "", redirect: false }, error: null });
		const calls = stub((url) => (url.endsWith("/api/auth/list-accounts") ? [] : {}));
		render(<SecurityPage twoFactorEnabled={false} />);
		await userEvent.setup().click(await screen.findByRole("button", { name: "Connect" }));
		await waitFor(() =>
			expect(authMocks.linkSocial).toHaveBeenCalledWith({
				provider: "github",
				callbackURL: "/admin/security",
				errorCallbackURL: "/admin/security?link_error=1",
			}),
		);
		expect(calls.some((call) => call.url.endsWith("/api/auth/list-accounts"))).toBe(true);
	});

	it("shows an already connected provider", async () => {
		$socialProviders.set(["github"]);
		stub((url) => (url.endsWith("/api/auth/list-accounts") ? [{ providerId: "github" }] : {}));
		render(<SecurityPage twoFactorEnabled={false} />);
		expect(await screen.findByText("Connected")).toBeInTheDocument();
	});

	it("lists and removes passkeys", async () => {
		const calls = stub((url) =>
			url.endsWith("/passkey/list-user-passkeys")
				? [{ id: "p1", name: "Laptop", deviceType: "single_device", backedUp: false }]
				: {},
		);
		const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
		render(<SecurityPage twoFactorEnabled={false} />);
		expect(await screen.findByText("Laptop")).toBeInTheDocument();
		await userEvent.setup().click(screen.getByRole("button", { name: "Remove Laptop" }));
		await waitFor(() => expect(calls.some((c) => c.url.endsWith("/passkey/delete-passkey"))).toBe(true));
		expect(calls.find((c) => c.url.endsWith("/passkey/delete-passkey"))?.body).toEqual({ id: "p1" });
		confirm.mockRestore();
	});
});
