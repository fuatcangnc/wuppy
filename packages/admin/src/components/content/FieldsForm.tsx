import { useEffect, useState } from "react";
import { apiData, apiUrl } from "../../lib/api.ts";
import type { FieldDef } from "../../stores/content.ts";
import { MediaPicker } from "../media/MediaPicker.tsx";
import { Button, Checkbox, Input, Select, Textarea, toast } from "../../ui/index.tsx";

interface Props {
	fields: Record<string, FieldDef>;
	data: Record<string, unknown>;
	/** `undefined` means "remove this field from the frontmatter". */
	onChange: (name: string, value: unknown) => void;
	/** Uploads an image and resolves to its public URL. */
	onUpload?: (file: File) => Promise<string>;
}

interface Byline {
	slug: string;
	name: string;
}
interface Taxonomy {
	name: string;
	label: string;
	terms: Array<{ slug: string; name: string; parent?: string }>;
	[extra: string]: unknown;
}
interface Section {
	slug: string;
	title: string;
}
interface EntryRef {
	slug: string;
	data: Record<string, unknown>;
}

const kindOf = (field: FieldDef) => (typeof field === "string" ? field : field.type);

/** Edits structured values (json, repeater, blocks) as JSON; only valid JSON is emitted. */
function JsonField({ name, value, onChange }: { name: string; value: unknown; onChange: (v: unknown) => void }) {
	const [text, setText] = useState(value === undefined ? "" : JSON.stringify(value, null, 2));
	const [error, setError] = useState("");
	return (
		<Textarea
			label={name}
			className="min-h-32 font-mono"
			value={text}
			error={error || undefined}
			onChange={(e) => {
				setText(e.target.value);
				if (!e.target.value.trim()) {
					setError("");
					return onChange(undefined);
				}
				try {
					onChange(JSON.parse(e.target.value));
					setError("");
				} catch {
					setError("Invalid JSON");
				}
			}}
		/>
	);
}

/** Creates a term without leaving the editor (needs the taxonomies permission). */
function AddTerm({
	taxonomy,
	all,
	onAdded,
}: {
	taxonomy: Taxonomy;
	all: Taxonomy[];
	onAdded: (all: Taxonomy[], slug: string) => void;
}) {
	const [name, setName] = useState("");
	const add = async () => {
		const slug = name
			.toLowerCase()
			.normalize("NFKD")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");
		if (!slug || taxonomy.terms.some((t) => t.slug === slug)) return toast("Pick a new, non-empty term name", "error");
		const next = all.map((t) =>
			t.name === taxonomy.name ? { ...t, terms: [...t.terms, { slug, name: name.trim() }] } : t,
		);
		try {
			onAdded(await apiData<Taxonomy[]>("PUT", "/api/data/taxonomies", { data: next }), slug);
			setName("");
		} catch (e) {
			toast((e as Error).message, "error");
		}
	};
	return (
		<div className="flex items-end gap-2">
			<Input
				aria-label={`New ${taxonomy.name} term`}
				placeholder="New term"
				value={name}
				onChange={(e) => setName(e.target.value)}
				onKeyDown={(e) => {
					if (e.key !== "Enter") return;
					e.preventDefault();
					void add();
				}}
			/>
			<Button type="button" size="sm" variant="ghost" onClick={() => void add()}>
				Add
			</Button>
		</div>
	);
}

