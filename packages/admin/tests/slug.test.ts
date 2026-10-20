import { describe, expect, it } from "vitest";
import { slugifyTitle } from "../src/lib/slug.ts";

describe("slugifyTitle", () => {
	it("normalizes Turkish characters and punctuation", () => {
		expect(slugifyTitle("Merhaba Dünya!")).toBe("merhaba-dunya");
		expect(slugifyTitle("  Çok  Güzel / Bir  Başlık ")).toBe("cok-guzel-bir-baslik");
		expect(slugifyTitle("Iğdır'ın Öğle Şefi")).toBe("igdirin-ogle-sefi");
	});

	it("handles accents, ampersands, and separators", () => {
		expect(slugifyTitle("Café déjà vu")).toBe("cafe-deja-vu");
		expect(slugifyTitle("Rock & Roll")).toBe("rock-roll");
		expect(slugifyTitle("Hello___World")).toBe("hello-world");
	});

	it("returns an empty string when no slug-safe text remains", () => {
		expect(slugifyTitle("!!! ???")).toBe("");
		expect(slugifyTitle("   ")).toBe("");
	});

	it("caps the slug at 80 characters without a trailing separator", () => {
		const slug = slugifyTitle("a ".repeat(100));
		expect(slug.length).toBeLessThanOrEqual(80);
		expect(slug.endsWith("-")).toBe(false);
	});
});
