import { describe, expect, it } from "vitest";
import { hreflangAlternates, localeSwitcher, resolveLocale, translationStatus } from "../../src/i18n/index.ts";

describe("translationStatus", () => {
	const locales = ["en", "tr", "de"];

	it("groups slugs by their path after the locale prefix and marks gaps", () => {
		const rows = translationStatus(["en/hello", "tr/hello", "en/only-english", "de/hello"], locales);
		expect(rows).toEqual([
			{ key: "hello", translations: { en: "en/hello", tr: "tr/hello", de: "de/hello" }, missing: [], stale: [] },
			{ key: "only-english", translations: { en: "en/only-english" }, missing: ["tr", "de"], stale: [] },
		]);
	});

	it("ignores slugs without a known locale prefix", () => {
		expect(translationStatus(["about", "fr/hello"], locales)).toEqual([]);
	});

	it("handles nested keys", () => {
		const [row] = translationStatus(["en/docs/intro"], ["en", "tr"]);
		expect(row).toMatchObject({ key: "docs/intro", missing: ["tr"] });
	});

	it("flags translations older than the source-language entry", () => {
		const modified = {
			"en/a": "2026-02-01T00:00:00Z",
			"tr/a": "2026-01-01T00:00:00Z",
			"de/a": "2026-03-01T00:00:00Z",
		};
		const [row] = translationStatus(["en/a", "tr/a", "de/a"], locales, modified);
		expect(row?.stale).toEqual(["tr"]);
		expect(translationStatus(["en/a", "tr/a"], locales)[0]?.stale).toEqual([]);
	});
});

describe("locale switching", () => {
	const locales = ["en", "tr", "de"];
	const existing = ["en/hello", "tr/hello", "en/only"];

	it("links each locale to its translation and falls back to the default language", () => {
		expect(localeSwitcher("en/hello", existing, locales)).toEqual([
			{ locale: "en", slug: "en/hello", fallback: false },
			{ locale: "tr", slug: "tr/hello", fallback: false },
			{ locale: "de", slug: "en/hello", fallback: true },
		]);
		expect(localeSwitcher("en/only", existing, locales).map((l) => l.fallback)).toEqual([false, true, true]);
		expect(localeSwitcher("about", existing, locales)).toEqual([]);
	});

	it("resolves the wanted language, then the default, then nothing", () => {
		expect(resolveLocale("hello", "tr", existing, locales)).toEqual({
			slug: "tr/hello",
			locale: "tr",
			fallback: false,
		});
		expect(resolveLocale("only", "de", existing, locales)).toEqual({ slug: "en/only", locale: "en", fallback: true });
		expect(resolveLocale("gone", "tr", existing, locales)).toBeNull();
	});

	it("hreflang lists real translations and x-default, never fallbacks", () => {
		expect(hreflangAlternates("tr/hello", existing, locales, (s) => `/${s}`)).toEqual({
			en: "/en/hello",
			tr: "/tr/hello",
			"x-default": "/en/hello",
		});
		expect(hreflangAlternates("en/only", existing, locales, (s) => `/${s}`)).toEqual({
			en: "/en/only",
			"x-default": "/en/only",
		});
	});
});
