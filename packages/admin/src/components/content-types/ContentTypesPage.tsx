import { useStore } from "@nanostores/react";
import { useEffect, useState } from "react";
import { apiData } from "../../lib/api.ts";
import { $data, $dataErrors, loadData, saveData } from "../../stores/dashboard.ts";
import {
	Button,
	Card,
	Checkbox,
	Dialog,
	EmptyState,
	ErrorText,
	Input,
	PageHeader,
	Select,
	Table,
	Td,
	Textarea,
	Th,
	toast,
} from "../../ui/index.tsx";

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

export const blankType = (): ContentType => ({ name: "", dir: "content/", format: "md", route: "/{slug}", fields: {} });

export function ContentTypesPage() {
	const stored = useStore($data)["content-types"] as ContentType[] | undefined;
	const error = useStore($dataErrors)["content-types"];
	const [items, setItems] = useState<ContentType[]>([]);
	const [editing, setEditing] = useState<ContentType | null>(null);
	const [index, setIndex] = useState<number | null>(null);
	const [asJson, setAsJson] = useState(false);
	const [jsonText, setJsonText] = useState("");
	const [impact, setImpact] = useState<Impact | null>(null);
	const [collections, setCollections] = useState<string[]>([]);

	useEffect(() => {
		void loadData<ContentType[]>("content-types").catch(() => undefined);
		void apiData<Array<{ name: string }>>("GET", "/api/collections")
			.then((all) => setCollections(all.map((c) => c.name)))
			.catch(() => undefined);
	}, []);
	useEffect(() => {
		if (Array.isArray(stored)) setItems(stored);
	}, [stored]);

	const open = (item: ContentType, i: number | null) => {
		setEditing(structuredClone(item));
		setIndex(i);
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
			setItems(
				await saveData(
					"content-types",
					index === null ? [...items, editing] : items.map((x, i) => (i === index ? editing : x)),
				),
			);
			toast("Content types saved. Restart the server to apply them.");
			setEditing(null);
		} catch (e) {
			toast((e as Error).message, "error");
		}
	};

	return (
		<div className="grid gap-4">
			<PageHeader
				title="Content types"
				description="Collections and their fields. Changes apply after the server restarts."
				actions={<Button onClick={() => open(blankType(), null)}>+ New content type</Button>}
			/>
			<ErrorText>{error}</ErrorText>
			<Card>
				{items.length === 0 ? (
					<div className="p-4">
						<EmptyState title="No custom content types yet" />
					</div>
				) : (
					<Table>
						<thead>
							<tr>
								<Th>Name</Th>
								<Th>Directory</Th>
								<Th>Format</Th>
								<Th>Route</Th>
								<Th>Fields</Th>
								<Th />
							</tr>
						</thead>
						<tbody>
							{items.map((item, i) => (
								<tr key={item.name} className="hover:bg-secondary">
									<Td>{item.name}</Td>
									<Td>{item.dir}</Td>
									<Td>{item.format}</Td>
									<Td>{item.route}</Td>
									<Td>{Object.keys(item.fields).length}</Td>
									<Td className="whitespace-nowrap text-end">
										<Button size="sm" variant="ghost" onClick={() => open(item, i)}>
											Edit
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => {
												if (confirm(`Remove the "${item.name}" type? Its files stay on disk.`))
													void saveData(
														"content-types",
														items.filter((_, j) => j !== i),
													).catch((e: Error) => toast(e.message, "error"));
											}}
										>
											Delete
										</Button>
									</Td>
								</tr>
							))}
						</tbody>
					</Table>
				)}
			</Card>

			<Dialog
				open={!!editing}
				title={index === null ? "New content type" : `Edit ${editing?.name ?? ""}`}
				onClose={() => setEditing(null)}
				footer={
					<>
						<Button variant="ghost" onClick={() => void check()}>
							Check impact
						</Button>
						<Button variant="ghost" onClick={() => setEditing(null)}>
							Cancel
						</Button>
						<Button onClick={() => void save()}>Save</Button>
					</>
				}
			>
				{editing && (
					<div className="grid gap-3">
						<Input
							label="Name"
							value={editing.name}
							disabled={index !== null}
							onChange={(e) => setEditing({ ...editing, name: e.target.value })}
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
					</div>
				)}
			</Dialog>
		</div>
	);
}
