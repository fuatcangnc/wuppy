import { useStore } from "@nanostores/react";
import { useCallback, useEffect, useState } from "react";
import { apiData } from "../../lib/api.ts";
import { slugifyTitle } from "../../lib/slug.ts";
import { $data, loadData, saveData } from "../../stores/dashboard.ts";
import { Badge, Button, Card, Dialog, Input, Select, Table, Td, Textarea, Th, toast } from "../../ui/index.tsx";

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

export function TermManager() {
	const taxonomies = (useStore($data).taxonomies as Taxonomy[] | undefined) ?? [];
	const [current, setCurrent] = useState("");
	const [counts, setCounts] = useState<Counts>({});
	const [editing, setEditing] = useState<{ term: Term; original?: string; translations: string } | null>(null);
	const [merging, setMerging] = useState<{ term: Term; into: string } | null>(null);

	const reload = useCallback(async () => {
		await loadData<Taxonomy[]>("taxonomies").catch(() => undefined);
		setCounts(await apiData<Counts>("GET", "/api/taxonomies/counts").catch(() => ({})));
	}, []);
	useEffect(() => void reload(), [reload]);

	const taxonomy = taxonomies.find((t) => t.name === current) ?? taxonomies[0];
	if (!taxonomy) return null;
	const rows = flatten(taxonomy.terms);
	const countOf = (slug: string) => counts[taxonomy.name]?.[slug] ?? { total: 0, published: 0 };

	const saveTerms = async (terms: Term[]) => {
		try {
			await saveData(
				"taxonomies",
				taxonomies.map((t) => (t.name === taxonomy.name ? { ...t, terms } : t)),
			);
			await reload();
			return true;
		} catch (e) {
			toast((e as Error).message, "error");
			return false;
		}
	};
	const act = async (path: string, body: unknown, done: string) => {
		try {
			const { changed } = await apiData<{ changed: number }>("POST", path, body);
			toast(`${done} (${changed} entries updated)`);
			await reload();
		} catch (e) {
			toast((e as Error).message, "error");
		}
	};
	const base = `/api/taxonomies/${encodeURIComponent(taxonomy.name)}/terms`;

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
			// A slug change must retag entries, so it goes through rename.
			await act(`${base}/${encodeURIComponent(original)}/rename`, { to: next.slug }, "Renamed");
			next.parent = next.parent === original ? next.slug : next.parent;
		}
		const terms = original
			? taxonomy.terms.map((t) => (t.slug === original || t.slug === next.slug ? next : t))
			: [...taxonomy.terms, next];
		if (await saveTerms(terms)) setEditing(null);
	};

	return (
		<Card>
			<div className="grid gap-3 p-4">
				<div className="flex items-end justify-between gap-3">
					<Select label="Terms of" value={taxonomy.name} onChange={(e) => setCurrent(e.target.value)}>
						{taxonomies.map((t) => (
							<option key={t.name} value={t.name}>
								{t.label || t.name}
							</option>
						))}
					</Select>
					<Button onClick={() => setEditing({ term: blank(), translations: "{}" })}>+ New term</Button>
				</div>
				<Table>
					<thead>
						<tr>
							<Th>Term</Th>
							<Th>Slug</Th>
							<Th>Entries</Th>
							<Th />
						</tr>
					</thead>
					<tbody>
						{rows.map(({ term, depth }) => {
							const n = countOf(term.slug);
							return (
								<tr key={term.slug} className="hover:bg-secondary">
									<Td style={{ paddingInlineStart: `${depth * 1.25 + 0.75}rem` }}>{term.name}</Td>
									<Td>{term.slug}</Td>
									<Td>
										<Badge>{n.total}</Badge> {n.published !== n.total && `(${n.published} published)`}
									</Td>
									<Td className="whitespace-nowrap text-end">
										<Button
											size="sm"
											variant="ghost"
											onClick={() =>
												setEditing({
													term: structuredClone(term),
													original: term.slug,
													translations: JSON.stringify(term.translations, null, 2),
												})
											}
										>
											Edit
										</Button>
										<Button size="sm" variant="ghost" onClick={() => setMerging({ term, into: "" })}>
											Merge
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => {
												const used = n.total > 0 ? ` ${n.total} entries still use it.` : "";
												if (confirm(`Delete "${term.name}"?${used}`))
													void saveTerms(taxonomy.terms.filter((t) => t.slug !== term.slug));
											}}
										>
											Delete
										</Button>
									</Td>
								</tr>
							);
						})}
					</tbody>
				</Table>
			</div>

			<Dialog
				open={!!editing}
				title={editing?.original ? "Edit term" : "New term"}
				onClose={() => setEditing(null)}
				footer={
					<>
						<Button variant="ghost" onClick={() => setEditing(null)}>
							Cancel
						</Button>
						<Button onClick={() => void submit()}>Save</Button>
					</>
				}
			>
				{editing && (
					<div className="grid gap-3">
						<Input
							label="Name"
							value={editing.term.name}
							onChange={(e) => setEditing({ ...editing, term: { ...editing.term, name: e.target.value } })}
						/>
						<Input
							label="Slug"
							hint={editing.original ? "Changing it updates every entry that uses the term." : "Defaults to the name."}
							value={editing.term.slug}
							placeholder={slugifyTitle(editing.term.name)}
							onChange={(e) => setEditing({ ...editing, term: { ...editing.term, slug: e.target.value } })}
						/>
						<Input
							label="Description"
							value={editing.term.description}
							onChange={(e) => setEditing({ ...editing, term: { ...editing.term, description: e.target.value } })}
						/>
						{taxonomy.hierarchical && (
							<Select
								label="Parent"
								value={editing.term.parent ?? ""}
								onChange={(e) =>
									setEditing({ ...editing, term: { ...editing.term, parent: e.target.value || undefined } })
								}
							>
								<option value="">None</option>
								{taxonomy.terms
									.filter((t) => t.slug !== editing.original)
									.map((t) => (
										<option key={t.slug} value={t.slug}>
											{t.name}
										</option>
									))}
							</Select>
						)}
						<Input
							label="Order"
							type="number"
							value={editing.term.order}
							onChange={(e) =>
								setEditing({ ...editing, term: { ...editing.term, order: Number(e.target.value) || 0 } })
							}
						/>
						<Textarea
							label="Translations (JSON)"
							hint='{"tr": {"name": "…", "description": ""}}'
							value={editing.translations}
							onChange={(e) => setEditing({ ...editing, translations: e.target.value })}
						/>
					</div>
				)}
			</Dialog>

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
						onChange={(e) => setMerging({ ...merging, into: e.target.value })}
					>
						<option value="">Choose a term</option>
						{taxonomy.terms
							.filter((t) => t.slug !== merging.term.slug)
							.map((t) => (
								<option key={t.slug} value={t.slug}>
									{t.name}
								</option>
							))}
					</Select>
				)}
			</Dialog>
		</Card>
	);
}
