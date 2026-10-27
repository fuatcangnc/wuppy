import { FileText, Link2, Plus, Search } from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { useEffect, useState } from "react";
import { apiData } from "../../lib/api.ts";
import { loadCollections } from "../../stores/content.ts";
import { $data, $dataErrors, loadData, saveData } from "../../stores/dashboard.ts";
import { Button, Checkbox, EmptyState, ErrorText, Input, Select, Textarea, toast } from "../../ui/index.tsx";
import { WorkspaceLayout, WorkspacePanel, WorkspaceSidebar } from "../shared/WorkspaceLayout.tsx";

export const FIELD_TYPES = [
	"string",
	"text",
	"richText",
	"date",
	"image",
	"boolean",
	"number",
	"list",
	"byline",
	"taxonomy",
	"reference",
	"section",
	"select",
	"json",
	"repeater",
	"blocks",
] as const;

type FieldDef = string | ({ type: string } & Record<string, unknown>);
export interface ContentType {
	name: string;
	dir: string;
	format: "md" | "mdx";
	route?: string;
	fields: Record<string, FieldDef>;
}
interface Impact {
	invalid: Array<{ slug: string; errors: string[] }>;
	removedFields: Array<{ field: string; entries: number }>;
	types: string;
}

const typeOf = (f: FieldDef) => (typeof f === "string" ? f : f.type);
/** Options object of a field, keeping everything the form does not edit (min, max, showIf, nested fields…). */
const optsOf = (f: FieldDef): { type: string } & Record<string, unknown> => (typeof f === "string" ? { type: f } : f);

/** `{ type: "string" }` with nothing else set collapses back to the short form. */
export function compactField(f: { type: string } & Record<string, unknown>): FieldDef {
	const extra = Object.entries(f).filter(([k, v]) => k !== "type" && v !== undefined && v !== false && v !== "");
	return extra.length ? (Object.fromEntries([["type", f.type], ...extra]) as FieldDef) : f.type;
}

export const blankType = (): ContentType => ({
	name: "",
	dir: "",
	format: "mdx",
	route: "",
	fields: {},
});

export interface Relation {
	name: string;
	from: string;
	to: string;
	fromLabel: string;
	toLabel: string;
	toMany: boolean;
	fromMany: boolean;
}

const label = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);
/** A new type gets its own folder and URL from its name until they are typed in. */
const typePath = (name: string) => ({ dir: name ? `content/${name}` : "", route: name ? `/${name}/{slug}` : "" });
/** A field a relation adds: shown with the relation, never saved with the type. */
const fromRelation = (f: FieldDef) => typeof f === "object" && typeof f.relation === "string";
const ownFields = (t: ContentType): ContentType => ({
	...t,
	fields: Object.fromEntries(Object.entries(t.fields).filter(([, f]) => !fromRelation(f))),
});

