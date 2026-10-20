import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvePasskeyOptions } from "../../src/config/passkey.ts";

afterEach(() => vi.unstubAllEnvs());

describe("passkey relying party", () => {
	it("uses the production hostname and site name", () => {
		vi.stubEnv("WUPPY_PASSKEY_RP_ID", "");
		vi.stubEnv("WUPPY_PASSKEY_ORIGIN", "");
		expect(resolvePasskeyOptions("https://notes.example.com", "Field Notes")).toEqual({
			rpID: "notes.example.com",
			rpName: "Field Notes",
		});
	});

	it("uses localhost for loopback IPs because WebAuthn rejects IP RP IDs", () => {
		vi.stubEnv("WUPPY_PASSKEY_RP_ID", "");
		vi.stubEnv("WUPPY_PASSKEY_ORIGIN", "");
		expect(resolvePasskeyOptions("http://127.0.0.1:4444", "Wuppy")).toEqual({
			rpID: "localhost",
			rpName: "Wuppy",
		});
	});

	it("allows explicit RP and origin overrides for proxies", () => {
		vi.stubEnv("WUPPY_PASSKEY_RP_ID", "login.example.com");
		vi.stubEnv("WUPPY_PASSKEY_ORIGIN", "https://login.example.com, https://admin.example.com");
		expect(resolvePasskeyOptions("http://internal:4321", "Wuppy")).toEqual({
			rpID: "login.example.com",
			rpName: "Wuppy",
			origin: ["https://login.example.com", "https://admin.example.com"],
		});
	});
});
