import { describe, expect, it } from "vitest";
import { collectionOfKind, kindOf } from "../src/stores/content.ts";

describe("collection kind", () => {
	it("maps a theme's collections to Posts and Pages", () => {
		const list = [
			{ name: "blog", dir: "src/content/blog", format: "mdx" as const, kind: "posts" as const, fields: {} },
			{ name: "about", dir: "src/content/about", format: "md" as const, kind: "pages" as const, fields: {} },
			{ name: "docs", dir: "src/content/docs", format: "mdx" as const, fields: {} },
		];
		expect(collectionOfKind(list, "posts")).toBe("blog");
		expect(collectionOfKind(list, "pages")).toBe("about");
		expect(kindOf(list[2]!)).toBeUndefined();
		expect(kindOf({ name: "pages", dir: "content/pages", format: "mdx" as const, fields: {} })).toBe("pages");
	});
});
