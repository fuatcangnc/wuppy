import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsersPage } from "../src/components/users/UsersPage.tsx";
import { chooseSelect } from "./utils/select.ts";

afterEach(() => vi.unstubAllGlobals());

function stub(handler: (url: string, init?: RequestInit) => unknown) {
	const calls: { url: string; init?: RequestInit }[] = [];
	const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
	vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
		calls.push({ url, init });
		if (url.endsWith("/api/tokens")) return new Response(JSON.stringify({ data: [] }), { status: 200 });
		if (url.endsWith("/api/auth/admin/list-user-sessions")) {
			return new Response(
				JSON.stringify({
					sessions: [
						{
							id: "s1",
							token: "session-token-1",
							createdAt: new Date().toISOString(),
							expiresAt,
							ipAddress: "203.0.113.8",
							userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0",
						},
					],
				}),
				{ status: 200 },
			);
		}
		if (url.endsWith("/api/auth/admin/set-user-password"))
			return new Response(JSON.stringify({ status: true }), { status: 200 });
		if (url.endsWith("/api/auth/admin/revoke-user-sessions")) {
			return new Response(JSON.stringify({ success: true }), { status: 200 });
		}
		if (url.endsWith("/reset-two-factor")) return new Response(JSON.stringify({ data: { ok: true } }), { status: 200 });
		return new Response(JSON.stringify(handler(url, init)), { status: 200 });
	});
	return calls;
}

