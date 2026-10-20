import { Copy, Plus, Trash2 } from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { api, apiData, slugPath } from "../../lib/api.ts";
import {
	$collections,
	$contentError,
	deleteEntry,
	duplicateEntry,
	loadCollections,
	setEntryDraft,
	type EntrySummary,
} from "../../stores/content.ts";
import { slugifyTitle } from "../../lib/slug.ts";
import { newEntry } from "../../stores/editor.ts";
import {
	Badge,
	Button,
	Card,
	Checkbox,
	DataPagination,
	Dialog,
	EmptyState,
	ErrorText,
	Input,
	PageHeader,
	Select,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../../ui/index.tsx";

const TONES = { published: "success", draft: "warning", scheduled: "accent" } as const;
const DEFAULT_PAGE_SIZE = 20;

type Row = EntrySummary & { status: keyof typeof TONES };
interface Page {
	data: Row[];
	total: number;
	nextCursor: string | null;
}
interface Filters {
	q: string;
	status: string;
	sort: string;
	author: string;
	lang: string;
	from: string;
	to: string;
}
const NO_FILTERS: Filters = { q: "", status: "", sort: "-modified", author: "", lang: "", from: "", to: "" };

/** Query string for the list API: only filters that are set, dates widened to whole days. */
export function listQuery(f: Filters, page = 1, pageSize = DEFAULT_PAGE_SIZE): string {
	const params = new URLSearchParams({
		limit: String(pageSize),
		offset: String((Math.max(page, 1) - 1) * pageSize),
		sort: f.sort,
	});
	for (const key of ["q", "status", "author", "lang"] as const) if (f[key].trim()) params.set(key, f[key].trim());
	if (f.from) params.set("from", `${f.from}T00:00:00.000Z`);
	if (f.to) params.set("to", `${new Date(new Date(`${f.to}T00:00:00.000Z`).getTime() + 86_400_000).toISOString()}`);
	return params.toString();
}

export function EntriesPage() {
	const { collection } = useParams({ from: "/c/$collection" });
	const collections = useStore($collections);
	const error = useStore($contentError);
	const [filters, setFilters] = useState<Filters>(NO_FILTERS);
	const [rows, setRows] = useState<Row[]>([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
	const [loading, setLoading] = useState(true);
	const [listError, setListError] = useState<string | null>(null);
	const [bylines, setBylines] = useState<Array<{ slug: string; name: string }>>([]);
	const [locales, setLocales] = useState<string[]>([]);
	const [createOpen, setCreateOpen] = useState(false);
	const [title, setTitle] = useState("");
	const [slug, setSlug] = useState("");
	const [slugEdited, setSlugEdited] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);
	const [selected, setSelected] = useState<string[]>([]);
	const navigate = useNavigate();
	const info = collections.find((c) => c.name === collection);
	const label = collection.charAt(0).toUpperCase() + collection.slice(1);

	const fetchPage = useCallback(
		async (target: number) => {
			setLoading(true);
			try {
				const result = await api<Page>("GET", `/api/content/${collection}?${listQuery(filters, target, pageSize)}`);
				setRows(result.data);
				setTotal(result.total);
				setListError(null);
			} catch (e) {
				setListError((e as Error).message);
			}
			setLoading(false);
		},
		[collection, filters, pageSize],
	);
	const reload = () => fetchPage(page);

	useEffect(() => {
		setPage(1);
		setSelected([]);
		void loadCollections();
		void apiData<Array<{ slug: string; name: string }>>("GET", "/api/data/bylines")
			.then(setBylines)
			.catch(() => undefined);
		void api<{ locales: string[] }>("GET", `/api/i18n/${collection}`)
			.then((r) => setLocales(r.locales))
			.catch(() => undefined);
	}, [collection]);

	// Typing in the search box should not fire a request per key.
	useEffect(() => {
		const timer = setTimeout(() => void fetchPage(page), filters.q ? 250 : 0);
		return () => clearTimeout(timer);
	}, [fetchPage, filters.q, page]);
	const pageCount = Math.max(1, Math.ceil(total / pageSize));
	useEffect(() => {
		if (page > pageCount) setPage(pageCount);
	}, [page, pageCount]);
	const filtersActive = JSON.stringify({ ...filters, sort: "" }) !== JSON.stringify({ ...NO_FILTERS, sort: "" });
	const set = (patch: Partial<Filters>) => {
		setFilters((f) => ({ ...f, ...patch }));
		setPage(1);
		setSelected([]);
	};

	const openCreate = () => {
		setTitle("");
		setSlug("");
		setSlugEdited(false);
		setCreateError(null);
		setCreateOpen(true);
	};

	const changeTitle = (value: string) => {
		setTitle(value);
		if (!slugEdited) setSlug(slugifyTitle(value));
		setCreateError(null);
	};

	const changeSlug = (value: string) => {
		setSlug(value);
		setSlugEdited(value.trim().length > 0);
		setCreateError(null);
	};

	const create = async () => {
		const nextSlug = slug.trim();
		const nextTitle = title.trim();
		if (!nextSlug) {
			setCreateError("Enter a title or slug.");
			return;
		}
		// The list is paged, so ask the server whether the slug is taken.
		const taken = await apiData("GET", `/api/content/${collection}/${slugPath(nextSlug)}`).then(
			() => true,
			() => false,
		);
		if (taken) {
			setCreateError("An entry with this slug already exists.");
			return;
		}
		setCreateError(null);
		newEntry(collection, nextSlug, nextTitle && info?.fields.title ? { title: nextTitle } : {});
		setTitle("");
		setSlug("");
		setSlugEdited(false);
		setCreateOpen(false);
		void navigate({ to: "/e/$collection/$", params: { collection, _splat: nextSlug } });
	};

	return (
		<div className="grid gap-4">
			<PageHeader
				title={label}
				description={`${total} entries in ${info?.dir ?? collection}`}
				actions={
					<>
						<Link to="/t/$collection" params={{ collection }} className="contents">
							<Button variant="secondary">Translations</Button>
						</Link>
						<Button onClick={openCreate}>
							<Plus size={14} /> New {label.toLowerCase().replace(/s$/, "")}
						</Button>
					</>
				}
			/>
			<ErrorText>{createError ?? listError ?? error}</ErrorText>
			<div className="flex flex-wrap items-end gap-2">
				<Input
					label="Search"
					placeholder="Title, slug or text"
					value={filters.q}
					onChange={(e) => set({ q: e.target.value })}
				/>
				<Select label="Status" value={filters.status} onChange={(e) => set({ status: e.target.value })}>
					<option value="">All</option>
					<option value="published">Published</option>
					<option value="draft">Draft</option>
					<option value="scheduled">Scheduled</option>
				</Select>
				<Select label="Sort" value={filters.sort} onChange={(e) => set({ sort: e.target.value })}>
					<option value="-modified">Recently modified</option>
					<option value="modified">Least recently modified</option>
					<option value="title">Title A–Z</option>
					<option value="-title">Title Z–A</option>
					<option value="slug">Slug</option>
				</Select>
				{bylines.length > 0 && (
					<Select label="Author" value={filters.author} onChange={(e) => set({ author: e.target.value })}>
						<option value="">Anyone</option>
						{bylines.map((b) => (
							<option key={b.slug} value={b.slug}>
								{b.name}
							</option>
						))}
					</Select>
				)}
				{locales.length > 0 && (
					<Select label="Language" value={filters.lang} onChange={(e) => set({ lang: e.target.value })}>
						<option value="">All</option>
						{locales.map((l) => (
							<option key={l} value={l}>
								{l}
							</option>
						))}
					</Select>
				)}
				<Input label="Modified from" type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} />
				<Input label="Modified to" type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} />
				<Input
					label="New entry title"
					placeholder="My first post"
					value={title}
					onChange={(e) => changeTitle(e.target.value)}
				/>
				<Input
					label="New entry slug"
					placeholder="my-first-post"
					value={slug}
					onChange={(e) => changeSlug(e.target.value)}
				/>
				<Button onClick={() => void create()} disabled={!/^[a-z0-9][a-z0-9/_.-]*$/i.test(slug)}>
					Create
				</Button>
			</div>

			<Card className="overflow-hidden">
				{selected.length > 0 && (
					<div className="flex flex-wrap items-center gap-2 border-b border-border p-2 text-sm">
						<span>{selected.length} selected</span>
						<Button
							size="sm"
							onClick={() =>
								void Promise.all(selected.map((s) => setEntryDraft(collection, s, false))).then(
									() => (setSelected([]), reload()),
								)
							}
						>
							Publish
						</Button>
						<Button
							size="sm"
							variant="secondary"
							onClick={() =>
								void Promise.all(selected.map((s) => setEntryDraft(collection, s, true))).then(
									() => (setSelected([]), reload()),
								)
							}
						>
							Unpublish
						</Button>
						<Button
							size="sm"
							variant="destructive"
							onClick={() => {
								if (!confirm(`Delete ${selected.length} entries? Git history keeps them recoverable.`)) return;
								void Promise.all(selected.map((s) => deleteEntry(collection, s))).then(
									() => (setSelected([]), reload()),
								);
							}}
						>
							Delete
						</Button>
					</div>
				)}
				{rows.length === 0 ? (
					<div className="p-4">
						<EmptyState
							title={loading ? "Loading…" : filtersActive ? "No matches" : `No ${collection} yet`}
							description={filtersActive ? "Try different filters." : "Create the first entry."}
							action={<Button onClick={openCreate}>+ New entry</Button>}
						/>
					</div>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-12" />
								<TableHead className="min-w-56">Title</TableHead>
								<TableHead className="min-w-40">Slug</TableHead>
								<TableHead className="w-28">Author</TableHead>
								<TableHead className="w-20">Lang</TableHead>
								<TableHead className="w-28">Status</TableHead>
								<TableHead className="w-36">Modified</TableHead>
								<TableHead className="w-52" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((entry) => {
								return (
									<TableRow key={entry.slug}>
										<TableCell className="w-12">
											<Checkbox
												aria-label={`Select ${entry.slug}`}
												checked={selected.includes(entry.slug)}
												onChange={() =>
													setSelected((ids) =>
														ids.includes(entry.slug) ? ids.filter((id) => id !== entry.slug) : [...ids, entry.slug],
													)
												}
											/>
										</TableCell>
										<TableCell>
											<Link
												to="/e/$collection/$"
												params={{ collection, _splat: entry.slug }}
												className="font-medium text-primary hover:underline"
											>
												{String(entry.data.title ?? entry.slug)}
											</Link>
										</TableCell>
										<TableCell className="text-muted-foreground">{entry.slug}</TableCell>
										<TableCell className="text-muted-foreground">{String(entry.data.author ?? "")}</TableCell>
										<TableCell className="text-muted-foreground">
											{entry.slug.includes("/") ? entry.slug.split("/")[0] : ""}
										</TableCell>
										<TableCell>
											<Badge tone={TONES[entry.status]}>{entry.status}</Badge>
										</TableCell>
										<TableCell className="text-muted-foreground" title={new Date(entry.modified).toLocaleString()}>
											{new Date(entry.modified).toLocaleDateString(undefined, {
												year: "numeric",
												month: "short",
												day: "numeric",
											})}
										</TableCell>
										<TableCell className="whitespace-nowrap text-end">
											<Button
												variant="ghost"
												size="sm"
												onClick={() => void duplicateEntry(collection, entry.slug).then(reload)}
											>
												<Copy size={14} /> Duplicate
											</Button>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => {
													if (confirm(`Delete ${entry.slug}? It stays recoverable in the trash.`))
														void deleteEntry(collection, entry.slug).then(reload);
												}}
											>
												<Trash2 size={14} /> Delete
											</Button>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				)}
				{total > 0 && (
					<DataPagination
						page={page}
						pageCount={pageCount}
						pageSize={pageSize}
						total={total}
						onPageChange={(nextPage) => {
							setPage(nextPage);
							setSelected([]);
						}}
						onPageSizeChange={(nextSize) => {
							setPageSize(nextSize);
							setPage(1);
							setSelected([]);
						}}
					/>
				)}
			</Card>

			<Dialog
				open={createOpen}
				title={`New ${label.toLowerCase().replace(/s$/, "")}`}
				onClose={() => setCreateOpen(false)}
				footer={
					<>
						<Button variant="ghost" onClick={() => setCreateOpen(false)}>
							Cancel
						</Button>
						<Button onClick={() => void create()} disabled={!/^[a-z0-9][a-z0-9/_.-]*$/i.test(slug)}>
							Create
						</Button>
					</>
				}
			>
				<Input label="Title" placeholder="My first post" value={title} onChange={(e) => changeTitle(e.target.value)} />
				<Input
					label="Slug"
					placeholder="my-first-post"
					value={slug}
					onChange={(e) => changeSlug(e.target.value)}
					hint="Generated from the title until you edit it. Lowercase letters, numbers, /, ., _ and -"
				/>
				<ErrorText>{createError}</ErrorText>
			</Dialog>
		</div>
	);
}
