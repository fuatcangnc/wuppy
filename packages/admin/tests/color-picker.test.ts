import { describe, expect, it } from "vitest";
import { hexToHsv, hsvToHex } from "../src/components/visual-editor/ColorPicker.tsx";

describe("colour picker conversions", () => {
	it("round-trips hex through hue, saturation and value", () => {
		for (const hex of ["#000000", "#ffffff", "#c74848", "#1e90ff", "#22c55e", "#7c3aed"])
			expect(hsvToHex(...hexToHsv(hex)!)).toBe(hex);
		expect(hexToHsv("#ff0000")).toEqual([0, 1, 1]);
		expect(hexToHsv("red")).toBeNull();
	});
});
