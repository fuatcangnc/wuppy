import {
	ArrowRightLeft,
	ChevronLeft,
	ChevronRight,
	Download,
	Plus,
	Search,
	Settings,
	Trash2,
	Upload,
} from "@react-zero-ui/icon-sprite";
import { useEffect, useMemo, useState } from "react";
import { apiData } from "../../lib/api.ts";
import {
	Badge,
	Button,
	Checkbox,
	Dialog,
	EmptyState,
	ErrorText,
	Input,
	Select,
	Textarea,
	toast,
} from "../../ui/index.tsx";
import { WorkspaceLayout, WorkspacePanel, WorkspaceSidebar } from "../shared/WorkspaceLayout.tsx";

export interface Rule {
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

const blankRule = (from = "/"): Rule => ({ from, to: "/", status: 301, match: "exact", enabled: true });

export function RedirectsPage() {
	const [rules, setRules] = useState<Rule[]>([]);
	const [missing, setMissing] = useState<NotFound[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [tab, setTab] = useState<"rules" | "missing">("rules");
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<number | null>(null);
	const [draft, setDraft] = useState<Rule | null>(null);
	const [creating, setCreating] = useState(false);
	const [rulePage, setRulePage] = useState(1);
	const [missingPage, setMissingPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const [selectedMissing, setSelectedMissing] = useState<string | null>(null);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [importText, setImportText] = useState("");
	const [replace, setReplace] = useState(false);

	const load = async () => {
		try {
			setError(null);
			setRules(await apiData<Rule[]>("GET", "/api/redirects"));
			setMissing(await apiData<NotFound[]>("GET", "/api/redirects/404"));
		} catch (failure) {
			setError((failure as Error).message);
		}
	};
	useEffect(() => {
		void load();
	}, []);

	const dirty =
		draft !== null && (creating || selected === null || JSON.stringify(draft) !== JSON.stringify(rules[selected]));
	const filteredRules = useMemo(
		() =>
			rules
				.map((rule, index) => ({ rule, index }))
				.filter(
					({ rule }) =>
						!query.trim() || `${rule.from} ${rule.to} ${rule.note ?? ""}`.toLowerCase().includes(query.toLowerCase()),
				),
		[rules, query],
	);
	const filteredMissing = useMemo(
		() => missing.filter((row) => !query.trim() || row.path.toLowerCase().includes(query.toLowerCase())),
		[missing, query],
	);
	const rulePageCount = Math.max(1, Math.ceil(filteredRules.length / pageSize));
	const currentRulePage = Math.min(rulePage, rulePageCount);
	const visibleRules = filteredRules.slice((currentRulePage - 1) * pageSize, currentRulePage * pageSize);
	const missingPageCount = Math.max(1, Math.ceil(filteredMissing.length / pageSize));
	const currentMissingPage = Math.min(missingPage, missingPageCount);
	const visibleMissing = filteredMissing.slice((currentMissingPage - 1) * pageSize, currentMissingPage * pageSize);
	const selectedMissingRow = missing.find((row) => row.path === selectedMissing) ?? null;

	useEffect(() => {
		if (rulePage > rulePageCount) setRulePage(rulePageCount);
	}, [rulePage, rulePageCount]);
	useEffect(() => {
		if (missingPage > missingPageCount) setMissingPage(missingPageCount);
	}, [missingPage, missingPageCount]);
	useEffect(() => {
		setRulePage(1);
		setMissingPage(1);
	}, [query]);

	const chooseRule = (index: number) => {
		if (selected === index && !creating) return;
		if (dirty && !confirm("Discard unsaved redirect changes?")) return;
		setSelected(index);
		setDraft(structuredClone(rules[index]!));
		setCreating(false);
	};
	const startNew = (from = "/") => {
		if (dirty && !confirm("Discard unsaved redirect changes?")) return;
		setTab("rules");
		setSelected(null);
		setDraft(blankRule(from));
		setCreating(true);
	};
	const saveDraft = async () => {
		if (!draft) return;
		if (!draft.from.trim() || !draft.to.trim()) {
			toast("From and to are required", "error");
			return;
		}
		const next = creating ? [...rules, draft] : rules.map((rule, index) => (index === selected ? draft : rule));
		try {
			const saved = await apiData<Rule[]>("PUT", "/api/redirects", { data: next });
			setRules(saved);
			const nextIndex = creating ? saved.length - 1 : selected;
			setSelected(nextIndex);
			setDraft(nextIndex === null ? null : structuredClone(saved[nextIndex] ?? draft));
			setCreating(false);
			toast("Redirect saved");
		} catch (failure) {
			setError((failure as Error).message);
		}
	};
	const removeRule = async () => {
		if (selected === null) return;
		if (!confirm("Delete this redirect?")) return;
		try {
			const saved = await apiData<Rule[]>("PUT", "/api/redirects", {
				data: rules.filter((_, index) => index !== selected),
			});
			setRules(saved);
			setSelected(null);
			setDraft(null);
			setCreating(false);
			toast("Redirect deleted");
		} catch (failure) {
			setError((failure as Error).message);
		}
	};
	const clearMissing = () => {
		if (!confirm("Clear the whole 404 log?")) return;
		void apiData("DELETE", "/api/redirects/404")
			.then(() => {
				setMissing([]);
				setSelectedMissing(null);
				toast("404 log cleared");
			})
			.catch((failure: Error) => setError(failure.message));
	};
	const importRedirects = async () => {
		try {
			const result = await apiData<{ imported: number }>("POST", "/api/redirects/import", {
				format: "csv",
				text: importText,
				mode: replace ? "replace" : "merge",
			});
			toast(`Imported ${result.imported} redirects`);
			setImportText("");
			setSettingsOpen(false);
			await load();
		} catch (failure) {
			setError((failure as Error).message);
		}
	};

	const switchTab = (next: "rules" | "missing") => {
		if (dirty && !confirm("Discard unsaved redirect changes?")) return;
		setTab(next);
		if (next === "missing") {
			setSelected(null);
			setDraft(null);
			setCreating(false);
		}
	};

	const title = draft?.from || "Redirect";
	const detail =
		tab === "rules" ? (
			draft ? (
				<>
					<header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
						<div className="grid min-w-0 gap-1">
							<h2 className="truncate font-mono text-lg font-semibold">{title}</h2>
							<p className="text-xs text-muted-foreground">{creating ? "New redirect rule" : "Redirect rule"}</p>
						</div>
						<div className="flex items-center gap-1">
							{!creating && (
								<Button variant="ghost" size="sm" className="text-destructive" onClick={() => void removeRule()}>
									<Trash2 size={14} /> Delete
								</Button>
							)}
							<Button size="sm" disabled={!dirty} onClick={() => void saveDraft()}>
								Save
							</Button>
						</div>
					</header>
					<div className="custom-scrollbar min-h-0 overflow-y-auto">
						<div className="grid gap-4 p-5">
							<Input
								label="From"
								placeholder="/old-path"
								value={draft.from}
								onChange={(event) => setDraft({ ...draft, from: event.target.value })}
							/>
							<Input
								label="To"
								placeholder="/new-path or https://example.com"
								value={draft.to}
								onChange={(event) => setDraft({ ...draft, to: event.target.value })}
							/>
							<div className="grid gap-3 sm:grid-cols-2">
								<Select
									label="Type"
									value={String(draft.status)}
									onChange={(event) => setDraft({ ...draft, status: Number(event.target.value) === 302 ? 302 : 301 })}
								>
									<option value="301">301 — Permanent</option>
									<option value="302">302 — Temporary</option>
								</Select>
								<Select
									label="Match"
									value={draft.match ?? "exact"}
									onChange={(event) => setDraft({ ...draft, match: event.target.value as Rule["match"] })}
								>
									<option value="exact">Exact path</option>
									<option value="wildcard">Wildcard</option>
									<option value="regex">Regular expression</option>
								</Select>
							</div>
							<Checkbox
								label="Enabled"
								checked={draft.enabled !== false}
								onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
							/>
							<Input
								label="Note"
								placeholder="Why this redirect exists"
								value={draft.note ?? ""}
								onChange={(event) => setDraft({ ...draft, note: event.target.value })}
							/>
							<p className="text-xs text-muted-foreground">
								Loops and duplicate source paths are rejected by the server.
							</p>
						</div>
					</div>
				</>
			) : (
				<div className="grid min-h-[520px] place-items-center p-6">
					<div className="grid max-w-sm justify-items-center gap-2 text-center">
						<span className="grid size-16 place-items-center rounded-full bg-secondary text-muted-foreground">
							<ArrowRightLeft size={24} />
						</span>
						<p className="font-medium">Redirects</p>
						<p className="text-sm text-muted-foreground">Select a rule or create one from an old URL.</p>
						<Button variant="secondary" size="sm" onClick={() => startNew()}>
							<Plus size={14} /> New redirect
						</Button>
					</div>
				</div>
			)
		) : (
			<div className="flex min-h-[520px] flex-col">
				<header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
					<div>
						<h2 className="text-lg font-semibold">404 log</h2>
						<p className="text-xs text-muted-foreground">Paths that recently matched nothing.</p>
					</div>
					{missing.length > 0 && (
						<Button variant="ghost" size="sm" onClick={clearMissing}>
							Clear log
						</Button>
					)}
				</header>
				{selectedMissingRow ? (
					<div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
						<div className="grid gap-4">
							<div className="grid gap-1">
								<p className="text-xs font-medium tracking-wider text-zinc-400 uppercase">Missing path</p>
								<p className="break-all font-mono text-sm">{selectedMissingRow.path}</p>
							</div>
							<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
								<dt className="text-muted-foreground">Hits</dt>
								<dd>{selectedMissingRow.count}</dd>
								<dt className="text-muted-foreground">Last seen</dt>
								<dd>{new Date(selectedMissingRow.lastSeen).toLocaleString()}</dd>
							</dl>
							<Button onClick={() => startNew(selectedMissingRow.path)}>Create redirect</Button>
						</div>
					</div>
				) : (
					<div className="grid flex-1 place-items-center p-6">
						<div className="grid max-w-sm justify-items-center gap-2 text-center">
							<span className="grid size-16 place-items-center rounded-full bg-secondary text-muted-foreground">
								<Search size={24} />
							</span>
							<p className="font-medium">404 log</p>
							<p className="text-sm text-muted-foreground">
								Select a missing path to inspect it and create a redirect.
							</p>
						</div>
					</div>
				)}
			</div>
		);

	return (
		<div className="grid gap-4">
			<WorkspaceLayout sidebarWidth={340}>
				<WorkspaceSidebar>
					<div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
						<div className="grid gap-0.5">
							<h1 className="text-base font-semibold">Redirects</h1>
							<p className="text-[11px] text-muted-foreground">
								{rules.length} {rules.length === 1 ? "rule" : "rules"} · {missing.length} missing{" "}
								{missing.length === 1 ? "path" : "paths"}
							</p>
						</div>
						<div className="flex items-center gap-1">
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="Redirect settings"
								title="Redirect settings"
								onClick={() => setSettingsOpen(true)}
							>
								<Settings size="1em" />
							</Button>
							<Button
								variant="secondary"
								size="icon-sm"
								style={{ borderRadius: "200px" }}
								className="border-border bg-white text-[#101011] shadow-sm hover:bg-zinc-200!"
								aria-label="New redirect"
								title="New redirect"
								onClick={() => startNew()}
							>
								<Plus size="1em" />
							</Button>
						</div>
					</div>
					<div className="border-b border-border">
						<div className="relative">
							<Search
								size="1em"
								className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-muted-foreground"
							/>
							<Input
								aria-label="Search redirects"
								className="h-12 rounded-none border-transparent bg-transparent pr-4 pl-11 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Search redirects..."
							/>
						</div>
					</div>
					<div className="flex items-center gap-1 border-b border-border px-3 py-2">
						<button
							type="button"
							onClick={() => switchTab("rules")}
							aria-pressed={tab === "rules"}
							className={`rounded-md px-2.5 py-1.5 text-xs ${tab === "rules" ? "bg-tab text-foreground" : "text-muted-foreground hover:bg-muted/60"}`}
						>
							Rules <span className="text-muted-foreground">({rules.length})</span>
						</button>
						<button
							type="button"
							onClick={() => switchTab("missing")}
							aria-pressed={tab === "missing"}
							className={`rounded-md px-2.5 py-1.5 text-xs ${tab === "missing" ? "bg-tab text-foreground" : "text-muted-foreground hover:bg-muted/60"}`}
						>
							404 log <span className="text-muted-foreground">({missing.length})</span>
						</button>
					</div>
					<div className="flex items-center justify-between border-b border-border px-3 py-2 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
						<span>
							{tab === "rules" ? filteredRules.length : filteredMissing.length} {tab === "rules" ? "rules" : "paths"}
						</span>
						<div className="flex items-center gap-1">
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={tab === "rules" ? "Previous redirects page" : "Previous 404 page"}
								disabled={(tab === "rules" ? currentRulePage : currentMissingPage) <= 1}
								onClick={() =>
									tab === "rules" ? setRulePage(currentRulePage - 1) : setMissingPage(currentMissingPage - 1)
								}
							>
								<ChevronLeft size={13} />
							</Button>
							<span className="tabular-nums">
								{tab === "rules" ? currentRulePage : currentMissingPage} /{" "}
								{tab === "rules" ? rulePageCount : missingPageCount}
							</span>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={tab === "rules" ? "Next redirects page" : "Next 404 page"}
								disabled={
									(tab === "rules" ? currentRulePage : currentMissingPage) >=
									(tab === "rules" ? rulePageCount : missingPageCount)
								}
								onClick={() =>
									tab === "rules" ? setRulePage(currentRulePage + 1) : setMissingPage(currentMissingPage + 1)
								}
							>
								<ChevronRight size={13} />
							</Button>
						</div>
					</div>
					<div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
						{tab === "rules" ? (
							visibleRules.length === 0 ? (
								<EmptyState
									title={rules.length === 0 ? "No redirects" : "No matches"}
									description={
										rules.length === 0 ? "Add a rule to keep an old URL working." : "Try a different search."
									}
									action={<Button onClick={() => startNew()}>+ New redirect</Button>}
								/>
							) : (
								<div className="grid gap-1">
									{visibleRules.map(({ rule, index }) => (
										<button
											key={`${rule.from}:${index}`}
											type="button"
											aria-label={`Open redirect ${rule.from}`}
											aria-current={selected === index ? "true" : undefined}
											onClick={() => chooseRule(index)}
											className={`flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left ${
												selected === index
													? "border-primary/60 bg-tab text-foreground"
													: "border-transparent text-muted-foreground hover:bg-muted/60"
											}`}
										>
											<span className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
												<ArrowRightLeft size="1em" />
											</span>
											<span className="min-w-0 flex-1">
												<span className="block truncate font-mono text-sm text-foreground">{rule.from}</span>
												<span className="mt-0.5 flex items-center gap-1 text-[11px]">
													<span className="truncate">{rule.to}</span>
													<Badge tone={rule.status === 301 ? "accent" : "neutral"}>{rule.status}</Badge>
												</span>
											</span>
										</button>
									))}
								</div>
							)
						) : visibleMissing.length === 0 ? (
							<EmptyState title="No 404s recorded" description="Missing paths will appear here." />
						) : (
							<div className="grid gap-1">
								{visibleMissing.map((row) => (
									<button
										key={row.path}
										type="button"
										aria-label={`Open missing path ${row.path}`}
										aria-current={selectedMissing === row.path ? "true" : undefined}
										onClick={() => setSelectedMissing(row.path)}
										className={`flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left ${
											selectedMissing === row.path
												? "border-primary/60 bg-tab text-foreground"
												: "border-transparent text-muted-foreground hover:bg-muted/60"
										}`}
									>
										<span className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
											<Search size="1em" />
										</span>
										<span className="min-w-0 flex-1">
											<span className="block truncate font-mono text-sm text-foreground">{row.path}</span>
											<span className="mt-0.5 block text-[11px]">{row.count} hits</span>
										</span>
									</button>
								))}
							</div>
						)}
					</div>
					<ErrorText>{error}</ErrorText>
				</WorkspaceSidebar>
				<WorkspacePanel className="grid-rows-[auto_minmax(0,1fr)]">{detail}</WorkspacePanel>
			</WorkspaceLayout>

			<Dialog
				open={settingsOpen}
				title="Redirect settings"
				description="Import or export rules as CSV or JSON."
				onClose={() => setSettingsOpen(false)}
				footer={
					<Button variant="ghost" onClick={() => setSettingsOpen(false)}>
						Close
					</Button>
				}
			>
				<div className="grid gap-4">
					<Select
						label="Per page"
						value={String(pageSize)}
						onChange={(event) => {
							setPageSize(Number(event.target.value));
							setRulePage(1);
							setMissingPage(1);
						}}
					>
						{[10, 20, 50, 100].map((size) => (
							<option key={size} value={size}>
								{size}
							</option>
						))}
					</Select>
					<div className="flex flex-wrap gap-3 text-sm">
						<a
							className="inline-flex items-center gap-1 text-primary underline"
							href="/api/redirects/export?format=csv"
							download
						>
							<Download size={14} /> CSV
						</a>
						<a
							className="inline-flex items-center gap-1 text-primary underline"
							href="/api/redirects/export"
							download="redirects.json"
						>
							<Download size={14} /> JSON
						</a>
					</div>
					<Textarea
						label="Paste CSV"
						hint="Columns: from, to, status, match, enabled, note."
						value={importText}
						onChange={(event) => setImportText(event.target.value)}
					/>
					<Checkbox
						label="Replace all saved redirects"
						checked={replace}
						onChange={(event) => setReplace(event.target.checked)}
					/>
					<Button variant="secondary" disabled={!importText.trim()} onClick={() => void importRedirects()}>
						<Upload size={14} /> Import
					</Button>
				</div>
			</Dialog>
		</div>
	);
}
