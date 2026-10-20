import { describe, expect, it } from "vitest";
import { imageSrcset, paginate, readingTime, related } from "../../src/site/index.ts";

describe("readingTime", () => {
	it("rounds up and never returns less than one minute", () => {
		expect(readingTime("")).toBe(1);
		expect(readingTime("word ".repeat(200))).toBe(1);
		expect(readingTime("word ".repeat(201))).toBe(2);
		expect(readingTime("Merhaba dünya, güzel bir gün")).toBe(1);
	});
});

describe("paginate", () => {
	const all = Array.from({ length: 25 }, (_, i) => i + 1);
	it("slices and links neighbouring pages", () => {
		expect(paginate(all, 2, 10)).toEqual({
			items: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
			page: 2,
			pages: 3,
			prev: 1,
			next: 3,
		});
		expect(paginate(all, 3, 10).items).toEqual([21, 22, 23, 24, 25]);
		expect(paginate(all, 3, 10).next).toBeNull();
	});
	it("clamps bad input", () => {
		expect(paginate(all, "abc", 10).page).toBe(1);
		expect(paginate(all, 99, 10).page).toBe(3);
		expect(paginate(all, -4, 10).page).toBe(1);
		expect(paginate([], 1)).toMatchObject({ items: [], pages: 1, prev: null, next: null });
	});
});

const e = (id: string, tags: string[]) => ({ id, data: { tags } });

describe("related", () => {
	it("ranks by shared values, excludes itself and unrelated entries", () => {
		const a = e("a", ["x", "y"]);
		const list = [a, e("b", ["x"]), e("c", ["x", "y"]), e("d", ["z"]), e("e", [])];
		expect(related(a, list, "tags").map((x) => x.id)).toEqual(["c", "b"]);
		expect(related(a, list, "tags", 1)).toHaveLength(1);
	});
});

describe("imageSrcset", () => {
	it("builds one entry per width", () => {
		expect(imageSrcset("/uploads/a.png", [480, 1024])).toBe(
			"/uploads/a.png?w=480&format=webp 480w, /uploads/a.png?w=1024&format=webp 1024w",
		);
	});
});
