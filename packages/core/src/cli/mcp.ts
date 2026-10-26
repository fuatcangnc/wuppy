import type { StdioServerHandle } from "@modelcontextprotocol/server/stdio";
import { HUB_API_VERSION } from "../sites/connect.ts";
import { serveMcpStdio } from "../mcp/server.ts";
import type { ApiCall } from "../mcp/tools.ts";
import { loadDotEnv } from "../config/env.ts";

export interface McpCliOptions {
	cwd: string;
	env?: NodeJS.ProcessEnv;
	/** Override for tests; production uses the global fetch. */
	fetch?: typeof fetch;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Calls the hub or site REST API with the token from the client configuration. */
export function createApiCall(baseUrl: string, token: string, fetchImpl: typeof fetch = fetch): ApiCall {
	const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
	return async (method, path, body) => {
		const headers = new Headers({ authorization: `Bearer ${token}`, accept: "application/json" });
		if (body !== undefined) headers.set("content-type", "application/json");
		const response = await fetchImpl(new URL(path.replace(/^\/+/, ""), base), {
			method,
			headers,
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
			signal: AbortSignal.timeout(30_000),
		});
		return { status: response.status, body: await response.json().catch(() => null) };
	};
}

function settingsFrom(env: NodeJS.ProcessEnv): { url: string; token: string } | { error: string } {
	const raw = (env.WUPPY_URL ?? "").trim();
	const token = (env.WUPPY_TOKEN ?? "").trim();
	if (!raw || !token)
		return {
			error: "Set WUPPY_URL to your hub or site URL and WUPPY_TOKEN to an API token (Users → API tokens).",
		};
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return { error: "WUPPY_URL must be a full URL, for example https://hub.example.com" };
	}
	if (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname)))
		return { error: "WUPPY_URL must use https:// (http:// is allowed only on localhost)" };
	if (url.username || url.password) return { error: "WUPPY_URL must not contain credentials" };
	if (!token.startsWith("wuppy_")) return { error: "WUPPY_TOKEN must be a Wuppy API token (wuppy_…)" };
	return { url: url.href, token };
}

/**
 * Starts the stdio MCP server used by coding agents. It reads `WUPPY_URL` and `WUPPY_TOKEN` (or the site's
 * `.env`) and keeps running until the client closes stdin. stdout is the protocol channel, so only stderr is used.
 */
export async function startMcp({
	cwd,
	env = process.env,
	fetch: fetchImpl,
}: McpCliOptions): Promise<StdioServerHandle | null> {
	await loadDotEnv(cwd);
	const settings = settingsFrom(env);
	if ("error" in settings) {
		console.error(settings.error);
		process.exitCode = 1;
		return null;
	}
	const handle = serveMcpStdio(createApiCall(settings.url, settings.token, fetchImpl), String(HUB_API_VERSION));
	console.error(`Wuppy MCP server listening on stdio for ${new URL(settings.url).origin}`);
	return handle;
}
