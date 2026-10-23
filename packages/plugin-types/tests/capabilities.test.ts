import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	canFetch,
	canReadContent,
	canReadSecret,
	canWriteContent,
	capabilityHash,
	manifestSchema,
	resolveSettings,
} from "../src/index.ts";

const manifest = manifestSchema.parse({
	id: "search-indexer",
	version: "1.0.0",
	hooks: ["onContentUpdated"],
	capabilities: {
		content: { read: ["posts"] },
		network: [{ host: "search.example.com", methods: ["POST"], paths: ["/v1/"] }],
	},
});

describe("manifest", () => {
	it("applies safe defaults: no capabilities, tight limits", () => {
		const m = manifestSchema.parse({ id: "a", version: "0.1.0" });
		expect(m.capabilities).toEqual({ content: { read: [], write: [] }, network: [], secrets: [], email: false });
		expect(m.limits).toEqual({ timeoutMs: 2000, memoryMb: 16, callsPerMinute: 120 });
	});
	it.each([{ id: "Bad Id" }, { id: "a", version: "x" }, { id: "a", version: "1.0.0", hooks: ["onEverything"] }])(
		"rejects %j",
		(bad) => expect(() => manifestSchema.parse({ version: "1.0.0", ...bad })).toThrow(),
	);
	it("rejects wildcard hosts and non-https-looking hosts with ports/schemes", () => {
		for (const host of ["*", "*.example.com", "https://x.com", "x.com:8080", ""]) {
			expect(() =>
				manifestSchema.parse({ id: "a", version: "1.0.0", capabilities: { network: [{ host }] } }),
			).toThrow();
		}
	});
});

describe("canReadContent", () => {
	it("only listed collections", () => {
		expect(canReadContent(manifest, "posts")).toBe(true);
		expect(canReadContent(manifest, "pages")).toBe(false);
	});
});

describe("canFetch", () => {
	it("allows exact host, method and path prefix over https", () => {
		expect(canFetch(manifest, "https://search.example.com/v1/index", "POST")).toBe(true);
	});
	it.each([
		["https://search.example.com/v1/index", "GET"],
		["https://search.example.com/admin", "POST"],
		["https://evil.com/v1/", "POST"],
		["http://search.example.com/v1/", "POST"],
		["https://search.example.com.evil.com/v1/", "POST"],
		["https://user:pw@search.example.com/v1/", "POST"],
		["https://search.example.com/v1/../admin", "POST"],
		["not a url", "POST"],
	])("denies %s %s", (url, method) => expect(canFetch(manifest, url, method)).toBe(false));
});

describe("capabilityHash", () => {
	const base = { id: "a", version: "1.0.0", capabilities: { content: { read: ["posts"] } } };
	it("is stable for plugins approved before write/secrets/email existed", () => {
		// The hash an earlier release printed: sha256 of the canonical {content:{read},network}.
		const legacy = createHash("sha256").update('{"content":{"read":["posts"]},"network":[]}').digest("hex");
		expect(capabilityHash(base)).toBe(legacy);
		expect(capabilityHash({ ...base, version: "9.9.9", hooks: ["onContentUpdated"] })).toBe(legacy);
	});
	it("changes when any capability is added", () => {
		const hash = capabilityHash(base);
		const withCap = (capabilities: object) =>
			capabilityHash({ ...base, capabilities: { ...base.capabilities, ...capabilities } });
		expect(withCap({ content: { read: ["posts"], write: ["posts"] } })).not.toBe(hash);
		expect(withCap({ secrets: ["API_KEY"] })).not.toBe(hash);
		expect(withCap({ email: true })).not.toBe(hash);
		expect(withCap({ network: [{ host: "a.example.com" }] })).not.toBe(hash);
	});
	it("a before-hook needs a new approval; an after-hook does not", () => {
		const hash = capabilityHash(base);
		expect(capabilityHash({ ...base, hooks: ["onCommentCreated", "onMediaUploaded"] })).toBe(hash);
		const filtered = capabilityHash({ ...base, hooks: ["beforeContentSave"] });
		expect(filtered).not.toBe(hash);
		expect(capabilityHash({ ...base, hooks: ["beforeContentSave", "beforeMediaUpload"] })).not.toBe(filtered);
	});
});

describe("write, secret and settings helpers", () => {
	const m = manifestSchema.parse({
		id: "a",
		version: "1.0.0",
		capabilities: { content: { write: ["posts"] }, secrets: ["API_KEY"] },
		settings: [
			{ key: "greeting", label: "Greeting", default: "hi" },
			{ key: "enabled", label: "On", type: "boolean" },
			{ key: "limit", label: "Limit", type: "number", default: 5 },
		],
	});
	it("only listed collections and secrets", () => {
		expect(canWriteContent(m, "posts")).toBe(true);
		expect(canWriteContent(m, "pages")).toBe(false);
		expect(canReadSecret(m, "API_KEY")).toBe(true);
		expect(canReadSecret(m, "OTHER")).toBe(false);
	});
	it("fills defaults and drops values of the wrong type or unknown keys", () => {
		expect(resolveSettings(m, { greeting: 5, enabled: true, evil: "x" })).toEqual({
			greeting: "hi",
			enabled: true,
			limit: 5,
		});
	});
});
