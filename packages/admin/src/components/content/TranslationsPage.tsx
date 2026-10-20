import { Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "../../lib/api.ts";
import { newEntry } from "../../stores/editor.ts";
import { ErrorText } from "../../ui/index.tsx";
import { TranslationTable, type TranslationRow } from "./TranslationTable.tsx";

export function TranslationsPage() {
	const { collection } = useParams({ from: "/t/$collection" });
	const [state, setState] = useState<{ rows: TranslationRow[]; locales: string[] } | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		void api<{ data: TranslationRow[]; locales: string[] }>("GET", `/api/i18n/${collection}`)
			.then((j) => setState({ rows: j.data, locales: j.locales }))
			.catch((e: Error) => setError(e.message));
	}, [collection]);

	if (error) return <ErrorText>{error}</ErrorText>;
	if (!state) return <p className="text-muted-foreground">Loading…</p>;
	return (
		<section className="grid gap-3">
			<h1 className="text-xl font-semibold">{collection}: translations</h1>
			<TranslationTable
				collection={collection}
				{...state}
				renderLink={(label, slug) => (
					<Link
						to="/e/$collection/$"
						params={{ collection, _splat: slug }}
						onClick={() => {
							if (label.startsWith("Translate")) newEntry(collection, slug);
						}}
						className="text-primary underline"
					>
						{label}
					</Link>
				)}
			/>
		</section>
	);
}
