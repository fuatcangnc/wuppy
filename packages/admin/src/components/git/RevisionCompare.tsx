export interface FieldChange {
	field: string;
	before?: unknown;
	after?: unknown;
	kind: "added" | "removed" | "changed";
}

const show = (v: unknown) => (v === undefined ? "—" : typeof v === "string" ? v : JSON.stringify(v));

/** Side by side: the chosen version on the left, what is saved now on the right, one row per changed field. */
export function RevisionCompare({ changes }: { changes: FieldChange[] }) {
	if (changes.length === 0) return <p className="text-sm text-muted-foreground">Identical to the current version.</p>;
	return (
		<table className="w-full table-fixed border-collapse text-xs" aria-label="Compare versions">
			<thead>
				<tr className="text-start text-muted-foreground">
					<th scope="col" className="w-20 p-1 text-start">
						Field
					</th>
					<th scope="col" className="p-1 text-start">
						That version
					</th>
					<th scope="col" className="p-1 text-start">
						Now
					</th>
				</tr>
			</thead>
			<tbody>
				{changes.map((c) => (
					<tr key={c.field} className="border-t border-border align-top">
						<th scope="row" className="p-1 text-start font-medium">
							{c.field}
							<span className="block font-normal text-muted-foreground">
								{c.kind === "changed" ? "changed" : `${c.kind} since`}
							</span>
						</th>
						<td className="whitespace-pre-wrap break-words bg-destructive/10 p-1">{show(c.before)}</td>
						<td className="whitespace-pre-wrap break-words bg-primary/10 p-1">{show(c.after)}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
