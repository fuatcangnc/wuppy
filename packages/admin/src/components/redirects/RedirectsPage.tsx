import { useEffect, useState } from "react";
import { apiData } from "../../lib/api.ts";
import {
	Badge,
	Button,
	Card,
	CardHeader,
	Dialog,
	EmptyState,
	ErrorText,
	Input,
	PageHeader,
	Select,
	Table,
	Td,
	Th,
	toast,
} from "../../ui/index.tsx";

interface Rule {
	from: string;
	to: string;
	status: 301 | 302;
	match?: "exact" | "wildcard" | "regex";
	enabled?: boolean;
	note?: string;
}
interface NotFound {
	path: string;
	count: number;
	lastSeen: string;
}

export function RedirectsPage() {
	const [rules, setRules] = useState<Rule[]>([]);
	const [missing, setMissing] = useState<NotFound[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [draft, setDraft] = useState<Rule>({ from: "/", to: "/", status: 301 });
	const [open, setOpen] = useState(false);
	const [importText, setImportText] = useState("");
	const [replace, setReplace] = useState(false);

	const load = async () => {
		try {
			setRules(await apiData<Rule[]>("GET", "/api/redirects"));
			setMissing(await apiData<NotFound[]>("GET", "/api/redirects/404"));
		} catch (e) {
			setError((e as Error).message);
		}
	};
	useEffect(() => void load(), []);

	const save = async (next: Rule[]) => {
		setError(null);
		try {
			setRules(await apiData<Rule[]>("PUT", "/api/redirects", { data: next }));
			toast("Redirects saved");
		} catch (e) {
			setError((e as Error).message);
		}
	};

	return (
		<div className="grid gap-4">
			<PageHeader
				title="Redirects"
				description="Keep old URLs working and learn which paths 404."
				actions={<Button onClick={() => setOpen(true)}>+ Add redirect</Button>}
			/>
			<ErrorText>{error}</ErrorText>

			<Card>
				<CardHeader title="Rules" description="Exact path matches. Loops and duplicates are rejected." />
				{rules.length === 0 ? (
					<div className="p-4">
						<EmptyState title="No redirects" description="Add a rule or create one from a 404 below." />
					</div>
				) : (
					<Table>
						<thead>
							<tr>
								<Th>From</Th>
								<Th>To</Th>
								<Th>Type</Th>
								<Th />
							</tr>
						</thead>
						<tbody>
							{rules.map((rule, index) => (
								<tr key={`${rule.from}:${index}`}>
									<Td className="font-mono text-xs">{rule.from}</Td>
									<Td className="font-mono text-xs">{rule.to}</Td>
									<Td>
										<Badge tone={rule.status === 301 ? "accent" : "neutral"}>{rule.status}</Badge>
									</Td>
									<Td className="text-end">
										<Button size="sm" variant="ghost" onClick={() => void save(rules.filter((_, i) => i !== index))}>
											Delete
										</Button>
									</Td>
								</tr>
							))}
						</tbody>
					</Table>
				)}
			</Card>

			<Card>
				<CardHeader
					title="404 log"
					description="Recently requested paths that matched nothing."
					actions={
						missing.length > 0 && (
							<Button
								size="sm"
								variant="secondary"
								onClick={() => void apiData("DELETE", "/api/redirects/404").then(load)}
							>
								Clear
							</Button>
						)
					}
				/>
				{missing.length === 0 ? (
					<div className="p-4">
						<EmptyState title="No 404s recorded" />
					</div>
				) : (
					<Table>
						<thead>
							<tr>
								<Th>Path</Th>
								<Th>Hits</Th>
								<Th>Last seen</Th>
								<Th />
							</tr>
						</thead>
						<tbody>
							{missing.map((row) => (
								<tr key={row.path}>
									<Td className="font-mono text-xs">{row.path}</Td>
									<Td>{row.count}</Td>
									<Td className="text-muted-foreground">{new Date(row.lastSeen).toLocaleString()}</Td>
									<Td className="text-end">
										<Button
											size="sm"
											variant="ghost"
											onClick={() => {
												setDraft({ from: row.path, to: "/", status: 301 });
												setOpen(true);
											}}
										>
											Redirect
										</Button>
									</Td>
								</tr>
							))}
						</tbody>
					</Table>
				)}
			</Card>

			<Card>
				<CardHeader title="Import / export" description="CSV columns: from, to, status, match, enabled, note." />
				<div className="grid gap-3 p-4">
					<div className="flex gap-3 text-sm">
						<a className="text-primary underline" href="/api/redirects/export?format=csv" download>
							Download CSV
						</a>
						<a className="text-primary underline" href="/api/redirects/export" download="redirects.json">
							Download JSON
						</a>
					</div>
					<label className="grid gap-1 text-sm">
						Paste CSV
						<textarea
							className="min-h-24 rounded-ui border border-border bg-transparent p-2 font-mono text-xs"
							value={importText}
							onChange={(e) => setImportText(e.target.value)}
						/>
					</label>
					<label className="flex items-center gap-2 text-sm">
						<input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
						Replace all saved redirects
					</label>
					<div>
						<Button
							variant="secondary"
							disabled={!importText.trim()}
							onClick={() =>
								void apiData<{ imported: number }>("POST", "/api/redirects/import", {
									format: "csv",
									text: importText,
									mode: replace ? "replace" : "merge",
								})
									.then((r) => {
										toast(`Imported ${r.imported} redirects`);
										setImportText("");
										return load();
									})
									.catch((e: Error) => setError(e.message))
							}
						>
							Import
						</Button>
					</div>
				</div>
			</Card>
			<Dialog
				open={open}
				title="Add redirect"
				onClose={() => setOpen(false)}
				footer={
					<>
						<Button variant="ghost" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button
							onClick={() => {
								void save([...rules, draft]).then(() => setOpen(false));
							}}
						>
							Save
						</Button>
					</>
				}
			>
				<div className="grid gap-3">
					<Input label="From" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
					<Input label="To" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
					<Select
						label="Match"
						value={draft.match ?? "exact"}
						onChange={(e) => setDraft({ ...draft, match: e.target.value as Rule["match"] })}
						hint="Wildcard: /blog/* → /posts/$1. Regex: capture groups become $1…"
					>
						<option value="exact">Exact path</option>
						<option value="wildcard">Wildcard (/prefix/*)</option>
						<option value="regex">Regular expression</option>
					</Select>
					<Input
						label="Note"
						value={draft.note ?? ""}
						onChange={(e) => setDraft({ ...draft, note: e.target.value || undefined })}
					/>
					<Select
						label="Type"
						value={String(draft.status)}
						onChange={(e) => setDraft({ ...draft, status: Number(e.target.value) as 301 | 302 })}
					>
						<option value="301">301 Permanent</option>
						<option value="302">302 Temporary</option>
					</Select>
				</div>
			</Dialog>
		</div>
	);
}