export function ContentTypesPage() {
	const stored = useStore($data)["content-types"] as ContentType[] | undefined;
	const error = useStore($dataErrors)["content-types"];
	const [items, setItems] = useState<ContentType[]>([]);
	const [editing, setEditing] = useState<ContentType | null>(null);
	const [index, setIndex] = useState<number | null>(null);
	const [asJson, setAsJson] = useState(false);
	const [jsonText, setJsonText] = useState("");
	const [impact, setImpact] = useState<Impact | null>(null);
	const [live, setLive] = useState<ContentType[]>([]);
	const collections = live.map((c) => c.name);
	const relations = (useStore($data).relations as Relation[] | undefined) ?? [];
	const [query, setQuery] = useState("");
	const [fromConfig, setFromConfig] = useState(false);

	// Every collection the site has (its config's, Pages and Posts included), not only the ones made here.
	const refresh = () =>
		apiData<ContentType[]>("GET", "/api/collections")
			.then(setLive)
			.catch(() => undefined);
	useEffect(() => {
		void loadData<ContentType[]>("content-types").catch(() => undefined);
		void loadData<Relation[]>("relations").catch(() => undefined);
		void refresh();
	}, []);
	useEffect(() => {
		if (Array.isArray(stored)) setItems(stored);
	}, [stored]);

	const open = (item: ContentType, i: number | null, config = false) => {
		setEditing(structuredClone(ownFields(item)));
		setIndex(i);
		setFromConfig(config);
		setImpact(null);
		setAsJson(false);
	};
	const setField = (name: string, next: FieldDef | null, rename?: string) => {
		if (!editing) return;
		const entries = Object.entries(editing.fields).flatMap(([k, v]): Array<[string, FieldDef]> =>
			k !== name ? [[k, v]] : next === null ? [] : [[rename ?? k, next]],
		);
		setEditing({ ...editing, fields: Object.fromEntries(entries) });
		setImpact(null);
	};
	const patch = (name: string, change: Record<string, unknown>) =>
		setField(name, compactField({ ...optsOf(editing!.fields[name]!), ...change }));

	const check = async () => {
		if (!editing) return;
		try {
			setImpact(await apiData<Impact>("POST", "/api/content-types/impact", editing));
		} catch (e) {
			toast((e as Error).message, "error");
		}
	};
	const save = async () => {
		if (!editing) return;
		if (impact && (impact.invalid.length || impact.removedFields.length)) {
			const lost = impact.removedFields.map((r) => `${r.field} (${r.entries})`).join(", ");
			const ok = confirm(
				`${impact.invalid.length} existing entries would stop validating` +
					(lost ? `; values in ${lost} stay in the files but become undeclared` : "") +
					". Save anyway?",
			);
			if (!ok) return;
		}
		try {
			const nextIndex = index ?? items.length;
			const saved = await saveData(
				"content-types",
				index === null ? [...items, editing] : items.map((x, i) => (i === index ? editing : x)),
			);
			setItems(saved);
			setIndex(nextIndex);
			setEditing(saved[nextIndex] ? structuredClone(saved[nextIndex]!) : null);
			setFromConfig(false);
			await Promise.all([refresh(), loadCollections()]);
			toast("Custom field saved");
		} catch (e) {
			toast((e as Error).message, "error");
		}
	};

	const remove = async (target: number) => {
		const item = items[target];
		if (!item) return;
		if (!confirm(`Remove the "${item.name}" type? Its files stay on disk.`)) return;
		try {
			const saved = await saveData(
				"content-types",
				items.filter((_, i) => i !== target),
			);
			setItems(saved);
			setIndex(null);
			setEditing(null);
			await Promise.all([refresh(), loadCollections()]);
			toast("Custom field removed");
		} catch (e) {
			toast((e as Error).message, "error");
		}
	};

	// The site's collections in order, each the saved type when one was made here (it replaces the config's).
	const rows = [
		...live.map((c) => {
			const i = items.findIndex((t) => t.name === c.name);
			return { item: i === -1 ? c : items[i]!, i: i === -1 ? null : i };
		}),
		...items.flatMap((item, i) => (live.some((c) => c.name === item.name) ? [] : [{ item, i: i as number | null }])),
	];
	const visible = rows.filter(
		({ item }) => !query.trim() || `${item.name} ${item.dir}`.toLowerCase().includes(query.trim().toLowerCase()),
	);

	return (
		<WorkspaceLayout sidebarWidth={340}>
			<WorkspaceSidebar>
				<div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
					<div className="grid gap-0.5">
						<h1 className="text-base font-semibold">Custom Fields</h1>
						<p className="text-[11px] text-muted-foreground">{rows.length} custom fields</p>
					</div>
					<Button
						variant="secondary"
						size="icon-sm"
						style={{ borderRadius: "200px" }}
						className="border-border bg-white text-[#101011] shadow-sm hover:bg-zinc-200!"
						aria-label="Create custom field"
						title="Create custom field"
						onClick={() => open(blankType(), null)}
					>
						<Plus size="1em" />
					</Button>
				</div>
				<div className="border-b border-border">
					<div className="relative">
						<Search
							size="1em"
							className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-muted-foreground"
						/>
						<Input
							aria-label="Search custom fields"
							className="h-12 rounded-none border-transparent bg-transparent pr-4 pl-11 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search custom fields..."
						/>
					</div>
				</div>
				<div className="border-b border-border px-3 py-2 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
					{visible.length} {visible.length === 1 ? "field" : "fields"}
				</div>
				<div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
					{visible.length === 0 ? (
						<EmptyState
							title={rows.length === 0 ? "No custom fields yet" : "No matches"}
							description={rows.length === 0 ? "Create a custom field." : "Try a different search."}
							action={<Button onClick={() => open(blankType(), null)}>+ New custom field</Button>}
						/>
					) : (
						<div className="grid gap-1">
							{visible.map(({ item, i }) => (
								<button
									key={item.name}
									type="button"
									aria-label={`Open ${item.name}`}
									aria-current={editing?.name === item.name ? "true" : undefined}
									onClick={() => open(item, i, i === null)}
									className={`flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left ${
										editing?.name === item.name
											? "border-primary/60 bg-tab text-foreground"
											: "border-transparent text-muted-foreground hover:bg-muted/60"
									}`}
								>
									<span className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
										<FileText size="1em" />
									</span>
									<span className="min-w-0 flex-1">
										<span className="block truncate text-sm font-medium text-foreground">
											{item.name || "Untitled type"}
										</span>
										<span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
											{item.dir} · {Object.keys(item.fields).length} fields · {i === null ? "Config" : "Dashboard"}
										</span>
									</span>
								</button>
							))}
						</div>
					)}
				</div>
				<ErrorText>{error}</ErrorText>
			</WorkspaceSidebar>
			<WorkspacePanel className="grid-rows-[auto_minmax(0,1fr)]">
				{editing ? (
					<>
						<header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
							<div className="grid min-w-0 gap-1">
								<h2 className="truncate text-xl font-semibold">{editing.name || "New custom field"}</h2>
								<p className="text-xs text-muted-foreground">
									{editing.dir}
									{fromConfig && " · from wuppy.config; saving keeps a copy here that replaces it"}
								</p>
							</div>
							<div className="flex flex-wrap items-center gap-1">
								<Button variant="secondary" size="sm" onClick={() => void check()}>
									Check impact
								</Button>
								{index !== null && (
									<Button variant="ghost" size="sm" className="text-destructive" onClick={() => void remove(index)}>
										Delete
									</Button>
								)}
								<Button size="sm" onClick={() => void save()}>
									Save
								</Button>
							</div>
						</header>
						<div className="custom-scrollbar min-h-0 overflow-y-auto">
							<div className="grid gap-4 p-5">
								<div className="grid gap-3">
									<Input
										label="Name"
										value={editing.name}
										disabled={index !== null || fromConfig}
										onChange={(e) => {
											const name = e.target.value;
											const was = typePath(editing.name);
											setEditing({
												...editing,
												name,
												dir: editing.dir === was.dir ? typePath(name).dir : editing.dir,
												route: editing.route === was.route ? typePath(name).route : editing.route,
											});
										}}
									/>
									<Input
										label="Directory"
										value={editing.dir}
										onChange={(e) => setEditing({ ...editing, dir: e.target.value })}
									/>
									<Select
										label="Format"
										value={editing.format}
										onChange={(e) => setEditing({ ...editing, format: e.target.value as "md" | "mdx" })}
									>
										<option value="md">md</option>
										<option value="mdx">mdx</option>
									</Select>
									<Input
										label="Route"
										hint="Public URL of an entry; {slug} is replaced."
										value={editing.route ?? ""}
										onChange={(e) => setEditing({ ...editing, route: e.target.value })}
									/>

									<div className="flex items-center justify-between">
										<h3 className="text-sm font-medium">Fields</h3>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => {
												if (!asJson) setJsonText(JSON.stringify(editing.fields, null, 2));
												setAsJson(!asJson);
											}}
										>
											{asJson ? "Form" : "JSON"}
										</Button>
									</div>
									{asJson ? (
										<Textarea
											aria-label="Fields JSON"
											className="min-h-48 font-mono"
											value={jsonText}
											onChange={(e) => {
												setJsonText(e.target.value);
												try {
													setEditing({ ...editing, fields: JSON.parse(e.target.value) as ContentType["fields"] });
													setImpact(null);
												} catch {
													/* keep the last valid fields while typing */
												}
											}}
										/>
									) : (
										<div className="grid gap-3">
											{Object.entries(editing.fields).map(([name, def], i, all) => {
												const o = optsOf(def);
												const move = (by: number) => {
													const next = all.slice();
													const [row] = next.splice(i, 1);
													next.splice(i + by, 0, row!);
													setEditing({ ...editing, fields: Object.fromEntries(next) });
												};
												return (
													<div key={name} className="grid gap-2 rounded-md border p-2">
														<div className="flex items-end gap-2">
															<Input
																aria-label={`Name of ${name}`}
																value={name}
																onChange={(e) => setField(name, def, e.target.value)}
															/>
															<Select
																aria-label={`Type of ${name}`}
																value={typeOf(def)}
																onChange={(e) => patch(name, { type: e.target.value })}
															>
																{FIELD_TYPES.map((t) => (
																	<option key={t} value={t}>
																		{t}
																	</option>
																))}
															</Select>
															<Button
																size="sm"
																variant="ghost"
																aria-label={`Move ${name} up`}
																disabled={i === 0}
																onClick={() => move(-1)}
															>
																↑
															</Button>
															<Button
																size="sm"
																variant="ghost"
																aria-label={`Move ${name} down`}
																disabled={i === all.length - 1}
																onClick={() => move(1)}
															>
																↓
															</Button>
															<Button
																size="sm"
																variant="ghost"
																aria-label={`Remove ${name}`}
																onClick={() => setField(name, null)}
															>
																✕
															</Button>
														</div>
														<div className="flex flex-wrap items-center gap-3">
															<Checkbox
																label="Required"
																checked={o.required === true}
																onChange={(e) => patch(name, { required: e.target.checked })}
															/>
															{!["repeater", "blocks", "json"].includes(o.type) && (
																<Checkbox
																	label="Unique"
																	checked={o.unique === true}
																	onChange={(e) => patch(name, { unique: e.target.checked })}
																/>
															)}
															{["taxonomy", "reference", "select", "byline"].includes(o.type) && (
																<Checkbox
																	label="Multiple"
																	checked={o.multiple === true}
																	onChange={(e) => patch(name, { multiple: e.target.checked })}
																/>
															)}
															<Input
																aria-label={`Help of ${name}`}
																placeholder="Help text"
																value={String(o.help ?? "")}
																onChange={(e) => patch(name, { help: e.target.value })}
															/>
															{o.type === "reference" && (
																<Select
																	aria-label={`Target of ${name}`}
																	value={String(o.collection ?? "")}
																	onChange={(e) => patch(name, { collection: e.target.value })}
																>
																	<option value="">Target collection…</option>
																	{collections.map((c) => (
																		<option key={c} value={c}>
																			{c}
																		</option>
																	))}
																</Select>
															)}
															{o.type === "taxonomy" && (
																<Input
																	aria-label={`Taxonomy of ${name}`}
																	placeholder="Taxonomy key"
																	value={String(o.taxonomy ?? "")}
																	onChange={(e) => patch(name, { taxonomy: e.target.value })}
																/>
															)}
															{o.type === "select" && (
																<Input
																	aria-label={`Options of ${name}`}
																	placeholder="Options, comma separated"
																	value={Array.isArray(o.options) ? o.options.join(", ") : ""}
																	onChange={(e) =>
																		patch(name, {
																			options: e.target.value
																				.split(",")
																				.map((s) => s.trim())
																				.filter(Boolean),
																		})
																	}
																/>
															)}
															{!["select", "taxonomy", "reference", "boolean", "repeater", "blocks", "json"].includes(
																o.type,
															) && (
																<Input
																	aria-label={`Default of ${name}`}
																	placeholder="Default"
																	value={String(o.default ?? "")}
																	onChange={(e) => patch(name, { default: e.target.value || undefined })}
																/>
															)}
														</div>
													</div>
												);
											})}
											<Button
												size="sm"
												variant="ghost"
												onClick={() => {
													let n = 1;
													while (`field${n}` in editing.fields) n++;
													setEditing({ ...editing, fields: { ...editing.fields, [`field${n}`]: "string" } });
													setImpact(null);
												}}
											>
												+ Add field
											</Button>
										</div>
									)}

									{impact && (
										<div className="grid gap-2 rounded-md border p-3 text-sm" role="status">
											{impact.invalid.length === 0 && impact.removedFields.length === 0 ? (
												<p>Every existing entry still validates.</p>
											) : (
												<>
													{impact.invalid.map((i) => (
														<p key={i.slug}>
															<strong>{i.slug}</strong>: {i.errors.join("; ")}
														</p>
													))}
													{impact.removedFields.map((r) => (
														<p key={r.field}>
															Dropping <strong>{r.field}</strong> leaves values in {r.entries} entries.
														</p>
													))}
												</>
											)}
											<details>
												<summary>Generated types</summary>
												<pre className="overflow-auto text-xs">{impact.types}</pre>
											</details>
										</div>
									)}
									{(index !== null || fromConfig) && (
										<RelationsPanel type={editing.name} collections={collections} relations={relations} />
									)}
								</div>
							</div>
						</div>
					</>
				) : (
					<div className="grid min-h-[520px] place-items-center p-6">
						<div className="grid max-w-sm justify-items-center gap-2 text-center">
							<span className="grid size-16 place-items-center rounded-full bg-secondary text-muted-foreground">
								<FileText size={24} />
							</span>
							<p className="font-medium">Custom Fields</p>
							<p className="text-sm text-muted-foreground">Select a custom field, or create a new one.</p>
							<Button variant="secondary" size="sm" onClick={() => open(blankType(), null)}>
								<Plus size={14} /> New custom field
							</Button>
						</div>
					</div>
				)}
			</WorkspacePanel>
		</WorkspaceLayout>
	);
}

