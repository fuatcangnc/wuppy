import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PluginsPage } from "../src/components/plugins/PluginsPage.tsx";
import { ToastHost } from "../src/ui/index.tsx";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const manifest = {
	id: "hello",
	version: "1.0.0",
	hooks: ["onContentUpdated"],
	routes: [],
	adminPages: [],
	settings: [{ key: "greeting", label: "Greeting", type: "string" }],
	capabilities: {
		content: { read: ["posts"], write: ["posts"] },
		network: [{ host: "api.example.com", methods: ["POST"], paths: ["/"] }],
		secrets: ["API_KEY"],
		email: true,
	},
	limits: { timeoutMs: 2000, memoryMb: 16, callsPerMinute: 120 },
};

function server(plugins: object[], extra: Record<string, () => Response> = {}) {
	const calls: { method: string; url: string; body?: unknown }[] = [];
	vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
		const method = init.method ?? "GET";
		calls.push({ method, url, body: typeof init.body === "string" ? JSON.parse(init.body) : undefined });
		const key = Object.keys(extra).find((k) => `${method} ${url}`.startsWith(k));
		if (key) return extra[key]!();
		if (url === "/api/plugins") return new Response(JSON.stringify({ data: { plugins } }));
		if (url.endsWith("/settings")) return new Response(JSON.stringify({ data: { values: { greeting: "hi" } } }));
		return new Response(JSON.stringify({ data: { ok: true } }));
	});
	return calls;
}
const ui = () => (
	<>
		<PluginsPage />
		<ToastHost />
	</>
);

describe("PluginsPage", () => {
	it("spells out every permission a waiting plugin asks for and approves exactly the reviewed hash", async () => {
		const calls = server([
			{
				dir: "plugins/hello",
				id: "hello",
				version: "1.0.0",
				state: "needs-approval",
				source: "config",
				pendingHash: "a".repeat(64),
				manifest,
			},
		]);
		render(ui());
		for (const line of [
			"Read posts content",
			"Create and overwrite posts content",
			"Call api.example.com (POST /)",
			"Read secret API_KEY",
			"Send email from this site",
		]) {
			expect(await screen.findByText(line)).toBeInTheDocument();
		}
		await userEvent.setup().click(screen.getByRole("button", { name: "Approve these permissions" }));
		await waitFor(() =>
			expect(calls.find((c) => c.url === "/api/plugin-admin/approve")?.body).toEqual({
				dir: "plugins/hello",
				hash: "a".repeat(64),
			}),
		);
	});

	it("shows usage and the last error, toggles the plugin, and saves its settings", async () => {
		const calls = server([
			{
				dir: "plugins/hello",
				id: "hello",
				version: "1.0.0",
				state: "active",
				source: "config",
				manifest,
				stats: { calls: 5, failures: 1, callsThisMinute: 2, quota: 120, totalMs: 40 },
				lastError: { message: "boom", at: "2026-01-01T00:00:00Z" },
				logs: ["line one"],
			},
		]);
		render(ui());
		expect(await screen.findByText(/5 calls \(1 failed\), 2\/120 this minute/)).toBeInTheDocument();
		expect(screen.getByText(/boom/)).toBeInTheDocument();
		expect(screen.getByText("Log (1)")).toBeInTheDocument();
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "Disable" }));
		await waitFor(() =>
			expect(calls.find((c) => c.url === "/api/plugin-admin/hello/enabled")?.body).toEqual({ enabled: false }),
		);

		const field = await screen.findByLabelText("Greeting");
		await user.clear(field);
		await user.type(field, "yo");
		await user.click(screen.getByRole("button", { name: "Save plugin settings" }));
		await waitFor(() =>
			expect(calls.find((c) => c.method === "PUT" && c.url.endsWith("/settings"))?.body).toEqual({
				values: { greeting: "yo" },
			}),
		);
	});

	it("searches registries, marks signed packages and installs", async () => {
		const calls = server([], {
			"GET /api/registry": () =>
				new Response(
					JSON.stringify({
						data: {
							results: [
								{
									id: "hello",
									name: "Hello",
									version: "2.0.0",
									registry: "main",
									verified: true,
									installedVersion: "1.0.0",
									updateAvailable: true,
								},
							],
							errors: ["slow: timeout"],
						},
					}),
				),
		});
		render(ui());
		const user = userEvent.setup();
		await user.type(await screen.findByLabelText("Search registries"), "hel");
		await user.click(screen.getByRole("button", { name: "Search" }));
		expect(await screen.findByText("signed")).toBeInTheDocument();
		expect(screen.getByRole("alert")).toHaveTextContent("slow: timeout");
		await user.click(screen.getByRole("button", { name: "Update from 1.0.0" }));
		await waitFor(() =>
			expect(calls.find((c) => c.url === "/api/registry/install")?.body).toEqual({ registry: "main", id: "hello" }),
		);
	});

	it("only offers Remove for registry-installed plugins", async () => {
		server([
			{
				dir: "plugins/a",
				id: "a",
				version: "1.0.0",
				state: "disabled",
				source: "registry",
				registry: "main",
				manifest: { ...manifest, id: "a" },
			},
			{
				dir: "plugins/b",
				id: "b",
				version: "1.0.0",
				state: "disabled",
				source: "config",
				manifest: { ...manifest, id: "b" },
			},
		]);
		render(ui());
		expect(await screen.findAllByRole("button", { name: "Enable" })).toHaveLength(2);
		expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(1);
	});
});
