import { describe, expect, it } from "vitest";
import { createApiCall } from "../../src/cli/mcp.ts";

describe("wuppycms mcp", () => {
	it("calls the hub API with the caller's token and keeps a base path", async () => {
		const calls: { url: string; init: RequestInit }[] = [];
		const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
			calls.push({ url: String(url), init: init ?? {} });
			return Response.json({ data: [] });
		}) as typeof globalThis.fetch;
		const call = createApiCall("https://hub.test/wuppy/", "wuppy_test", fetch);
		const result = await call("POST", "/api/sites", { name: "Client" });
		expect(result).toEqual({ status: 200, body: { data: [] } });
		expect(calls[0]!.url).toBe("https://hub.test/wuppy/api/sites");
		expect(new Headers(calls[0]!.init.headers).get("authorization")).toBe("Bearer wuppy_test");
		expect(calls[0]!.init.body).toBe(JSON.stringify({ name: "Client" }));
	});
});
