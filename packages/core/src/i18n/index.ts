export interface TranslationRow {
	key: string;
	translations: Record<string, string>;
	missing: string[];
}

/** Convention: the first slug segment is the locale (`en/hello`, `tr/hello`); the rest is the shared key. */
export function translationStatus(slugs: string[], locales: string[]): TranslationRow[] {
	const groups = new Map<string, Record<string, string>>();
	for (const slug of slugs) {
		const i = slug.indexOf("/");
		const locale = slug.slice(0, i);
		if (i < 1 || !locales.includes(locale)) continue;
		const key = slug.slice(i + 1);
		groups.set(key, { ...groups.get(key), [locale]: slug });
	}
	return [...groups]
		.map(([key, translations]) => ({ key, translations, missing: locales.filter((l) => !translations[l]) }))
		.toSorted((a, b) => a.key.localeCompare(b.key));
}