/** The relations a type takes part in, and a form for a new one (like EmDash's). */
function RelationsPanel({
	type,
	collections,
	relations,
}: {
	type: string;
	collections: string[];
	relations: Relation[];
}) {
	const blank = (): Relation => ({
		name: "",
		from: type,
		to: "",
		fromLabel: label(type),
		toLabel: "",
		toMany: true,
		fromMany: true,
	});
	const [draft, setDraft] = useState<Relation | null>(null);
	const mine = relations.filter((r) => r.from === type || r.to === type);
	const store = async (next: Relation[], done: string) => {
		try {
			await saveData("relations", next);
			await loadCollections();
			setDraft(null);
			toast(done);
		} catch (e) {
			toast((e as Error).message, "error");
		}
	};
	const pick = (to: string) =>
		draft &&
		setDraft({
			...draft,
			to,
			toLabel: draft.toLabel || label(to),
			name: draft.name || `${type}_${to}`.replace(/-/g, "_"),
		});
	return (
		<section className="grid gap-2 rounded-md border p-3" aria-label="Relations">
			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-sm font-medium">Relations</h3>
					<p className="text-xs text-muted-foreground">
						{mine.length} relations this custom field takes part in. A relation lets entries here link to entries of
						another custom field.
					</p>
				</div>
				{!draft && (
					<Button size="sm" variant="secondary" onClick={() => setDraft(blank())}>
						<Link2 size={14} /> New relation
					</Button>
				)}
			</div>
			{mine.map((r) => (
				<div
					key={r.name}
					className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm"
				>
					<span>
						<strong>{r.fromLabel}</strong> → <strong>{r.toLabel}</strong>{" "}
						<span className="text-xs text-muted-foreground">
							{r.name} · each {r.from} links to {r.toMany ? "any number" : "one"}; each {r.to} is linked from{" "}
							{r.fromMany ? "any number" : "one"}
						</span>
					</span>
					<Button
						size="sm"
						variant="ghost"
						className="text-destructive"
						aria-label={`Delete relation ${r.name}`}
						onClick={() => {
							if (confirm(`Delete the "${r.name}" relation? The links stay in the entries' files.`))
								void store(
									relations.filter((x) => x.name !== r.name),
									"Relation deleted",
								);
						}}
					>
						✕
					</Button>
				</div>
			))}
			{draft && (
				<div className="grid gap-2 rounded-md border p-2">
					<div className="grid grid-cols-2 gap-2">
						<Input label="Links from" value={draft.from} disabled />
						<Select label="Links to" value={draft.to} onChange={(e) => pick(e.target.value)}>
							<option value="">Select a custom field</option>
							{collections.map((c) => (
								<option key={c} value={c}>
									{c}
								</option>
							))}
						</Select>
						<Input
							label="Linking side"
							value={draft.fromLabel}
							onChange={(e) => setDraft({ ...draft, fromLabel: e.target.value })}
						/>
						<Input
							label="Linked side"
							value={draft.toLabel}
							onChange={(e) => setDraft({ ...draft, toLabel: e.target.value })}
						/>
					</div>
					<Input
						label="Slug"
						hint="Lowercase letters, numbers and underscores. The linking entries store the links in a field of this name."
						value={draft.name}
						onChange={(e) => setDraft({ ...draft, name: e.target.value })}
					/>
					<div className="grid grid-cols-2 gap-2">
						<Select
							label={`Each ${draft.from} links to`}
							value={draft.toMany ? "many" : "one"}
							onChange={(e) => setDraft({ ...draft, toMany: e.target.value === "many" })}
						>
							<option value="many">Any number</option>
							<option value="one">One</option>
						</Select>
						<Select
							label={`Each ${draft.to || "linked entry"} is linked from`}
							value={draft.fromMany ? "many" : "one"}
							onChange={(e) => setDraft({ ...draft, fromMany: e.target.value === "many" })}
						>
							<option value="many">Any number</option>
							<option value="one">One</option>
						</Select>
					</div>
					<div className="flex justify-end gap-2">
						<Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
							Cancel
						</Button>
						<Button
							size="sm"
							disabled={
								!draft.to || !/^[a-z][a-z0-9_]*$/.test(draft.name) || !draft.fromLabel.trim() || !draft.toLabel.trim()
							}
							onClick={() => void store([...relations, draft], "Relation created")}
						>
							Create relation
						</Button>
					</div>
				</div>
			)}
		</section>
	);
}
