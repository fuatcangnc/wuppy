import { describe, expect, it } from "vitest";
import { open, seal } from "../../src/security/secret-box.ts";

const secret = "s".repeat(40);

describe("secret box", () => {
	it("round-trips and never contains the plaintext", () => {
		const box = seal(secret, "wuppy_token", "site-1");
		expect(box).not.toContain("wuppy_token");
		expect(open(secret, box, "site-1")).toBe("wuppy_token");
		expect(seal(secret, "wuppy_token", "site-1")).not.toBe(box);
	});

	it("fails closed on another owner, another secret or tampering", () => {
		const box = seal(secret, "wuppy_token", "site-1");
		expect(open(secret, box, "site-2")).toBeNull();
		expect(open("t".repeat(40), box, "site-1")).toBeNull();
		const parts = box.split(".");
		parts[3] = Buffer.from("other").toString("base64url");
		expect(open(secret, parts.join("."), "site-1")).toBeNull();
		expect(open(secret, "garbage", "site-1")).toBeNull();
	});
});
