import { useEffect, useState } from "react";
import { apiData } from "../../lib/api.ts";
import type { FieldDef } from "../../stores/content.ts";
import { Checkbox, Input, Select, Textarea } from "../../ui/index.tsx";

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
}
interface EntryRef {
	slug: string;
	data: Record<string, unknown>;
}

const kindOf = (field: FieldDef) => (typeof field === "string" ? field : field.type);

export function FieldsForm({ fields, data, onChange, onUpload }: Props) {
	const [bylines, setBylines] = useState<Byline[]>([]);
	const [taxonomies, setTaxonomies] = useState<Taxonomy[]>([]);
	const [references, setReferences] = useState<Record<string, EntryRef[]>>({});

	useEffect(() => {
		void apiData<Byline[]>("GET", "/api/data/bylines").then(setBylines).catch(() => undefined);
		void apiData<Taxonomy[]>("GET", "/api/data/taxonomies").then(setTaxonomies).catch(() => undefined);
	}, []);

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
				const options: { taxonomy?: string; collection?: string; multiple?: boolean } =
					typeof field === "string" ? {} : field;
				const multiple = typeof field === "object" && field.multiple === true;
				const value = data[name];

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
				if (kind === "text") {
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
								<img src={value} alt="" className="max-h-32 rounded-md object-contain" />
							)}
						</div>
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
													e.target.checked
														? [...selected, term.slug]
														: selected.filter((slug) => slug !== term.slug),
												)
											}
										/>
									))}
								</div>
								{terms.length === 0 && <p className="text-xs text-muted-foreground">No terms defined yet.</p>}
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
													e.target.checked
														? [...selected, entry.slug]
														: selected.filter((slug) => slug !== entry.slug),
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
		</div>
	);
}
