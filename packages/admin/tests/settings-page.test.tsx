import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "../src/components/settings/SettingsPage.tsx";
import { ToastHost } from "../src/ui/index.tsx";

afterEach(() => vi.unstubAllGlobals());

const defaults = {
	invite: { subject: "You're invited to {{siteName}}", text: "Join: {{link}}" },
	reset: { subject: "Reset", text: "Reset: {{link}}" },
	magic: { subject: "Sign in", text: "Sign in: {{link}}" },
};

function server() {
	const calls: { method: string; url: string; body?: any }[] = [];
	vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
		const method = init.method ?? "GET";
		calls.push({ method, url, body: typeof init.body === "string" ? JSON.parse(init.body) : undefined });
		if (url === "/api/email/templates") {
			return new Response(
				JSON.stringify({ data: { defaults, variables: { invite: ["link"], reset: ["link"], magic: ["link"] } } }),
			);
		}
		if (url === "/api/data/settings" && method === "GET")
			return new Response(JSON.stringify({ data: { siteName: "Acme" } }));
		return new Response(JSON.stringify({ data: calls.at(-1)?.body?.data ?? { ok: true } }));
	});
	return calls;
}

describe("SettingsPage", () => {
	it("groups the settings sections under headings", async () => {
		server();
		render(<SettingsPage />);
		const nav = screen.getByRole("navigation", { name: "Settings sections" });
		for (const heading of ["Site", "Media", "Security Settings", "Email Settings"]) {
			expect(within(nav).getByText(heading, { selector: "p" })).toBeInTheDocument();
		}
		expect(within(nav).getByRole("button", { name: "General" })).toBeInTheDocument();
		expect(within(nav).getByRole("button", { name: "Email templates" })).toBeInTheDocument();
	});

	it("saves allowed domains, social links, template overrides and backup schedule", async () => {
		const calls = server();
		render(
			<>
				<SettingsPage />
				<ToastHost />
			</>,
		);
		const user = userEvent.setup();
		await screen.findByDisplayValue("Acme");

		await user.type(screen.getByLabelText("Allowed email domains for invitations"), "Example.com, example.org");
		await user.type(screen.getByLabelText("github"), "https://github.com/acme");
		await user.type(screen.getByLabelText("Invitation subject"), "Welcome");
		await user.click(screen.getByLabelText("Back up automatically"));
		await user.click(screen.getByLabelText("image/gif")); // allowed by default -> now off
		await user.click(screen.getByRole("button", { name: "Save settings" }));

		await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
		const saved = calls.find((c) => c.method === "PUT")!.body.data;
		expect(saved.security.allowedDomains).toEqual(["example.com", "example.org"]);
		expect(saved.social).toEqual({ github: "https://github.com/acme" });
		expect(saved.email.templates).toEqual({ invite: { subject: "Welcome" } });
		expect(saved.backup).toMatchObject({ enabled: true, intervalHours: 24, keep: 14 });
		expect(saved.media.allowed).not.toContain("image/gif");
		expect(await screen.findByText("Settings saved")).toBeInTheDocument();
	}, 15_000);

	it("shows the built-in text as placeholder and the placeholders each template accepts", async () => {
		server();
		render(<SettingsPage />);
		expect(await screen.findByPlaceholderText("You're invited to {{siteName}}")).toBeInTheDocument();
		expect(screen.getAllByText(/Placeholders: \{\{link\}\}/)).toHaveLength(3);
	}, 10_000);

	it("sends a test email to the typed address", async () => {
		const calls = server();
		render(
			<>
				<SettingsPage />
				<ToastHost />
			</>,
		);
		const user = userEvent.setup();
		await user.type(await screen.findByLabelText("Send a test email to"), "me@example.com");
		await user.click(screen.getByRole("button", { name: "Send test email" }));
		await waitFor(() => expect(calls.find((c) => c.url === "/api/email/test")?.body).toEqual({ to: "me@example.com" }));
		expect(await screen.findByText("Test email sent to me@example.com")).toBeInTheDocument();
	}, 10_000);
});
