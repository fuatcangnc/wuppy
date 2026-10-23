import { readdir } from "node:fs/promises";
import { join } from "node:path";

/** An Astro component a theme (or the site) makes available to MDX content. */
export interface ThemeComponent {
	/** PascalCase tag used in MDX. */
	name: string;
	/** Repo-relative path, for the code workspace and the component catalog. */
	path: string;
}

const NAME = /^[A-Z][A-Za-z0-9]*$/;

/**
 * Components under `src/components` (recursively). They are design code, not content: the active theme's components are
 * trusted, so they are added to the MDX allowlist automatically. Nested folders are flattened by filename; a duplicate
 * name keeps the first path so two components can never silently shadow each other in the map.
 */
export async function listThemeComponents(root: string): Promise<ThemeComponent[]> {
	const base = join(root, "src", "components");
	const names = await readdir(base, { recursive: true }).catch(() => [] as string[]);
	const found = names
		.map((name) => name.split("\\").join("/"))
		.filter((name) => name.endsWith(".astro") && !name.split("/").some((part) => part.startsWith("_")))
		.toSorted();
	const out: ThemeComponent[] = [];
	const seen = new Set<string>();
	for (const relative of found) {
		const name = relative
			.split("/")
			.pop()!
			.replace(/\.astro$/, "");
		if (!NAME.test(name) || seen.has(name)) continue;
		seen.add(name);
		out.push({ name, path: `src/components/${relative}` });
	}
	return out;
}

/** The component tag names from one or more roots, in the order the roots are given. */
export async function themeComponentNames(...roots: string[]): Promise<string[]> {
	const names: string[] = [];
	const seen = new Set<string>();
	for (const root of roots) {
		for (const component of await listThemeComponents(root)) {
			if (seen.has(component.name)) continue;
			seen.add(component.name);
			names.push(component.name);
		}
	}
	return names;
}
