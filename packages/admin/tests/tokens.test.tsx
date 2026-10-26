import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TOKEN_SCOPES, UsersPage } from "../src/components/users/UsersPage.tsx";
import { chooseSelect } from "./utils/select.ts";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

function server() {
	const posted: unknown[] = [];
	vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
		if (url.endsWith("/api/roles"))
			return reply({
				data: {
					permissions: ["content:read", "content:write"],
					roles: [
						{ name: "admin", permissions: ["content:read", "content:write"] },
						{ name: "viewer", permissions: ["content:read"] },
					],
				},
			});
		if (url.endsWith("/api/tokens") && init.method === "POST") {
			posted.push(JSON.parse(String(init.body)));
			return reply({ data: { token: "wuppy_secret" } }, 201);
		}
		if (url.endsWith("/api/tokens"))
			return reply({
				data: [
					{
						id: "t1",
						name: "ci",
						createdAt: "2026-01-01T00:00:00Z",
						lastUsedAt: null,
						expiresAt: null,
						permissions: ["content:read"],
					},
				],
			});
		return reply({ users: [], total: 0 });
	});
	return posted;
}

describe("roles matrix and API tokens", () => {
	it("shows what each role can do", async () => {
		server();
		render(<UsersPage />);
		expect(await screen.findByLabelText("viewer cannot content:write")).toHaveTextContent("—");
		expect(screen.getByLabelText("viewer can content:read")).toHaveTextContent("✓");
		expect(screen.getByLabelText("admin can content:write")).toHaveTextContent("✓");
	});

	it("creates a read-only token that expires and lists its scope", async () => {
		const posted = server();
		render(<UsersPage />);
		const user = userEvent.setup();
		expect(await screen.findByText("1 permissions")).toBeInTheDocument();
		await user.type(screen.getByLabelText("Token name"), "deploy");
		await chooseSelect(user, "Access", "Read content only");
		await chooseSelect(user, "Expires", "In 30 days");
		await user.click(screen.getByRole("button", { name: "Create token" }));
		await waitFor(() => expect(posted).toHaveLength(1));
		const body = posted[0] as { name: string; permissions: string[]; expiresAt: string };
		expect(body).toMatchObject({ name: "deploy", permissions: TOKEN_SCOPES.read.permissions });
		const days = (new Date(body.expiresAt).getTime() - Date.now()) / 86_400_000;
		expect(days).toBeGreaterThan(29.9);
		expect(await screen.findByText("wuppy_secret")).toBeInTheDocument();
	});

	it("sends no permission list for 'everything I can do', so the server uses the owner's", async () => {
		const posted = server();
		render(<UsersPage />);
		const user = userEvent.setup();
		await user.type(await screen.findByLabelText("Token name"), "all");
		await user.click(screen.getByRole("button", { name: "Create token" }));
		await waitFor(() => expect(posted).toEqual([{ name: "all" }]));
	});

	it("offers copy-ready MCP configs for the new token", async () => {
		server();
		const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
		render(<UsersPage />);
		const user = userEvent.setup();
		await user.type(await screen.findByLabelText("Token name"), "agent");
		await user.click(screen.getByRole("button", { name: "Create token" }));
		expect(await screen.findByText("wuppy_secret")).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: "opencode" })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: "Cursor" })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: "Codex" })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: "Claude Code" })).toBeInTheDocument();
		fireEvent.click(screen.getByRole("tab", { name: "Claude Code" }));
		fireEvent.click(screen.getByRole("button", { name: "Copy Claude Code config" }));
		await waitFor(() =>
			expect(writeText).toHaveBeenCalledWith(expect.stringContaining("claude mcp add --transport http wuppy")),
		);
		expect(writeText).toHaveBeenCalledWith(expect.stringContaining("wuppy_secret"));
		expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/api/mcp"));
	});
});