export function FieldsForm({ fields, data, onChange, onUpload }: Props) {
	const [picking, setPicking] = useState<string | null>(null);
	const [bylines, setBylines] = useState<Byline[]>([]);
	const [taxonomies, setTaxonomies] = useState<Taxonomy[]>([]);
	const [sections, setSections] = useState<Section[]>([]);
	const [references, setReferences] = useState<Record<string, EntryRef[]>>({});

	useEffect(() => {
		void apiData<Byline[]>("GET", "/api/data/bylines")
			.then(setBylines)
			.catch(() => undefined);
		void apiData<Taxonomy[]>("GET", "/api/data/taxonomies")
			.then(setTaxonomies)
			.catch(() => undefined);
	}, []);

	const wantsSections = Object.values(fields).some((f) => kindOf(f) === "section");
	useEffect(() => {
		if (!wantsSections) return;
		void apiData<Section[]>("GET", "/api/data/sections")
			.then(setSections)
			.catch(() => undefined);
	}, [wantsSections]);

	useEffect(() => {
		for (const [name, field] of Object.entries(fields)) {
			if (typeof field === "string" || field.type !== "reference" || !field.collection) continue;
			void apiData<EntryRef[]>("GET", `/api/content/${field.collection}`)
				.then((entries) => setReferences((prev) => ({ ...prev, [name]: entries })))
				.catch(() => undefined);
		}
	}, [fields]);

	return (
		<div className="grid gap-4">
			{Object.entries(fields).map(([name, field]) => {
				const kind = kindOf(field);
				if (typeof field === "object" && field.showIf && data[field.showIf.field] !== field.showIf.equals) return null;
				const options: { taxonomy?: string; collection?: string; multiple?: boolean } =
					typeof field === "string" ? {} : field;
				const multiple = typeof field === "object" && field.multiple === true;
				const value = data[name];

				if (kind === "select") {
					const choices = typeof field === "object" ? (field.options ?? []) : [];
					return (
						<Select
							key={name}
							label={name}
							value={typeof value === "string" ? value : ""}
							onChange={(e) => onChange(name, e.target.value || undefined)}
						>
							<option value="">—</option>
							{choices.map((choice) => (
								<option key={choice} value={choice}>
									{choice}
								</option>
							))}
						</Select>
					);
				}
				if (kind === "json" || kind === "repeater" || kind === "blocks") {
					return <JsonField key={name} name={name} value={value} onChange={(v) => onChange(name, v)} />;
				}
				if (kind === "boolean") {
					return (
						<Checkbox
							key={name}
							label={name}
							checked={value === true}
							onChange={(e) => onChange(name, e.target.checked)}
						/>
					);
				}
				if (kind === "text" || kind === "richText") {
					return (
						<Textarea
							key={name}
							label={name}
							className="min-h-24"
							value={typeof value === "string" ? value : ""}
							onChange={(e) => onChange(name, e.target.value || undefined)}
						/>
					);
				}
				if (kind === "image") {
					return (
						<div key={name} className="grid gap-2">
							<Input
								label={name}
								value={typeof value === "string" ? value : ""}
								onChange={(e) => onChange(name, e.target.value || undefined)}
							/>
							<Button type="button" variant="ghost" size="sm" onClick={() => setPicking(name)}>
								Choose from library
							</Button>
							{onUpload && (
								<Input
									type="file"
									accept="image/png,image/jpeg,image/gif,image/webp"
									aria-label={`Upload ${name}`}
									onChange={(e) => {
										const file = e.target.files?.[0];
										if (file) void onUpload(file).then((url) => onChange(name, url));
									}}
								/>
							)}
							{typeof value === "string" && value.startsWith("/") && (
								<img src={apiUrl(value)} alt="" className="max-h-32 rounded-md object-contain" />
							)}
						</div>
					);
				}
				if (kind === "byline" && multiple) {
					type Credit = { byline: string; role?: string };
					const credits: Credit[] = (Array.isArray(value) ? value : value ? [value] : []).map((v) =>
						typeof v === "string" ? { byline: v } : (v as Credit),
					);
					// A plain slug stays a string until a role is typed.
					const emit = (next: Credit[]) =>
						onChange(name, next.length ? next.map((c) => (c.role ? c : c.byline)) : undefined);
					return (
						<fieldset key={name} className="grid gap-2">
							<legend className="text-sm font-medium">{name}</legend>
							{credits.map((credit, i) => (
								<div key={credit.byline} className="flex items-center gap-2 text-sm">
									<span className="flex-1">{bylines.find((b) => b.slug === credit.byline)?.name ?? credit.byline}</span>
									<Input
										aria-label={`Role of ${credit.byline}`}
										placeholder="Role (author, photographer…)"
										value={credit.role ?? ""}
										onChange={(e) => emit(credits.map((c, j) => (j === i ? { ...c, role: e.target.value } : c)))}
									/>
									<Button
										type="button"
										size="sm"
										variant="ghost"
										aria-label={`Remove ${credit.byline}`}
										onClick={() => emit(credits.filter((_, j) => j !== i))}
									>
										✕
									</Button>
								</div>
							))}
							<Select
								aria-label={`Add ${name}`}
								value=""
								onChange={(e) => e.target.value && emit([...credits, { byline: e.target.value }])}
							>
								<option value="">Add a byline…</option>
								{bylines
									.filter((b) => !credits.some((c) => c.byline === b.slug))
									.map((b) => (
										<option key={b.slug} value={b.slug}>
											{b.name}
										</option>
									))}
							</Select>
						</fieldset>
					);
				}
				if (kind === "byline") {
					return (
						<Select
							key={name}
							label={name}
							value={typeof value === "string" ? value : ""}
							onChange={(e) => onChange(name, e.target.value || undefined)}
						>
							<option value="">—</option>
							{bylines.map((byline) => (
								<option key={byline.slug} value={byline.slug}>
									{byline.name}
								</option>
							))}
						</Select>
					);
				}
				if (kind === "section") {
					const chosen = Array.isArray(value) ? value.map(String) : [];
					const move = (i: number, by: number) => {
						const next = [...chosen];
						const [item] = next.splice(i, 1);
						next.splice(i + by, 0, item!);
						onChange(name, next);
					};
					const title = (slug: string) => sections.find((s) => s.slug === slug)?.title ?? `${slug} (missing)`;
					return (
						<fieldset key={name} className="grid gap-2">
							<legend className="text-sm font-medium">{name}</legend>
							{chosen.map((slug, i) => (
								<div key={slug} className="flex items-center gap-2 text-sm">
									<span className="flex-1">{title(slug)}</span>
									<Button
										type="button"
										size="sm"
										variant="ghost"
										aria-label={`Move ${slug} up`}
										disabled={i === 0}
										onClick={() => move(i, -1)}
									>
										↑
									</Button>
									<Button
										type="button"
										size="sm"
										variant="ghost"
										aria-label={`Move ${slug} down`}
										disabled={i === chosen.length - 1}
										onClick={() => move(i, 1)}
									>
										↓
									</Button>
									<Button
										type="button"
										size="sm"
										variant="ghost"
										aria-label={`Remove ${slug}`}
										onClick={() =>
											onChange(
												name,
												chosen.filter((x) => x !== slug),
											)
										}
									>
										✕
									</Button>
								</div>
							))}
							<Select
								aria-label={`Add ${name}`}
								value=""
								onChange={(e) => e.target.value && onChange(name, [...chosen, e.target.value])}
							>
								<option value="">Add a section…</option>
								{sections
									.filter((s) => !chosen.includes(s.slug))
									.map((s) => (
										<option key={s.slug} value={s.slug}>
											{s.title}
										</option>
									))}
							</Select>
						</fieldset>
					);
				}
				if (kind === "taxonomy") {
					const taxonomy = taxonomies.find((item) => item.name === (options.taxonomy ?? name));
					const terms = taxonomy?.terms ?? [];
					if (multiple) {
						const selected = Array.isArray(value) ? value.map(String) : [];
						return (
							<fieldset key={name} className="grid gap-2">
								<legend className="text-sm font-medium">{name}</legend>
								<div className="flex flex-wrap gap-3">
									{terms.map((term) => (
										<Checkbox
											key={term.slug}
											label={term.name}
											checked={selected.includes(term.slug)}
											onChange={(e) =>
												onChange(
													name,
													e.target.checked ? [...selected, term.slug] : selected.filter((slug) => slug !== term.slug),
												)
											}
										/>
									))}
								</div>
								{terms.length === 0 && <p className="text-xs text-muted-foreground">No terms defined yet.</p>}
								{taxonomy && (
									<AddTerm
										taxonomy={taxonomy}
										all={taxonomies}
										onAdded={(all, slug) => {
											setTaxonomies(all);
											onChange(name, [...selected, slug]);
										}}
									/>
								)}
							</fieldset>
						);
					}
					return (
						<Select
							key={name}
							label={name}
							value={typeof value === "string" ? value : ""}
							onChange={(e) => onChange(name, e.target.value || undefined)}
						>
							<option value="">—</option>
							{terms.map((term) => (
								<option key={term.slug} value={term.slug}>
									{term.name}
								</option>
							))}
						</Select>
					);
				}
				if (kind === "reference") {
					const entries = references[name] ?? [];
					if (multiple) {
						const selected = Array.isArray(value) ? value.map(String) : [];
						return (
							<fieldset key={name} className="grid gap-2">
								<legend className="text-sm font-medium">{name}</legend>
								<div className="grid gap-1">
									{entries.map((entry) => (
										<Checkbox
											key={entry.slug}
											label={String(entry.data.title ?? entry.slug)}
											checked={selected.includes(entry.slug)}
											onChange={(e) =>
												onChange(
													name,
													e.target.checked ? [...selected, entry.slug] : selected.filter((slug) => slug !== entry.slug),
												)
											}
										/>
									))}
								</div>
							</fieldset>
						);
					}
					return (
						<Select
							key={name}
							label={name}
							value={typeof value === "string" ? value : ""}
							onChange={(e) => onChange(name, e.target.value || undefined)}
						>
							<option value="">—</option>
							{entries.map((entry) => (
								<option key={entry.slug} value={entry.slug}>
									{String(entry.data.title ?? entry.slug)}
								</option>
							))}
						</Select>
					);
				}
				if (kind === "list") {
					return (
						<Input
							key={name}
							label={name}
							placeholder="comma, separated"
							value={Array.isArray(value) ? value.join(", ") : ""}
							onChange={(e) => {
								const items = e.target.value
									.split(",")
									.map((item) => item.trim())
									.filter(Boolean);
								onChange(name, items.length ? items : undefined);
							}}
						/>
					);
				}
				const inputType = kind === "number" ? "number" : kind === "date" ? "date" : "text";
				return (
					<Input
						key={name}
						label={name}
						type={inputType}
						value={value === undefined || value === null ? "" : String(value)}
						onChange={(e) => {
							const raw = e.target.value;
							onChange(name, raw === "" ? undefined : kind === "number" ? Number(raw) : raw);
						}}
					/>
				);
			})}
			<MediaPicker
				open={picking !== null}
				onClose={() => setPicking(null)}
				onPick={([item]) => {
					if (picking && item) onChange(picking, item.url);
					setPicking(null);
				}}
			/>
		</div>
	);
}
