import { describe, expect, it } from "vitest";
import { assertSafeSlug } from "../../src/content/validation/path.ts";

describe("assertSafeSlug", () => {
	it("accepts nested slugs", () => expect(assertSafeSlug("blog/hello-world")).toBe("blog/hello-world"));
	it.each(["../x", "a/../../x", "/etc/passwd", "a\\b", "a\0b", "", ".hidden", "a//b"])("rejects %j", (s) => {
		expect(() => assertSafeSlug(s)).toThrow();
	});
});
