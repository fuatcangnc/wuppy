import { describe, expect, it } from "vitest";
import {
	classValue,
	parseStyle,
	printStyle,
	readUtility,
	utilityFor,
	variantFor,
	withClassValue,
} from "../src/components/visual-editor/tailwind.ts";

describe("CSS properties as Tailwind 4 classes", () => {
	it("writes utilities, arbitrary values and arbitrary properties", () => {
		expect(utilityFor("align-self", "center")).toBe("self-center");
		expect(utilityFor("display", "none")).toBe("hidden");
		expect(utilityFor("width", "320px")).toBe("w-[320px]");
		expect(utilityFor("width", "full")).toBe("w-full");
		expect(utilityFor("margin-top", "-4")).toBe("-mt-4");
		expect(utilityFor("color", "#ff0000")).toBe("text-[#ff0000]");
		expect(utilityFor("font-size", "14px")).toBe("text-[14px]");
		expect(utilityFor("font-weight", "600")).toBe("font-semibold");
		expect(utilityFor("flex", "0 1 auto")).toBe("flex-[0_1_auto]");
		expect(utilityFor("filter", "blur(4px)")).toBe("[filter:blur(4px)]");
		expect(utilityFor("font-family", "Inter")).toBe("[font-family:Inter]");
		expect(utilityFor("border-width", "1px")).toBe("border");
		expect(utilityFor("background-image", "url(/a.png)")).toBe("bg-[url(/a.png)]");
	});

	it("reads each class back to the property it sets", () => {
		expect(readUtility("text-lg")).toEqual({ prop: "font-size", value: "lg" });
		expect(readUtility("text-red-500")).toEqual({ prop: "color", value: "red-500" });
		expect(readUtility("text-center")).toEqual({ prop: "text-align", value: "center" });
		expect(readUtility("flex")).toEqual({ prop: "display", value: "flex" });
		expect(readUtility("flex-col")).toEqual({ prop: "flex-direction", value: "column" });
		expect(readUtility("flex-1")).toEqual({ prop: "flex", value: "1" });
		expect(readUtility("gap-x-2")).toEqual({ prop: "column-gap", value: "2" });
		expect(readUtility("border-2")).toEqual({ prop: "border-width", value: "2" });
		expect(readUtility("border-red-500")).toEqual({ prop: "border-color", value: "red-500" });
		expect(readUtility("border-t-2")).toBeUndefined();
		expect(readUtility("-mt-4")).toEqual({ prop: "margin-top", value: "-4" });
		expect(readUtility("[filter:blur(4px)]")).toEqual({ prop: "filter", value: "blur(4px)" });
		expect(readUtility("container")).toBeUndefined();
	});

	it("replaces only the property's class under the same variant", () => {
		const classes = ["container", "p-4", "pt-2", "md:pt-8", "text-lg"];
		expect(classValue(classes, "padding-top", "")).toBe("2");
		expect(withClassValue(classes, "padding-top", "", "24px")).toEqual([
			"container",
			"p-4",
			"md:pt-8",
			"text-lg",
			"pt-[24px]",
		]);
		expect(withClassValue(classes, "font-size", "", "")).toEqual(["container", "p-4", "pt-2", "md:pt-8"]);
		const v = variantFor(768, ":hover");
		expect(v).toBe("max-[768px]:hover:");
		expect(classValue([`${v}text-[#fff]`], "color", v)).toBe("#fff");
		expect(variantFor(undefined, ":nth-child(odd)")).toBe("odd:");
	});

	it("keeps inline styles for themes without Tailwind", () => {
		expect(parseStyle("padding-top: 6rem; color:red;junk")).toEqual({ "padding-top": "6rem", color: "red" });
		expect(printStyle({ "padding-top": "6rem", color: "" })).toBe("padding-top: 6rem");
	});
});
