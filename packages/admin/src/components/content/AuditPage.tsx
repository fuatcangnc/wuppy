import { useEffect, useState } from "react";
import { apiData } from "../../lib/api.ts";
import { ErrorText, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/index.tsx";

interface AuditEvent {
	at: string;
	type: string;
	ok: boolean;
	actor?: string;
	email?: string;
}

export function AuditPage() {
	const [events, setEvents] = useState<AuditEvent[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		void apiData<AuditEvent[]>("GET", "/api/audit?limit=200")
			.then(setEvents)
			.catch((e: Error) => setError(e.message));
	}, []);

	if (error) return <ErrorText>{error}</ErrorText>;
	if (!events) return <p className="text-muted-foreground">Loading…</p>;
	return (
		<section className="grid gap-3">
			<h1 className="text-xl font-semibold">Security log</h1>
			<Table>
				<TableHeader>
					<TableRow>
						{["When", "Event", "Result", "Who"].map((h) => (
							<TableHead key={h}>{h}</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{events.map((e, i) => (
						<TableRow key={`${e.at}-${i}`}>
							<TableCell>{new Date(e.at).toLocaleString()}</TableCell>
							<TableCell>{e.type}</TableCell>
							<TableCell className={e.ok ? "" : "text-destructive"}>{e.ok ? "OK" : "Failed"}</TableCell>
							<TableCell>{e.email ?? e.actor ?? ""}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</section>
	);
}
