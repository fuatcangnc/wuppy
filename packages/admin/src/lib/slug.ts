import slugify from "slugify";

/** Turns a human title into a safe, lowercase slug. Returns "" when no slug-safe text remains. */
export function slugifyTitle(title: string): string {
	return slugify(title.replace(/['’`]/g, "").replace(/&/g, " ").replace(/_/g, " "), {
		replacement: "-",
		lower: true,
		strict: true,
		trim: true,
	})
		.slice(0, 80)
		.replace(/-+$/g, "");
}
