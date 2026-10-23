/** A Pages entry that stands for a theme `.astro` page names its file in `template` (`src/pages/index.astro`). */
export const templateOf = (data: Record<string, unknown>): string | undefined =>
	typeof data.template === "string" ? data.template : undefined;

/** The URL a theme page file serves: `src/pages/tags/index.astro` → `/tags`. Mirrors core's themes/site.ts. */
export const templateUrl = (template: string): string =>
	"/" +
	template
		.replace(/^src\/pages\//, "")
		.replace(/\.astro$/, "")
		.replace(/(^|\/)index$/, "");
