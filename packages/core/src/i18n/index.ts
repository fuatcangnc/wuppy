export interface TranslationRow {
	key: string;
	translations: Record<string, string>;
	missing: string[];
	/** Locales whose translation was last edited before the source (first locale) changed. */
	stale: string[];
}

/** Convention: the first slug segment is the locale (`en/hello`, `tr/hello`); the rest is the shared key. */
export function translationStatus(
	slugs: string[],
	locales: string[],
	modified: Record<string, string> = {},
): TranslationRow[] {
	const groups = new Map<string, Record<string, string>>();
	for (const slug of slugs) {
		const i = slug.indexOf("/");
		const locale = slug.slice(0, i);
		if (i < 1 || !locales.includes(locale)) continue;
		const key = slug.slice(i + 1);
		groups.set(key, { ...groups.get(key), [locale]: slug });
	}
	return [...groups]
		.map(([key, translations]) => {
			const source = locales[0] && translations[locales[0]] ? modified[translations[locales[0]]!] : undefined;
			return {
				key,
				translations,
				missing: locales.filter((l) => !translations[l]),
				stale: source
					? locales.slice(1).filter((l) => {
							const at = translations[l] ? modified[translations[l]!] : undefined;
							return at !== undefined && at < source;
						})
					: [],
			};
		})
		.toSorted((a, b) => a.key.localeCompare(b.key));
}

/** `en/hello` -> `{ locale: "en", key: "hello" }`; null when the first segment is not a configured locale. */
export function splitLocale(slug: string, locales: readonly string[]): { locale: string; key: string } | null {
	const i = slug.indexOf("/");
	const locale = slug.slice(0, i);
	return i > 0 && locales.includes(locale) ? { locale, key: slug.slice(i + 1) } : null;
}

/** The entry to show for `key` in `wanted`; falls back to the default (first) locale, flagged. Null when neither exists. */
export function resolveLocale(
	key: string,
	wanted: string,
	existing: readonly string[],
	locales: readonly string[],
): { slug: string; locale: string; fallback: boolean } | null {
	for (const [locale, fallback] of [
		[wanted, false],
		[locales[0], true],
	] as const) {
		const slug = locale && `${locale}/${key}`;
		if (slug && existing.includes(slug)) return { slug, locale, fallback: fallback && locale !== wanted };
	}
	return null;
}

export interface LocaleLink {
	locale: string;
	/** Entry slug to link to, or null when the key has no entry in any language that applies. */
	slug: string | null;
	/** True when this locale has no translation and the link points at the default language. */
	fallback: boolean;
}

/** Language switcher data for the entry `slug`: one link per locale, falling back to the default language. */
export function localeSwitcher(slug: string, existing: readonly string[], locales: readonly string[]): LocaleLink[] {
	const parts = splitLocale(slug, locales);
	if (!parts) return [];
	return locales.map((locale) => {
		const hit = resolveLocale(parts.key, locale, existing, locales);
		return { locale, slug: hit?.slug ?? null, fallback: hit?.fallback ?? false };
	});
}

/** `hreflang` map for `buildSeo`: real translations only, plus `x-default` for the default language. */
export function hreflangAlternates(
	slug: string,
	existing: readonly string[],
	locales: readonly string[],
	pathOf: (slug: string) => string,
): Record<string, string> {
	const parts = splitLocale(slug, locales);
	if (!parts) return {};
	const out: Record<string, string> = {};
	for (const locale of locales) {
		const translated = `${locale}/${parts.key}`;
		if (existing.includes(translated)) out[locale] = pathOf(translated);
	}
	const base = locales[0] && out[locales[0]];
	return base ? { ...out, "x-default": base } : out;
}
