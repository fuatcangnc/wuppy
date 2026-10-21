import { ArrowRightLeft, Plus, Search, Settings, Tags } from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { useCallback, useEffect, useState } from "react";
import { apiData } from "../../lib/api.ts";
import { slugifyTitle } from "../../lib/slug.ts";
import { $data, loadData, saveData } from "../../stores/dashboard.ts";
import { Badge, Button, Checkbox, Dialog, EmptyState, Input, Select, Textarea, toast } from "../../ui/index.tsx";
import { WorkspaceLayout, WorkspacePanel, WorkspaceSidebar } from "../shared/WorkspaceLayout.tsx";

export interface Term {
	slug: string;
	name: string;
	description: string;
	parent?: string | undefined;
	order: number;
	translations: Record<string, { name: string; description: string }>;
}
export interface Taxonomy {
	name: string;
	label: string;
	hierarchical: boolean;
	collections: string[];
	terms: Term[];
}
type Counts = Record<string, Record<string, { total: number; published: number }>>;

/** Depth-first rows (parents before children), siblings by order then name. */
export function flatten(terms: Term[]): Array<{ term: Term; depth: number }> {
	const out: Array<{ term: Term; depth: number }> = [];
	const walk = (parent: string | undefined, depth: number) => {
		terms
			.filter((t) => t.parent === parent)
			.toSorted((a, b) => a.order - b.order || a.name.localeCompare(b.name))
			.forEach((term) => {
				out.push({ term, depth });
				walk(term.slug, depth + 1);
			});
	};
	walk(undefined, 0);
	return out;
}

const blank = (): Term => ({ slug: "", name: "", description: "", order: 0, translations: {} });

function TaxonomySettingsDialog({
	taxonomies,
	current,
	onClose,
	onSaved,
}: {
	taxonomies: Taxonomy[];
	current: string;
	onClose: () => void;
	onSaved: (name: string) => void;
}) {
	const [selected, setSelected] = useState(current);
	const initial = taxonomies.find((taxonomy) => taxonomy.name === current) ?? taxonomies[0];
	const [creating, setCreating] = useState(false);
	const [draft, setDraft] = useState<Taxonomy>(
		structuredClone(initial ?? { name: "", label: "", hierarchical: false, collections: [], terms: [] }),
	);
	const [collections, setCollections] = useState(draft.collections.join(", "));

	const choose = (name: string) => {
		if (name === "__new") {
			setCreating(true);
			setSelected("");
			setDraft({ name: "", label: "", hierarchical: false, collections: [], terms: [] });
			setCollections("");
			return;
		}
		const next = taxonomies.find((taxonomy) => taxonomy.name === name);
		if (!next) return;
		setCreating(false);
		setSelected(name);
		setDraft(structuredClone(next));
		setCollections(next.collections.join(", "));
	};
	const save = async () => {
		const name = draft.name.trim() || slugifyTitle(draft.label);
		const label = draft.label.trim() || name;
		if (!name) {
			toast("Key or label is required", "error");
			return;
		}
		const nextTaxonomy = {
			...draft,
			name,
			label,
			collections: collections
				.split(",")
				.map((value) => value.trim())
				.filter(Boolean),
			terms: creating ? [] : draft.terms,
		};
		const original = creating ? null : selected;
		const next = original
			? taxonomies.map((taxonomy) => (taxonomy.name === original ? nextTaxonomy : taxonomy))
			: [...taxonomies, nextTaxonomy];
		try {
			await saveData("taxonomies", next);
			toast("Taxonomy saved");
			onSaved(name);
			onClose();
		} catch (error) {
			toast((error as Error).message, "error");
		}
	};
	const remove = async () => {
		if (!selected) return;
		if (!confirm(`Delete the "${draft.label || draft.name}" taxonomy and its terms?`)) return;
		const next = taxonomies.filter((taxonomy) => taxonomy.name !== selected);
		try {
			await saveData("taxonomies", next);
			toast("Taxonomy deleted");
			onSaved(next[0]?.name ?? "");
			onClose();
		} catch (error) {
			toast((error as Error).message, "error");
		}
	};

	return (
		<Dialog
			open
			title="Taxonomy settings"
			description="Term groups used by collections."
			onClose={onClose}
			footer={
				<>
					{!creating && taxonomies.length > 1 && (
						<Button variant="ghost" size="sm" className="text-destructive" onClick={() => void remove()}>
							Delete taxonomy
						</Button>
					)}
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button onClick={() => void save()}>Save taxonomy</Button>
				</>
			}
		>
			<div className="grid gap-3">
				<Select label="Taxonomy" value={creating ? "__new" : selected} onChange={(event) => choose(event.target.value)}>
					{taxonomies.map((taxonomy) => (
						<option key={taxonomy.name} value={taxonomy.name}>
							{taxonomy.label || taxonomy.name}
						</option>
					))}
					<option value="__new">+ New taxonomy</option>
				</Select>
				<Input
					label="Key"
					value={draft.name}
					onChange={(event) => setDraft({ ...draft, name: event.target.value })}
					hint="Used in entry frontmatter. Leave empty to derive it from the label."
				/>
				<Input
					label="Label"
					value={draft.label}
					onChange={(event) => setDraft({ ...draft, label: event.target.value })}
				/>
				<Input
					label="Collections"
					value={collections}
					onChange={(event) => setCollections(event.target.value)}
					hint="Comma-separated collection keys, e.g. posts, pages."
				/>
				<Checkbox
					label="Hierarchical"
					checked={draft.hierarchical}
					onChange={(event) => setDraft({ ...draft, hierarchical: event.target.checked })}
				/>
			</div>
		</Dialog>
	);
}

