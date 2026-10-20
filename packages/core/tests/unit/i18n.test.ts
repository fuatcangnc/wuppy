import { describe, expect, it } from "vitest";
import { translationStatus } from "../../src/i18n/index.ts";

describe("translationStatus", () => {
	const locales = ["en", "tr", "de"];

	it("groups slugs by their path after the locale prefix and marks gaps", () => {
		const rows = translationStatus(["en/hello", "tr/hello", "en/only-english", "de/hello"], locales);
		expect(rows).toEqual([
			{ key: "hello", translations: { en: "en/hello", tr: "tr/hello", de: "de/hello" }, missing: [] },
			{ key: "only-english", translations: { en: "en/only-english" }, missing: ["tr", "de"] },
		]);
	});

	it("ignores slugs without a known locale prefix", () => {
		expect(translationStatus(["about", "fr/hello"], locales)).toEqual([]);
	});

	it("handles nested keys", () => {
		const [row] = translationStatus(["en/docs/intro"], ["en", "tr"]);
		expect(row).toMatchObject({ key: "docs/intro", missing: ["tr"] });
	});
});
