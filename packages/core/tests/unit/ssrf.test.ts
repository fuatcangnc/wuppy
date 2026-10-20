import { describe, expect, it } from "vitest";
import { redact } from "../../src/security/redact.ts";
import { assertPublicUrl, isPrivateAddress, UnsafeUrlError } from "../../src/security/ssrf.ts";

describe("isPrivateAddress", () => {
	it.each([
		"127.0.0.1",
		"10.1.2.3",
		"172.16.0.1",
		"192.168.1.1",
		"169.254.169.254",
		"100.64.0.1",
		"0.0.0.0",
		"::1",
		"fd00::1",
		"fe80::1",
		"::ffff:127.0.0.1",
	])("%s is private", (ip) => expect(isPrivateAddress(ip)).toBe(true));
	it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111"])("%s is public", (ip) =>
		expect(isPrivateAddress(ip)).toBe(false),
	);
});

const dns = (map: Record<string, string[]>) => async (h: string) => map[h] ?? [];

describe("assertPublicUrl", () => {
	it("accepts hosts that resolve to public addresses only", async () => {
		await expect(
			assertPublicUrl("https://example.com/x", dns({ "example.com": ["93.184.216.34"] })),
		).resolves.toBeInstanceOf(URL);
		await expect(
			assertPublicUrl("https://evil.test", dns({ "evil.test": ["93.184.216.34", "10.0.0.5"] })),
		).rejects.toThrow(UnsafeUrlError);
	});
	it("rejects literals, odd schemes, credentials and unresolvable hosts", async () => {
		for (const url of [
			"http://127.0.0.1/",
			"http://[::1]/",
			"http://169.254.169.254/latest",
			"file:///etc/passwd",
			"ftp://a.com",
			"https://u:p@a.com",
			"not a url",
			"https://nowhere.test",
		]) {
			await expect(assertPublicUrl(url, dns({}))).rejects.toThrow(UnsafeUrlError);
		}
	});
});

describe("redact", () => {
	it("masks bearer tokens, key=value credentials, Resend keys and the app secret", () => {
		const out = redact(
			"Authorization: Bearer abc.def-123 secret=hunter22 key re_abcdefghij12345 and s3cr3t-value-1234",
			["s3cr3t-value-1234"],
		);
		expect(out).not.toMatch(/abc\.def|hunter22|re_abcdefghij|s3cr3t-value/);
		expect(out).toContain("[redacted]");
	});
	it("leaves ordinary text alone", () => expect(redact("saved posts/hello", [])).toBe("saved posts/hello"));
});