export function TermManager() {
	const taxonomies = (useStore($data).taxonomies as Taxonomy[] | undefined) ?? [];
	const [current, setCurrent] = useState("");
	const [counts, setCounts] = useState<Counts>({});
	const [editing, setEditing] = useState<{ term: Term; original?: string; translations: string } | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [merging, setMerging] = useState<{ term: Term; into: string } | null>(null);

	const reload = useCallback(async () => {
		await loadData<Taxonomy[]>("taxonomies").catch(() => undefined);
		setCounts(await apiData<Counts>("GET", "/api/taxonomies/counts").catch(() => ({})));
	}, []);
	useEffect(() => void reload(), [reload]);

	const taxonomy = taxonomies.find((item) => item.name === current) ?? taxonomies[0];
	useEffect(() => {
		setEditing(null);
		setSelected(null);
	}, [taxonomy?.name]);
	useEffect(() => {
		if (!taxonomy) return;
		if (selected && !taxonomy.terms.some((term) => term.slug === selected)) {
			setSelected(null);
			setEditing(null);
		}
	}, [selected, taxonomy]);
	if (!taxonomy) {
		return (
			<>
				<div className="grid h-[60vh] place-items-center">
					<EmptyState
						title="No taxonomies"
						description="Create a taxonomy group to start adding terms."
						action={<Button onClick={() => setSettingsOpen(true)}>Create taxonomy</Button>}
					/>
				</div>
				{settingsOpen && (
					<TaxonomySettingsDialog
						taxonomies={taxonomies}
						current=""
						onClose={() => setSettingsOpen(false)}
						onSaved={(name) => setCurrent(name)}
					/>
				)}
			</>
		);
	}
	const rows = flatten(taxonomy.terms).filter(
		({ term }) => !query.trim() || `${term.name} ${term.slug}`.toLowerCase().includes(query.trim().toLowerCase()),
	);
	const countOf = (slug: string) => counts[taxonomy.name]?.[slug] ?? { total: 0, published: 0 };
	const editingTitle = editing?.term.name || "New term";

	const saveTerms = async (terms: Term[]) => {
		try {
			await saveData(
				"taxonomies",
				taxonomies.map((item) => (item.name === taxonomy.name ? { ...item, terms } : item)),
			);
			await reload();
			toast("Terms saved");
			return true;
		} catch (error) {
			toast((error as Error).message, "error");
			return false;
		}
	};
	const act = async (path: string, body: unknown, done: string) => {
		try {
			const { changed } = await apiData<{ changed: number }>("POST", path, body);
			toast(`${done} (${changed} entries updated)`);
			await reload();
		} catch (error) {
			toast((error as Error).message, "error");
		}
	};
	const base = `/api/taxonomies/${encodeURIComponent(taxonomy.name)}/terms`;

	const chooseTerm = (term: Term) => {
		setSelected(term.slug);
		setEditing({
			term: structuredClone(term),
			original: term.slug,
			translations: JSON.stringify(term.translations, null, 2),
		});
	};
	const startNew = () => {
		setSelected(null);
		setEditing({ term: blank(), translations: "{}" });
	};
	const submit = async () => {
		if (!editing) return;
		let translations: Term["translations"];
		try {
			translations = JSON.parse(editing.translations || "{}") as Term["translations"];
		} catch {
			return toast("Translations must be valid JSON", "error");
		}
		const next = { ...editing.term, slug: editing.term.slug || slugifyTitle(editing.term.name), translations };
		if (!next.parent) delete next.parent;
		const original = editing.original;
		if (original && original !== next.slug) {
			await act(`${base}/${encodeURIComponent(original)}/rename`, { to: next.slug }, "Renamed");
			next.parent = next.parent === original ? next.slug : next.parent;
		}
		const terms = original
			? taxonomy.terms.map((term) => (term.slug === original || term.slug === next.slug ? next : term))
			: [...taxonomy.terms, next];
		if (await saveTerms(terms)) {
			setEditing({ term: next, original: next.slug, translations: JSON.stringify(next.translations, null, 2) });
			setSelected(next.slug);
		}
	};
	const removeTerm = (term: Term) => {
		const n = countOf(term.slug);
		const used = n.total > 0 ? ` ${n.total} entries still use it.` : "";
		if (confirm(`Delete "${term.name}"?${used}`))
			void saveTerms(taxonomy.terms.filter((item) => item.slug !== term.slug));
	};

	const list = (
		<WorkspaceSidebar>
			<div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
				<div className="grid gap-0.5">
					<h1 className="text-base font-semibold">Categories &amp; tags</h1>
					<p className="text-[11px] text-muted-foreground">
						{taxonomy.terms.length} terms in {taxonomy.label || taxonomy.name}
					</p>
				</div>
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Taxonomy settings"
						title="Taxonomy settings"
						onClick={() => setSettingsOpen(true)}
					>
						<Settings size="1em" />
					</Button>
					<Button
						variant="secondary"
						size="icon-sm"
						style={{ borderRadius: "200px" }}
						className="border-border bg-white text-[#101011] shadow-sm hover:bg-zinc-200!"
						aria-label="Create term"
						title="Create term"
						onClick={startNew}
					>
						<Plus size="1em" />
					</Button>
				</div>
			</div>
			<div className="border-b border-border p-3">
				<Select label="Terms of" value={taxonomy.name} onChange={(event) => setCurrent(event.target.value)}>
					{taxonomies.map((item) => (
						<option key={item.name} value={item.name}>
							{item.label || item.name}
						</option>
					))}
				</Select>
			</div>
			<div className="border-b border-border">
				<div className="relative">
					<Search
						size="1em"
						className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-muted-foreground"
					/>
					<Input
						aria-label="Search terms"
						className="h-12 rounded-none border-transparent bg-transparent pr-4 pl-11 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search terms..."
					/>
				</div>
			</div>
			<div className="border-b border-border px-3 py-2 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
				{rows.length} {rows.length === 1 ? "term" : "terms"}
			</div>
			<div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
				{rows.length === 0 ? (
					<EmptyState
						title={taxonomy.terms.length === 0 ? `No ${taxonomy.label.toLowerCase()} yet` : "No matches"}
						description={taxonomy.terms.length === 0 ? "Create the first term." : "Try a different search."}
						action={<Button onClick={startNew}>+ New term</Button>}
					/>
				) : (
					<div className="grid gap-1">
						{rows.map(({ term, depth }) => {
							const n = countOf(term.slug);
							return (
								<button
									key={term.slug}
									type="button"
									aria-label={`Open ${term.name}`}
									aria-current={selected === term.slug ? "true" : undefined}
									onClick={() => chooseTerm(term)}
									className={`flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left ${
										selected === term.slug
											? "border-primary/60 bg-tab text-foreground"
											: "border-transparent text-muted-foreground hover:bg-muted/60"
									}`}
								>
									<span className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
										<Tags size="1em" />
									</span>
									<span className="min-w-0 flex-1" style={{ paddingInlineStart: depth * 12 }}>
										<span className="block truncate text-sm font-medium text-foreground">{term.name}</span>
										<span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
											{term.slug}
											{n.total > 0 ? ` · ${n.total} entries` : ""}
										</span>
									</span>
									{n.total > 0 && <Badge tone="neutral">{n.total}</Badge>}
								</button>
							);
						})}
					</div>
				)}
			</div>
		</WorkspaceSidebar>
	);

	const detail = editing ? (
		<>
			<header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
				<div className="grid min-w-0 gap-1">
					<h2 className="truncate text-xl font-semibold">{editingTitle}</h2>
					<p className="text-xs text-muted-foreground">
						{editing.original
							? `${taxonomy.label || taxonomy.name} / ${editing.term.slug}`
							: `New ${taxonomy.label.toLowerCase()}`}
					</p>
				</div>
				<div className="flex items-center gap-1">
					{editing.original && (
						<Button variant="secondary" size="sm" onClick={() => setMerging({ term: editing.term, into: "" })}>
							<ArrowRightLeft size={14} /> Merge
						</Button>
					)}
					{editing.original && (
						<Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeTerm(editing.term)}>
							Delete
						</Button>
					)}
					<Button size="sm" onClick={() => void submit()}>
						Save
					</Button>
				</div>
			</header>
			<div className="custom-scrollbar min-h-0 overflow-y-auto">
				<div className="grid gap-4 p-5">
					<Input
						label="Name"
						value={editing.term.name}
						onChange={(event) => setEditing({ ...editing, term: { ...editing.term, name: event.target.value } })}
					/>
					<Input
						label="Slug"
						hint={editing.original ? "Changing it updates every entry that uses the term." : "Defaults to the name."}
						value={editing.term.slug}
						placeholder={slugifyTitle(editing.term.name)}
						onChange={(event) => setEditing({ ...editing, term: { ...editing.term, slug: event.target.value } })}
					/>
					<Input
						label="Description"
						value={editing.term.description}
						onChange={(event) => setEditing({ ...editing, term: { ...editing.term, description: event.target.value } })}
					/>
					{taxonomy.hierarchical && (
						<Select
							label="Parent"
							value={editing.term.parent ?? ""}
							onChange={(event) =>
								setEditing({ ...editing, term: { ...editing.term, parent: event.target.value || undefined } })
							}
						>
							<option value="">None</option>
							{taxonomy.terms
								.filter((term) => term.slug !== editing.original)
								.map((term) => (
									<option key={term.slug} value={term.slug}>
										{term.name}
									</option>
								))}
						</Select>
					)}
					<Input
						label="Order"
						type="number"
						value={editing.term.order}
						onChange={(event) =>
							setEditing({ ...editing, term: { ...editing.term, order: Number(event.target.value) || 0 } })
						}
					/>
					<Textarea
						label="Translations (JSON)"
						hint='{"tr": {"name": "…", "description": ""}}'
						value={editing.translations}
						onChange={(event) => setEditing({ ...editing, translations: event.target.value })}
					/>
					{editing.original && (
						<div className="grid gap-1 rounded-lg border border-border p-3 text-sm">
							<p className="text-xs font-medium tracking-wider text-zinc-400 uppercase">Usage</p>
							<p>
								{countOf(editing.term.slug).total} entries use this term
								{countOf(editing.term.slug).published !== countOf(editing.term.slug).total
									? ` · ${countOf(editing.term.slug).published} published`
									: ""}
							</p>
						</div>
					)}
				</div>
			</div>
		</>
	) : (
		<div className="grid min-h-[520px] place-items-center p-6">
			<div className="grid max-w-sm justify-items-center gap-2 text-center">
				<span className="grid size-16 place-items-center rounded-full bg-secondary text-muted-foreground">
					<Tags size={24} />
				</span>
				<p className="font-medium">Terms</p>
				<p className="text-sm text-muted-foreground">Select a term or create a new one.</p>
				<Button variant="secondary" size="sm" onClick={startNew}>
					<Plus size={14} /> New term
				</Button>
			</div>
		</div>
	);

	return (
		<>
			<WorkspaceLayout sidebarWidth={340}>
				{list}
				<WorkspacePanel className="grid-rows-[auto_minmax(0,1fr)]">{detail}</WorkspacePanel>
			</WorkspaceLayout>

			{settingsOpen && (
				<TaxonomySettingsDialog
					taxonomies={taxonomies}
					current={taxonomy.name}
					onClose={() => setSettingsOpen(false)}
					onSaved={(name) => setCurrent(name)}
				/>
			)}

			<Dialog
				open={!!merging}
				title={`Merge "${merging?.term.name ?? ""}"`}
				onClose={() => setMerging(null)}
				footer={
					<>
						<Button variant="ghost" onClick={() => setMerging(null)}>
							Cancel
						</Button>
						<Button
							disabled={!merging?.into}
							onClick={() => {
								if (!merging) return;
								void act(`${base}/${encodeURIComponent(merging.term.slug)}/merge`, { into: merging.into }, "Merged");
								setMerging(null);
							}}
						>
							Merge
						</Button>
					</>
				}
			>
				{merging && (
					<Select
						label="Move its entries into"
						hint="The term is removed; its children move to the target."
						value={merging.into}
						onChange={(event) => setMerging({ ...merging, into: event.target.value })}
					>
						<option value="">Choose a term</option>
						{taxonomy.terms
							.filter((term) => term.slug !== merging.term.slug)
							.map((term) => (
								<option key={term.slug} value={term.slug}>
									{term.name}
								</option>
							))}
					</Select>
				)}
			</Dialog>
		</>
	);
}