describe("UsersPage", () => {
	it("lists users with their roles", async () => {
		stub(() => ({ users: [{ id: "1", email: "a@x.test", name: "A", role: "admin" }], total: 1 }));
		render(<UsersPage />);
		expect(await screen.findByText("a@x.test")).toBeInTheDocument();
		await userEvent.setup().click(screen.getByRole("button", { name: "Open a@x.test" }));
		expect(await screen.findByRole("combobox", { name: "Role for a@x.test" })).toHaveTextContent("admin");
	});

	it("creates a user with the chosen role and reloads the list", async () => {
		const calls = stub(() => ({ users: [], total: 0 }));
		render(<UsersPage />);
		await screen.findByText("No users yet");
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "Add user" }));
		await user.type(screen.getByLabelText("Name"), "Ed");
		await user.type(screen.getByLabelText("Email"), "ed@x.test");
		await user.type(screen.getByLabelText(/Temporary password/), "correct-horse-battery");
		await chooseSelect(user, /^Role/, "editor");
		await user.click(screen.getAllByRole("button", { name: /^Add user$/ }).at(-1)!);
		await waitFor(() => expect(calls.some((c) => c.url.endsWith("/admin/create-user"))).toBe(true));
		const create = calls.find((c) => c.url.endsWith("/admin/create-user"))!;
		expect(JSON.parse(create.init!.body as string)).toEqual({
			name: "Ed",
			email: "ed@x.test",
			password: "correct-horse-battery",
			role: "editor",
		});
		expect(calls.filter((c) => c.url.includes("list-users")).length).toBeGreaterThanOrEqual(2);
	});

	it("changes a role through set-role", async () => {
		const calls = stub(() => ({ users: [{ id: "7", email: "v@x.test", name: "V", role: "viewer" }], total: 1 }));
		render(<UsersPage />);
		const user = userEvent.setup();
		await user.click(await screen.findByRole("button", { name: "Open v@x.test" }));
		await chooseSelect(user, "Role for v@x.test", "editor");
		await waitFor(() => expect(calls.some((c) => c.url.endsWith("/admin/set-role"))).toBe(true));
		expect(JSON.parse(calls.find((c) => c.url.endsWith("/admin/set-role"))!.init!.body as string)).toEqual({
			userId: "7",
			role: "editor",
		});
	});

	it("sends an invitation with the chosen role", async () => {
		const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
		const calls = stub((url, init) => {
			if (url.endsWith("/api/invitations")) {
				return init?.method === "POST" ? { data: { email: "new@x.test", role: "editor", expiresAt } } : { data: [] };
			}
			return { users: [], total: 0 };
		});
		render(<UsersPage />);
		await screen.findByText("No users yet");
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "Invite user" }));
		await user.type(screen.getByLabelText("Email"), "new@x.test");
		await chooseSelect(user, "Role", "editor");
		await user.click(screen.getByRole("button", { name: "Send invitation" }));
		await waitFor(() =>
			expect(calls.some((c) => c.url.endsWith("/api/invitations") && c.init?.method === "POST")).toBe(true),
		);
		const invite = calls.find((c) => c.url.endsWith("/api/invitations") && c.init?.method === "POST")!;
		expect(JSON.parse(invite.init!.body as string)).toEqual({ email: "new@x.test", role: "editor" });
	});

	it("lists pending invitations and revokes one", async () => {
		const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
		const calls = stub((url, init) => {
			if (url.endsWith("/api/invitations") && init?.method === "GET") {
				return {
					data: [
						{
							id: "invite-1",
							email: "pending@x.test",
							role: "viewer",
							createdAt: new Date().toISOString(),
							expiresAt,
						},
					],
				};
			}
			if (url.endsWith("/api/invitations/invite-1") && init?.method === "DELETE") return { data: { ok: true } };
			return { users: [], total: 0 };
		});
		render(<UsersPage />);
		expect(await screen.findByText("pending@x.test")).toBeInTheDocument();
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "Resend" }));
		await waitFor(() =>
			expect(calls.some((c) => c.url.endsWith("/api/invitations") && c.init?.method === "POST")).toBe(true),
		);
		const resend = calls.find((c) => c.url.endsWith("/api/invitations") && c.init?.method === "POST")!;
		expect(JSON.parse(resend.init!.body as string)).toEqual({ email: "pending@x.test", role: "viewer" });
		await user.click(screen.getByRole("button", { name: "Revoke" }));
		await waitFor(() =>
			expect(calls.some((c) => c.url.endsWith("/api/invitations/invite-1") && c.init?.method === "DELETE")).toBe(true),
		);
	});

	it("opens the security dialog and revokes a user session", async () => {
		const calls = stub(() => ({
			users: [{ id: "7", email: "v@x.test", name: "V", role: "viewer", twoFactorEnabled: true }],
			total: 1,
		}));
		render(<UsersPage />);
		await screen.findByText("v@x.test");
		await userEvent.setup().click(screen.getByRole("button", { name: "Open v@x.test" }));
		await userEvent.setup().click(await screen.findByRole("button", { name: "Manage" }));

		expect(await screen.findByText("Active sessions")).toBeInTheDocument();
		expect(await screen.findByText("Chrome on Linux")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Set password" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Reset 2FA" })).toBeInTheDocument();

		await userEvent.setup().click(screen.getByRole("button", { name: "Revoke" }));
		await waitFor(() => expect(calls.some((c) => c.url.endsWith("/admin/revoke-user-session"))).toBe(true));
		expect(JSON.parse(calls.find((c) => c.url.endsWith("/admin/revoke-user-session"))!.init!.body as string)).toEqual({
			sessionToken: "session-token-1",
		});
	});

	it("sets a temporary password and revokes the user's sessions", async () => {
		const calls = stub(() => ({
			users: [{ id: "7", email: "v@x.test", name: "V", role: "viewer" }],
			total: 1,
		}));
		render(<UsersPage />);
		await screen.findByText("v@x.test");
		await userEvent.setup().click(screen.getByRole("button", { name: "Open v@x.test" }));
		await userEvent.setup().click(await screen.findByRole("button", { name: "Manage" }));
		await screen.findByText("Active sessions");

		await userEvent.setup().type(screen.getByLabelText("New password"), "correct-horse-battery");
		await userEvent.setup().click(screen.getByRole("button", { name: "Set password" }));
		await waitFor(() => expect(calls.some((c) => c.url.endsWith("/admin/set-user-password"))).toBe(true));
		expect(JSON.parse(calls.find((c) => c.url.endsWith("/admin/set-user-password"))!.init!.body as string)).toEqual({
			userId: "7",
			newPassword: "correct-horse-battery",
		});
		expect(calls.some((c) => c.url.endsWith("/admin/revoke-user-sessions"))).toBe(true);
	});

	it("resets two-factor authentication for another user", async () => {
		const calls = stub(() => ({
			users: [{ id: "7", email: "v@x.test", name: "V", role: "viewer", twoFactorEnabled: true }],
			total: 1,
		}));
		const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
		render(<UsersPage />);
		await screen.findByText("v@x.test");
		await userEvent.setup().click(screen.getByRole("button", { name: "Open v@x.test" }));
		await userEvent.setup().click(await screen.findByRole("button", { name: "Manage" }));
		await screen.findByText("Active sessions");
		await userEvent.setup().click(screen.getByRole("button", { name: "Reset 2FA" }));
		await waitFor(() => expect(calls.some((c) => c.url.endsWith("/reset-two-factor"))).toBe(true));
		confirm.mockRestore();
	});
});
