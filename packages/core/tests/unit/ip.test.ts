import { describe, expect, it } from "vitest";
import { resolveClientIP, trustedProxiesFromEnv } from "../../src/config/ip.ts";

describe("client IP resolution", () => {
	it("uses the immediate peer and ignores spoofed forwarding by default", () => {
		expect(resolveClientIP({ peer: "203.0.113.10", forwarded: "198.51.100.99" })).toBe("203.0.113.10");
	});

	it("walks a trusted proxy chain from the right", () => {
		expect(
			resolveClientIP({
				peer: "10.0.0.2",
				forwarded: "198.51.100.23, 10.0.0.1",
				trustedProxies: ["10.0.0.0/8"],
			}),
		).toBe("198.51.100.23");
	});

	it("does not trust a forwarded chain from an untrusted peer", () => {
		expect(
			resolveClientIP({
				peer: "203.0.113.10",
				forwarded: "198.51.100.23",
				trustedProxies: ["10.0.0.0/8"],
			}),
		).toBe("203.0.113.10");
	});

	it("supports IPv6 peers and exact proxy entries", () => {
		expect(
			resolveClientIP({
				peer: "::1",
				forwarded: "2001:db8::1",
				trustedProxies: ["::1"],
			}),
		).toBe("2001:db8::1");
	});

	it("rejects unusable peers or chains instead of guessing", () => {
		expect(resolveClientIP({ peer: "unknown" })).toBeNull();
		expect(
			resolveClientIP({
				peer: "10.0.0.2",
				forwarded: "not-an-ip",
				trustedProxies: ["10.0.0.2"],
			}),
		).toBe("10.0.0.2");
		expect(
			resolveClientIP({
				peer: "10.0.0.2",
				forwarded: "10.0.0.1",
				trustedProxies: ["10.0.0.0/8"],
			}),
		).toBe("10.0.0.2");
	});

	it("parses the trusted proxy environment list", () => {
		expect(trustedProxiesFromEnv({ WUPPY_TRUSTED_PROXIES: " 10.0.0.2, 192.0.2.0/24 ,, " })).toEqual([
			"10.0.0.2",
			"192.0.2.0/24",
		]);
	});
});
