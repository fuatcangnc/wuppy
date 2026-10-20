import { useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiData } from "../../lib/api.ts";
import { Card, CardHeader, ErrorText, PageHeader, Spinner } from "../../ui/index.tsx";

/** A page a plugin contributes to the admin. The server sanitizes the HTML before it gets here. */
export function PluginPage() {
	const { id, index } = useParams({ from: "/p/$id/$index" });
	const [page, setPage] = useState<{ label: string; html: string } | null>(null);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		setPage(null);
		setError(null);
		void apiData<{ label: string; html: string }>("GET", `/api/plugin-admin/${id}/page/${index}`)
			.then(setPage)
			.catch((e: Error) => setError(e.message));
	}, [id, index]);
	return (
		<div className="grid gap-4">
			<PageHeader title={page?.label ?? "Plugin page"} description={`From plugin ${id}`} />
			<ErrorText>{error}</ErrorText>
			{!page && !error ? (
				<Spinner />
			) : (
				page && (
					<Card>
						<CardHeader title={page.label} />
						<div className="prose p-4" dangerouslySetInnerHTML={{ __html: page.html }} />
					</Card>
				)
			)}
		</div>
	);
}
