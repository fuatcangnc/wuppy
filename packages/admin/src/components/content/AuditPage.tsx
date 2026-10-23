import { useEffect, useState } from "react";
import { apiData } from "../../lib/api.ts";
import {
	DataPagination,
	ErrorText,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../../ui/index.tsx";

interface AuditEvent {
	at: string;
	type: string;
	ok: boolean;
	actor?: string;
	email?: string;
	detail?: string;
}

export function AuditPage() {
	const [events, setEvents] = useState<AuditEvent[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	useEffect(() => {
		void apiData<AuditEvent[]>("GET", "/api/audit?limit=200")
			.then(setEvents)
			.catch((e: Error) => setError(e.message));
	}, []);
	const pageCount = Math.max(1, Math.ceil((events?.length ?? 0) / pageSize));
	useEffect(() => {
		if (page > pageCount) setPage(pageCount);
	}, [page, pageCount]);

	if (error) return <ErrorText>{error}</ErrorText>;
	if (!events) return <p className="text-muted-foreground">Loading…</p>;
	const currentPage = Math.min(page, pageCount);
	const visible = events.slice((currentPage - 1) * pageSize, currentPage * pageSize);
	return (
		<section className="grid gap-3">
			<h1 className="text-xl font-semibold">Security log</h1>
			<div className="overflow-hidden rounded-lg border border-border bg-card">
				<Table>
					<TableHeader>
						<TableRow>
							{["When", "Event", "Result", "Who"].map((h) => (
								<TableHead key={h}>{h}</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{visible.map((e, i) => (
							<TableRow key={`${e.at}-${i}`}>
								<TableCell>{new Date(e.at).toLocaleString()}</TableCell>
								<TableCell>
									{e.type}
									{e.detail && <span className="block text-xs text-muted-foreground">{e.detail}</span>}
								</TableCell>
								<TableCell className={e.ok ? "" : "text-destructive"}>{e.ok ? "OK" : "Failed"}</TableCell>
								<TableCell>{e.email ?? e.actor ?? ""}</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
				{events.length > 0 && (
					<DataPagination
						page={currentPage}
						pageCount={pageCount}
						pageSize={pageSize}
						total={events.length}
						onPageChange={setPage}
						onPageSizeChange={(nextSize) => {
							setPageSize(nextSize);
							setPage(1);
						}}
					/>
				)}
			</div>
		</section>
	);
}
