const turkish: Record<string, string> = {
	ç: "c",
	Ç: "c",
	ğ: "g",
	Ğ: "g",
	ı: "i",
	İ: "i",
	ö: "o",
	Ö: "o",
	ş: "s",
	Ş: "s",
	ü: "u",
	Ü: "u",
};

/** Turns a human title into a safe, lowercase slug. Returns "" when no slug-safe text remains. */
export function slugifyTitle(title: string): string {
	return title
		.replace(/[çÇğĞıİöÖşŞüÜ]/g, (character) => turkish[character] ?? character)
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/['’`]/g, "")
		.replace(/&/g, " ")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80)
		.replace(/-+$/g, "");
}
