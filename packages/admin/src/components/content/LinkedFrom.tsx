import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiData } from "../../lib/api.ts";
import { Card, CardHeader } from "../../ui/index.tsx";

interface Linked {
	relation: string;
	label: string;
	collection: string;
	entries: Array<{ slug: string; title: string }>;
}

/** The other side of a relation: entries that link to this one (they hold the link, so it is edited there). */
export function LinkedFrom({ collection, slug }: { collection: string; slug: string }) {
	const [rows, setRows] = useState<Linked[]>([]);
	useEffect(() => {
		if (!slug) return;
		void apiData<Linked[]>("GET", `/api/relations/linked/${encodeURIComponent(collection)}/${encodeURIComponent(slug)}`)
			.then(setRows)
			.catch(() => setRows([]));
	}, [collection, slug]);
	const shown = rows.filter((r) => r.entries.length);
	if (!shown.length) return null;
	return (
		<Card>
			<CardHeader title="Linked from" description="Change these links on the linking entry." />
			<div className="grid gap-3 p-4 text-sm">
				{shown.map((r) => (
					<div key={r.relation} className="grid gap-1">
						<p className="font-medium">{r.label}</p>
						<ul className="grid gap-1">
							{r.entries.map((e) => (
								<li key={e.slug}>
									<Link
										to="/e/$collection/$"
										params={{ collection: r.collection, _splat: e.slug }}
										className="text-primary hover:underline"
									>
										{e.title}
									</Link>
								</li>
							))}
						</ul>
					</div>
				))}
			</div>
		</Card>
	);
}
