import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "../../lib/api.ts";
import { newEntry } from "../../stores/editor.ts";
import type { TranslationRow } from "./TranslationTable.tsx";

/** Languages of this entry: jump to a translation, start a missing one, or see which ones fell behind. */
export function TranslatePanel({
	collection,
	slug,
	onLocales,
}: {
	collection: string;
	slug: string;
	onLocales?: (locales: string[]) => void;
}) {
	const [state, setState] = useState<{ rows: TranslationRow[]; locales: string[] } | null>(null);
	useEffect(() => {
		void api<{ data: TranslationRow[]; locales: string[] }>("GET", `/api/i18n/${collection}`)
			.then((j) => {
				setState({ rows: j.data, locales: j.locales });
				onLocales?.(j.locales);
			})
			.catch(() => setState(null));
	}, [collection, slug]);

	const locale = state?.locales.find((l) => slug.startsWith(`${l}/`));
	if (!state || !locale) return null;
	const key = slug.slice(locale.length + 1);
	const row = state.rows.find((r) => r.key === key);

	return (
		<ul className="grid gap-1 p-4 text-sm" aria-label="Translations">
			{state.locales
				.filter((l) => l !== locale)
				.map((l) => {
					const target = row?.translations[l];
					return (
						<li key={l} className="flex items-center justify-between gap-2">
							<span className="font-medium">{l}</span>
							{target ? (
								<span className="flex items-center gap-2">
									{row?.stale?.includes(l) && <span className="text-warning">Out of date</span>}
									<Link
										to="/e/$collection/$"
										params={{ collection, _splat: target }}
										className="text-primary underline"
									>
										Open
									</Link>
								</span>
							) : (
								<Link
									to="/e/$collection/$"
									params={{ collection, _splat: `${l}/${key}` }}
									onClick={() => newEntry(collection, `${l}/${key}`)}
									className="text-primary underline"
								>
									Translate to {l}
								</Link>
							)}
						</li>
					);
				})}
		</ul>
	);
}
