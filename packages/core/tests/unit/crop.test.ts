import { describe, expect, it } from "vitest";
import { cropBox, parseVariant } from "../../src/media/optimize.ts";
import { imageSrcset } from "../../src/site/index.ts";

describe("cropBox", () => {
	it("takes the largest box of the shape, centred by default", () => {
		expect(cropBox(1200, 600, "1:1")).toEqual({ width: 600, height: 600, left: 300, top: 0 });
		expect(cropBox(1200, 600, "16:9")).toEqual({ width: 1067, height: 600, left: 67, top: 0 });
		expect(cropBox(600, 1200, "1:1")).toEqual({ width: 600, height: 600, left: 0, top: 300 });
	});
	it("follows the focal point and stops at the edges", () => {
		expect(cropBox(1200, 600, "1:1", 0, 50).left).toBe(0);
		expect(cropBox(1200, 600, "1:1", 100, 50).left).toBe(600);
		expect(cropBox(1200, 600, "1:1", 75, 50).left).toBe(600);
		expect(cropBox(1200, 600, "1:1", 25, 50).left).toBe(0);
		expect(cropBox(1200, 600, "1:1", 50, 50).left).toBe(300);
	});
	it("never exceeds the image, even for an extreme shape", () => {
		const box = cropBox(100, 100, "9:16");
		expect(box.width).toBeLessThanOrEqual(100);
		expect(box.height).toBeLessThanOrEqual(100);
		expect(box.left + box.width).toBeLessThanOrEqual(100);
	});
});

const parse = (q: string) => parseVariant(new URLSearchParams(q));

describe("parseVariant with crops", () => {
	it("accepts allowlisted ratios and focal points", () => {
		expect(parse("ar=16:9&w=640&fx=30&fy=70")).toEqual({ width: 640, ratio: "16:9", focalX: 30, focalY: 70 });
		expect(parse("ar=1:1")).toEqual({ ratio: "1:1" });
	});
	it("rejects other ratios and out-of-range or non-numeric focal points", () => {
		for (const q of ["ar=7:3", "ar=16:9&fx=101", "ar=16:9&fy=-1", "ar=16:9&fx=abc", "ar=16:9&fx=1.5"])
			expect(parse(q)).toBe("invalid");
	});
	it("ignores focal points without a ratio", () => {
		expect(parse("w=640&fx=30")).toEqual({ width: 640 });
	});
});

describe("imageSrcset with a crop", () => {
	it("adds the ratio and focal point to every candidate", () => {
		expect(imageSrcset("/uploads/a.png", [480], "webp", { ratio: "16:9", focalX: 20, focalY: 60 })).toBe(
			"/uploads/a.png?w=480&format=webp&ar=16:9&fx=20&fy=60 480w",
		);
	});
});
