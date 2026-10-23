import {
	ChevronLeft,
	ChevronRight,
	CircleAlert,
	CircleCheck,
	Clock,
	Columns2,
	Copy,
	ExternalLink,
	Eye,
	FileText,
	Languages,
	MessageSquare,
	Pencil,
	Plus,
	Search,
	Settings,
	SlidersHorizontal,
	Table as TableIcon,
	Trash2,
	UserRound,
	WandSparkles,
	X,
} from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, apiData, slugPath } from "../../../lib/api.ts";
import { slugifyTitle } from "../../../lib/slug.ts";
import { $collections, deleteEntry, duplicateEntry, loadCollections, setEntryDraft } from "../../../stores/content.ts";
import { newEntry } from "../../../stores/editor.ts";
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
	Select,
	Separator,
	Spinner,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
	toast,
} from "../../../ui/index.tsx";
import { ActionMenu, type ActionMenuItem } from "../../shared/ActionMenu.tsx";
import { WorkspaceLayout, WorkspacePanel, WorkspaceSidebar } from "../../shared/WorkspaceLayout.tsx";
import { listQuery, NO_FILTERS, TONES, type ContentListPage, type Filters, type Row } from "../list.ts";

const CONTENT_FILTERS: Filters = { ...NO_FILTERS, sort: "title" };
const STATUS_LABEL = { published: "Published", draft: "Draft", scheduled: "Scheduled" } as const;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
const COLUMN_OPTIONS = [
	{ id: "author", label: "Author" },
	{ id: "comments", label: "Comments" },
	{ id: "modified", label: "Modified" },
] as const;

type View = "split" | "table";
type Columns = Record<(typeof COLUMN_OPTIONS)[number]["id"], boolean>;
const DEFAULT_COLUMNS: Columns = { author: true, comments: true, modified: true };

const titleOf = (row: Row) => String(row.data.title || row.slug);
const authorOf = (row: Row, bylines: Array<{ slug: string; name: string }>) => {
	const author = row.data.author;
	if (typeof author !== "string" || !author) return "—";
	return bylines.find((byline) => byline.slug === author)?.name ?? author;
};
const localeOf = (row: Row, locales: string[]) => {
	const prefix = row.slug.split("/")[0] ?? "";
	return row.slug.includes("/") && locales.includes(prefix) ? prefix : "";
};
const dateOf = (iso: string) =>
	new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
const relativeTime = (iso: string) => {
	const date = new Date(iso).getTime();
	if (Number.isNaN(date)) return "—";
	const diff = date - Date.now();
	const units = [
		[31_536_000_000, "year"],
		[2_592_000_000, "month"],
		[604_800_000, "week"],
		[86_400_000, "day"],
		[3_600_000, "hour"],
		[60_000, "minute"],
	] as const;
	const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
	for (const [size, unit] of units) {
		if (Math.abs(diff) >= size) return formatter.format(Math.round(diff / size), unit);
	}
	return "just now";
};
const absoluteUrl = (path: string) => new URL(path, window.location.origin).href;
const previewPath = (route: string | undefined, slug: string) => (route ?? "/{slug}").replace("{slug}", slug);

export function ContentWorkspacePage({ collection }: { collection: string }) {
	const collections = useStore($collections);
	const info = collections.find((candidate) => candidate.name === collection);
	const label = collection.charAt(0).toUpperCase() + collection.slice(1);
	const singular = label.replace(/s$/, "");
	const navigate = useNavigate();
	const [filters, setFilters] = useState<Filters>(CONTENT_FILTERS);
	const [rows, setRows] = useState<Row[]>([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const [loading, setLoading] = useState(true);
	const [listError, setListError] = useState<string | null>(null);
	const [bylines, setBylines] = useState<Array<{ slug: string; name: string }>>([]);
	const [locales, setLocales] = useState<string[]>([]);
	const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
	const [counts, setCounts] = useState({ all: 0, published: 0, draft: 0, scheduled: 0 });
	const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
	const [picked, setPicked] = useState<string[]>([]);
	const [view, setView] = useState<View>("split");
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [bulkOpen, setBulkOpen] = useState(false);
	const [columns, setColumns] = useState<Columns>(DEFAULT_COLUMNS);
	const [createOpen, setCreateOpen] = useState(false);
	const [title, setTitle] = useState("");
	const [slug, setSlug] = useState("");
	const [slugEdited, setSlugEdited] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [previewLoading, setPreviewLoading] = useState(false);
	const [previewError, setPreviewError] = useState<string | null>(null);

	const fetchPage = useCallback(
		async (target: number) => {
			setLoading(true);
			try {
				const result = await api<ContentListPage>(
					"GET",
					`/api/content/${collection}?${listQuery(filters, target, pageSize)}`,
				);
				setRows(Array.isArray(result.data) ? result.data : []);
				setTotal(typeof result.total === "number" ? result.total : 0);
				setListError(null);
			} catch (error) {
				setListError((error as Error).message);
			}
			setLoading(false);
		},
		[filters, pageSize],
	);

	const loadCounts = useCallback(async () => {
		const count = async (status: string) => {
			try {
				const result = await api<ContentListPage>(
					"GET",
					`/api/content/${collection}?limit=1&sort=title${status ? `&status=${status}` : ""}`,
				);
				return typeof result.total === "number" ? result.total : 0;
			} catch {
				return 0;
			}
		};
		const [all, published, draft, scheduled] = await Promise.all([
			count(""),
			count("published"),
			count("draft"),
			count("scheduled"),
		]);
		setCounts({ all, published, draft, scheduled });
	}, []);

	const loadComments = useCallback(async () => {
		try {
			const result = await apiData<Array<{ collection: string; slug: string; pending: number; approved: number }>>(
				"GET",
				"/api/comments/entries",
			);
			const next: Record<string, number> = {};
			for (const comment of Array.isArray(result) ? result : []) {
				if (comment.collection !== collection) continue;
				next[comment.slug] = (comment.pending ?? 0) + (comment.approved ?? 0);
			}
			setCommentCounts(next);
		} catch {
			setCommentCounts({});
		}
	}, []);

	useEffect(() => {
		void loadCollections();
		void apiData<Array<{ slug: string; name: string }>>("GET", "/api/data/bylines")
			.then((value) => setBylines(Array.isArray(value) ? value : []))
			.catch(() => setBylines([]));
		void api<{ locales: string[] }>("GET", `/api/i18n/${collection}`)
			.then((value) => setLocales(Array.isArray(value.locales) ? value.locales : []))
			.catch(() => setLocales([]));
		void loadCounts();
		void loadComments();
	}, [loadComments, loadCounts]);

	// Typing in the search box should not fire a request per key.
	useEffect(() => {
		const timer = setTimeout(() => void fetchPage(page), filters.q ? 250 : 0);
		return () => clearTimeout(timer);
	}, [fetchPage, filters.q, page]);

	const pageCount = Math.max(1, Math.ceil(total / pageSize));
	const currentPage = Math.min(page, pageCount);
	useEffect(() => {
		if (page > pageCount) setPage(pageCount);
	}, [page, pageCount]);
	useEffect(() => {
		if (selectedSlug && !rows.some((row) => row.slug === selectedSlug)) setSelectedSlug(null);
	}, [rows, selectedSlug]);

	const selected = rows.find((row) => row.slug === selectedSlug) ?? null;
	const viewUrl = selected ? absoluteUrl(previewPath(info?.route, selected.slug)) : "";
	const showTree = collection === "pages";
	const childCounts = useMemo(() => {
		const next = new Map<string, number>();
		if (!showTree) return next;
		for (const row of rows) {
			const parts = row.slug.split("/");
			for (let index = 1; index < parts.length; index++) {
				const parent = parts.slice(0, index).join("/");
				next.set(parent, (next.get(parent) ?? 0) + 1);
			}
		}
		return next;
	}, [rows, showTree]);

	const reload = useCallback(async () => {
		await fetchPage(page);
		void loadCounts();
		void loadComments();
	}, [fetchPage, page, loadComments, loadCounts]);

	const setFiltersAndReset = (patch: Partial<Filters>) => {
		setFilters((current) => ({ ...current, ...patch }));
		setPage(1);
		setPicked([]);
		setSelectedSlug(null);
	};

	const setStatus = (status: string) => setFiltersAndReset({ status });
	const sortDescending = filters.sort.startsWith("-");
	const sortBy = filters.sort.replace(/^-/, "");
	const setSort = (nextBy: string, descending: boolean) =>
		setFiltersAndReset({ sort: `${descending ? "-" : ""}${nextBy}` });

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
		setCreateOpen(false);
		void navigate({ to: "/e/$collection/$", params: { collection, _splat: nextSlug } });
	};

	const editPage = (pageSlug: string) =>
		void navigate({ to: "/e/$collection/$", params: { collection, _splat: pageSlug } });

	const openPreview = (row: Row) => {
		const fallback = absoluteUrl(previewPath(info?.route, row.slug));
		// Open blank synchronously so the browser treats this as part of the click,
		// then point it at the signed preview once the API responds.
		const tab = window.open("about:blank", "_blank");
		if (tab) tab.opener = null;
		const open = (url: string) => {
			if (tab) tab.location.href = url;
			else window.open(url, "_blank", "noopener");
		};
		void api<{ data: { url: string } }>("GET", `/api/preview-link/${collection}/${slugPath(row.slug)}`)
			.then((result) => open(result.data?.url ? absoluteUrl(result.data.url) : fallback))
			.catch(() => open(fallback));
	};

	const duplicatePage = async (pageSlug: string) => {
		try {
			const copy = await duplicateEntry(collection, pageSlug);
			await reload();
			setSelectedSlug(copy);
			toast(`${singular} duplicated`);
		} catch (error) {
			toast((error as Error).message, "error");
		}
	};

	const removePage = async (pageSlug: string) => {
		if (!confirm(`Delete ${pageSlug}? It stays recoverable in the trash.`)) return;
		try {
			await deleteEntry(collection, pageSlug);
			if (selectedSlug === pageSlug) setSelectedSlug(null);
			setPicked((current) => current.filter((value) => value !== pageSlug));
			await reload();
			toast("Moved to trash");
		} catch (error) {
			toast((error as Error).message, "error");
		}
	};

	const toggleDraft = async (row: Row) => {
		try {
			await setEntryDraft(collection, row.slug, row.status !== "draft");
			await reload();
			toast(row.status === "draft" ? "Published" : "Moved to drafts");
		} catch (error) {
			toast((error as Error).message, "error");
		}
	};

	const actionsFor = (row: Row): ActionMenuItem[] => {
		const isDraft = row.status === "draft";
		return [
			{ label: "Edit", icon: <Pencil size="1em" />, onSelect: () => editPage(row.slug) },
			{
				label: "View",
				icon: <Eye size="1em" />,
				onSelect: () => openPreview(row),
			},
			{
				label: isDraft ? "Publish" : "Unpublish",
				icon: isDraft ? <CircleCheck size="1em" /> : <CircleAlert size="1em" />,
				onSelect: () => void toggleDraft(row),
			},
			{ label: "Duplicate", icon: <Copy size="1em" />, onSelect: () => void duplicatePage(row.slug) },
			{
				label: "Delete",
				icon: <Trash2 size="1em" />,
				destructive: true,
				onSelect: () => void removePage(row.slug),
			},
		];
	};

	const bulkSetDraft = async (draft: boolean) => {
		if (!picked.length) return;
		try {
			await Promise.all(picked.map((pageSlug) => setEntryDraft(collection, pageSlug, draft)));
			setPicked([]);
			setBulkOpen(false);
			await reload();
			toast(draft ? "Moved to drafts" : "Published");
		} catch (error) {
			toast((error as Error).message, "error");
		}
	};
	const bulkDelete = async () => {
		if (!picked.length || !confirm(`Delete ${picked.length} ${collection}? Git history keeps them recoverable.`))
			return;
		try {
			await Promise.all(picked.map((pageSlug) => deleteEntry(collection, pageSlug)));
			setPicked([]);
			setBulkOpen(false);
			setSelectedSlug(null);
			await reload();
			toast("Moved to trash");
		} catch (error) {
			toast((error as Error).message, "error");
		}
	};
	const bulkDuplicate = async () => {
		if (!picked.length) return;
		try {
			await Promise.all(picked.map((pageSlug) => duplicateEntry(collection, pageSlug)));
			setPicked([]);
			setBulkOpen(false);
			await reload();
			toast(`${label} duplicated`);
		} catch (error) {
			toast((error as Error).message, "error");
		}
	};

	const allPicked = rows.length > 0 && rows.every((row) => picked.includes(row.slug));
	const toggleAll = () => {
		const slugs = rows.map((row) => row.slug);
		setPicked((current) =>
			allPicked ? current.filter((pageSlug) => !slugs.includes(pageSlug)) : [...new Set([...current, ...slugs])],
		);
	};

	useEffect(() => {
		if (!selected) {
			setPreviewUrl(null);
			setPreviewError(null);
			setPreviewLoading(false);
			return;
		}
		let cancelled = false;
		const fallback = absoluteUrl(previewPath(info?.route, selected.slug));
		setPreviewLoading(true);
		setPreviewError(null);
		void api<{ data: { url: string } }>("GET", `/api/preview-link/${collection}/${slugPath(selected.slug)}`)
			.then((result) => {
				if (cancelled) return;
				if (!result.data?.url) throw new Error("Preview link unavailable");
				setPreviewUrl(absoluteUrl(result.data.url));
			})
			.catch((error: Error) => {
				if (cancelled) return;
				setPreviewUrl(fallback);
				setPreviewError(error.message);
			})
			.finally(() => {
				if (!cancelled) setPreviewLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [selected, info?.route]);

	const switchView = (next: View) => {
		setView(next);
		setPicked([]);
	};
	const commentsOf = (row: Row) => commentCounts[row.slug] ?? 0;
	const commentTotal = selected ? commentsOf(selected) : 0;

	const statusTabs = [
		{ id: "", label: "All", count: counts.all },
		{ id: "published", label: "Published", count: counts.published },
		{ id: "draft", label: "Drafts", count: counts.draft },
		...(counts.scheduled > 0 ? [{ id: "scheduled", label: "Scheduled", count: counts.scheduled }] : []),
	];

	const listRow = (row: Row) => {
		const depth = showTree ? row.slug.split("/").length - 1 : 0;
		const children = childCounts.get(row.slug) ?? 0;
		const status = row.status;
		return (
			<button
				key={row.slug}
				type="button"
				aria-label={`Open ${titleOf(row)}`}
				aria-current={selectedSlug === row.slug ? "true" : undefined}
				onClick={() => setSelectedSlug(row.slug)}
				className={`flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors ${
					selectedSlug === row.slug
						? "border-primary/60 bg-tab text-foreground"
						: "border-transparent text-muted-foreground hover:bg-muted/60"
				}`}
			>
				<span className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
					<FileText size="1em" />
				</span>
				<span className="min-w-0 flex-1" style={{ paddingInlineStart: depth ? Math.min(depth, 3) * 12 : 0 }}>
					<span className="flex min-w-0 items-center gap-1">
						<span className="truncate text-sm font-medium text-foreground">{titleOf(row)}</span>
						{status === "published" ? (
							<CircleCheck size="0.9em" className="shrink-0 text-emerald-500" aria-label="Published" />
						) : status === "draft" ? (
							<CircleAlert size="0.9em" className="shrink-0 text-amber-500" aria-label="Draft" />
						) : (
							<Clock size="0.9em" className="shrink-0 text-primary" aria-label="Scheduled" />
						)}
					</span>
					<span className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
						<span className="truncate">{authorOf(row, bylines)}</span>
						<span aria-hidden="true">·</span>
						<span className="shrink-0">{relativeTime(row.modified)}</span>
						{children > 0 && (
							<>
								<span aria-hidden="true">·</span>
								<span className="shrink-0">
									{children} {children === 1 ? "child" : "children"}
								</span>
							</>
						)}
					</span>
				</span>
			</button>
		);
	};

	const statusTabsView = (
		<div className="flex items-center gap-1 overflow-x-auto border-b border-border px-3 py-2">
			{statusTabs.map((tab) => (
				<button
					key={tab.id}
					type="button"
					aria-pressed={filters.status === tab.id}
					onClick={() => setStatus(tab.id)}
					className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
						filters.status === tab.id
							? "bg-tab text-foreground"
							: "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
					}`}
				>
					{tab.label} <span className="text-muted-foreground">({tab.count})</span>
				</button>
			))}
		</div>
	);

	const searchField = (ariaLabel: string) => (
		<div className="relative">
			<Search
				size="1em"
				className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-muted-foreground"
			/>
			<Input
				aria-label={ariaLabel}
				className="h-12 rounded-none border-transparent bg-transparent pr-4 pl-11 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
				value={filters.q}
				onChange={(event) => setFiltersAndReset({ q: event.target.value })}
				placeholder={`Search ${collection}...`}
			/>
		</div>
	);

	const pager = (
		<div className="flex items-center gap-1">
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Previous page"
				disabled={currentPage <= 1}
				onClick={() => {
					setPage(currentPage - 1);
					setSelectedSlug(null);
				}}
			>
				<ChevronLeft size={13} />
			</Button>
			<span className="text-[10px] whitespace-nowrap text-muted-foreground tabular-nums">
				Page {currentPage} / {pageCount}
			</span>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Next page"
				disabled={currentPage >= pageCount}
				onClick={() => {
					setPage(currentPage + 1);
					setSelectedSlug(null);
				}}
			>
				<ChevronRight size={13} />
			</Button>
		</div>
	);

	const tableView = (
		<div className="grid gap-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="grid gap-0.5">
					<h1 className="text-xl font-semibold">{label}</h1>
					<p className="text-xs text-muted-foreground">
						{total} {total === 1 ? singular.toLowerCase() : collection} · manage your {collection}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-1">
					<Link to="/t/$collection" params={{ collection }} className="contents">
						<Button variant="secondary" size="sm">
							Translations
						</Button>
					</Link>
					<Button variant="secondary" size="sm" disabled={!picked.length} onClick={() => setBulkOpen(true)}>
						Batch edit
					</Button>
					<Button variant="secondary" size="sm" onClick={() => setSettingsOpen(true)}>
						<Settings size={14} /> Settings
					</Button>
					<Button size="sm" onClick={openCreate}>
						<Plus size={14} /> New {singular}
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Switch to split view"
						title="Switch to split view"
						onClick={() => switchView("split")}
					>
						<Columns2 size="1em" />
					</Button>
				</div>
			</div>
			{statusTabsView}
			<div className="-mt-2 max-w-2xl border-b border-border">{searchField(`Search ${collection}`)}</div>
			<ErrorText>{listError}</ErrorText>
			<Card className="overflow-hidden">
				{rows.length === 0 ? (
					<div className="p-4">
						<EmptyState
							title={loading ? "Loading…" : filters.q || filters.status ? "No matches" : `No ${collection} yet`}
							description={
								filters.q || filters.status ? "Try different filters." : `Create the first ${singular.toLowerCase()}.`
							}
							action={<Button onClick={openCreate}>+ New {singular.toLowerCase()}</Button>}
						/>
					</div>
				) : (
					<Table data-testid={`${collection}-table`}>
						<TableHeader>
							<TableRow>
								<TableHead className="w-12">
									<Checkbox
										aria-label={allPicked ? "Deselect all on this page" : "Select all on this page"}
										checked={allPicked}
										onChange={toggleAll}
									/>
								</TableHead>
								<TableHead className="min-w-64">Title</TableHead>
								<TableHead className="w-28">Status</TableHead>
								{columns.author && <TableHead className="w-40">Author</TableHead>}
								{columns.comments && <TableHead className="w-24">Comments</TableHead>}
								{columns.modified && <TableHead className="w-36">Modified</TableHead>}
								<TableHead className="w-12" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => {
								const depth = showTree ? row.slug.split("/").length - 1 : 0;
								const children = childCounts.get(row.slug) ?? 0;
								return (
									<TableRow key={row.slug} data-state={picked.includes(row.slug) ? "selected" : undefined}>
										<TableCell>
											<Checkbox
												aria-label={`Select ${titleOf(row)}`}
												checked={picked.includes(row.slug)}
												onChange={() =>
													setPicked((current) =>
														current.includes(row.slug)
															? current.filter((value) => value !== row.slug)
															: [...current, row.slug],
													)
												}
											/>
										</TableCell>
										<TableCell>
											<div style={{ paddingInlineStart: depth ? Math.min(depth, 3) * 12 : 0 }}>
												<Link
													to="/e/$collection/$"
													params={{ collection, _splat: row.slug }}
													className="font-medium text-primary hover:underline"
												>
													{titleOf(row)}
												</Link>
												<div className="mt-0.5 text-xs text-muted-foreground">
													{row.slug}
													{localeOf(row, locales) ? ` · ${localeOf(row, locales)}` : ""}
													{children > 0 ? ` · ${children} ${children === 1 ? "child" : "children"}` : ""}
												</div>
											</div>
										</TableCell>
										<TableCell>
											<Badge tone={TONES[row.status]}>{STATUS_LABEL[row.status]}</Badge>
										</TableCell>
										{columns.author && (
											<TableCell className="text-muted-foreground">{authorOf(row, bylines)}</TableCell>
										)}
										{columns.comments && (
											<TableCell className="text-muted-foreground">{commentsOf(row) || "—"}</TableCell>
										)}
										{columns.modified && (
											<TableCell className="text-muted-foreground" title={new Date(row.modified).toLocaleString()}>
												{dateOf(row.modified)}
											</TableCell>
										)}
										<TableCell className="text-end">
											<ActionMenu items={actionsFor(row)} label={`Actions for ${titleOf(row)}`} />
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				)}
				{total > 0 && (
					<DataPagination
						page={currentPage}
						pageCount={pageCount}
						pageSize={pageSize}
						total={total}
						onPageChange={(nextPage) => {
							setPage(nextPage);
							setPicked([]);
						}}
						onPageSizeChange={(nextSize) => {
							setPageSize(nextSize);
							setPage(1);
							setPicked([]);
						}}
					/>
				)}
			</Card>
		</div>
	);

	const detail = selected ? (
		<>
			<header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
				<div className="grid min-w-0 gap-1">
					<h2 className="truncate text-xl font-semibold">{titleOf(selected)}</h2>
					<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
						<span className="inline-flex items-center gap-1">
							<Clock size="1em" />
							{relativeTime(selected.modified)}
						</span>
						<span aria-hidden="true">·</span>
						<span className="inline-flex items-center gap-1">
							<UserRound size="1em" />
							{authorOf(selected, bylines)}
						</span>
						<Badge tone={TONES[selected.status]}>{STATUS_LABEL[selected.status]}</Badge>
						{commentTotal > 0 && (
							<span className="inline-flex items-center gap-1">
								<MessageSquare size="1em" />
								{commentTotal}
							</span>
						)}
					</div>
				</div>
				<div className="flex items-center gap-1">
					<Button
						variant="secondary"
						size="sm"
						onClick={() => void navigate({ to: "/v/$collection/$", params: { collection, _splat: selected.slug } })}
					>
						<WandSparkles size={14} /> Edit with Visual
					</Button>
					<Button variant="secondary" size="sm" onClick={() => editPage(selected.slug)}>
						<Pencil size={14} /> Edit
					</Button>
					<a href={previewUrl ?? viewUrl} target="_blank" rel="noreferrer" className="contents">
						<Button variant="secondary" size="sm">
							<Eye size={14} /> View
						</Button>
					</a>
					<ActionMenu items={actionsFor(selected)} label={`${singular} actions`} />
				</div>
			</header>
			<div className="custom-scrollbar min-h-0 overflow-y-auto">
				<div className="grid gap-5 p-5">
					<dl className="grid gap-3 text-sm">
						<div className="grid gap-1">
							<dt className="text-xs font-medium tracking-wider text-zinc-400 uppercase">Status</dt>
							<dd>
								<Badge tone={TONES[selected.status]}>{STATUS_LABEL[selected.status]}</Badge>
							</dd>
						</div>
						<div className="grid gap-1">
							<dt className="text-xs font-medium tracking-wider text-zinc-400 uppercase">Author</dt>
							<dd className="flex items-center gap-2">
								<span className="grid size-6 place-items-center rounded-full bg-secondary text-muted-foreground">
									<UserRound size="1em" />
								</span>
								{authorOf(selected, bylines)}
							</dd>
						</div>
						<div className="grid gap-1">
							<dt className="text-xs font-medium tracking-wider text-zinc-400 uppercase">URL</dt>
							<dd>
								<a href={viewUrl} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline">
									{viewUrl}
								</a>
							</dd>
						</div>
					</dl>
					<Separator />
					<div className="grid gap-2">
						<div className="flex items-center justify-between gap-2">
							<p className="text-xs font-medium tracking-wider text-zinc-400 uppercase">Preview</p>
							<a
								href={previewUrl ?? viewUrl}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
							>
								Open <ExternalLink size="1em" />
							</a>
						</div>
						<div className="overflow-hidden rounded-lg border border-border bg-card">
							<div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
								<span className="min-w-0 flex-1 truncate">{viewUrl}</span>
								<a href={previewUrl ?? viewUrl} target="_blank" rel="noreferrer" aria-label="Open preview">
									<ExternalLink size="1em" />
								</a>
							</div>
							{previewLoading ? (
								<div className="grid h-[min(58vh,640px)] place-items-center" role="status">
									<Spinner />
								</div>
							) : previewUrl ? (
								<iframe
									title={`Preview of ${titleOf(selected)}`}
									src={previewUrl}
									className="h-[min(58vh,640px)] w-full bg-white"
								/>
							) : (
								<p className="p-6 text-center text-sm text-muted-foreground">Preview unavailable.</p>
							)}
						</div>
						{previewError && (
							<p className="text-xs text-muted-foreground">
								Signed preview is unavailable ({previewError}); showing the public URL.
							</p>
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
				<p className="font-medium">{singular} Preview</p>
				<p className="text-sm text-muted-foreground">
					Select a {singular.toLowerCase()} from the list to preview and manage its details.
				</p>
				<Button variant="secondary" size="sm" onClick={openCreate}>
					<Plus size={14} /> New {singular.toLowerCase()}
				</Button>
			</div>
		</div>
	);

	const splitView = (
		<WorkspaceLayout sidebarWidth={340}>
			<WorkspaceSidebar>
				<div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
					<h1 className="text-base font-semibold">{label}</h1>
					<div className="flex items-center gap-1">
						<Link to="/t/$collection" params={{ collection }} className="contents">
							<Button variant="ghost" size="icon-sm" aria-label="Translations" title="Translations">
								<Languages size="1em" />
							</Button>
						</Link>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Switch to table view"
							title="Switch to table view"
							onClick={() => switchView("table")}
						>
							<TableIcon size="1em" />
						</Button>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={`${singular} settings`}
							title={`${singular} settings`}
							onClick={() => setSettingsOpen(true)}
						>
							<SlidersHorizontal size="1em" />
						</Button>
						<Button
							variant="secondary"
							size="icon-sm"
							style={{ borderRadius: "200px" }}
							className="border-border bg-white text-[#101011] shadow-sm hover:bg-zinc-200!"
							aria-label={`Create ${singular.toLowerCase()}`}
							title={`Create ${singular.toLowerCase()}`}
							onClick={openCreate}
						>
							<Plus size="1em" />
						</Button>
					</div>
				</div>
				<div className="border-b border-border">{searchField(`Search ${collection}`)}</div>
				{statusTabsView}
				<div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-muted-foreground">
					<span className="text-[10px] font-medium tracking-wider uppercase">
						{total} {total === 1 ? "item" : "items"}
					</span>
					{pager}
				</div>
				<div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
					{loading ? (
						<p role="status" className="px-4 py-8 text-center text-xs text-muted-foreground">
							Loading {collection}…
						</p>
					) : rows.length === 0 ? (
						<EmptyState
							title={filters.q || filters.status ? "No matches" : `No ${collection} yet`}
							description={
								filters.q || filters.status ? "Try different filters." : `Create the first ${singular.toLowerCase()}.`
							}
							action={<Button onClick={openCreate}>+ New {singular.toLowerCase()}</Button>}
						/>
					) : (
						<div className="grid gap-1">{rows.map(listRow)}</div>
					)}
				</div>
			</WorkspaceSidebar>
			<WorkspacePanel
				className="grid-rows-[auto_minmax(0,1fr)]"
				data-testid={selected ? `${singular.toLowerCase()}-detail` : undefined}
			>
				{detail}
			</WorkspacePanel>
		</WorkspaceLayout>
	);

	return (
		<div className="grid gap-4">
			<ErrorText>{listError}</ErrorText>
			{view === "split" ? splitView : tableView}

			{picked.length > 0 && view === "table" && (
				<div
					role="toolbar"
					aria-label="Bulk actions"
					className="fixed bottom-5 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card p-2 shadow-xl"
				>
					<span className="shrink-0 px-2 text-xs text-muted-foreground">
						{picked.length} {picked.length === 1 ? "item" : "items"} selected
					</span>
					<span className="mx-1 h-5 w-px shrink-0 bg-border" />
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Publish selected"
						title="Publish selected"
						onClick={() => void bulkSetDraft(false)}
					>
						<CircleCheck size={14} />
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Move selected to drafts"
						title="Move selected to drafts"
						onClick={() => void bulkSetDraft(true)}
					>
						<CircleAlert size={14} />
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Duplicate selected"
						title="Duplicate selected"
						onClick={() => void bulkDuplicate()}
					>
						<Copy size={14} />
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Delete selected"
						title="Delete selected"
						className="text-destructive"
						onClick={() => void bulkDelete()}
					>
						<Trash2 size={14} />
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Clear selection"
						title="Clear selection"
						onClick={() => setPicked([])}
					>
						<X size={14} />
					</Button>
				</div>
			)}

			<Dialog
				open={settingsOpen}
				title={`${singular} settings`}
				description="Filter, sort and choose the columns shown in the table."
				size="medium"
				onClose={() => setSettingsOpen(false)}
				footer={
					<>
						<Button
							variant="ghost"
							onClick={() => {
								setFilters((current) => ({ ...current, sort: "title", author: "", lang: "", from: "", to: "" }));
								setPageSize(20);
								setPage(1);
								setPicked([]);
								setSelectedSlug(null);
								setColumns(DEFAULT_COLUMNS);
							}}
						>
							Reset
						</Button>
						<Button onClick={() => setSettingsOpen(false)}>Done</Button>
					</>
				}
			>
				<div className="grid gap-5 p-6">
					<div className="grid gap-3 sm:grid-cols-2">
						<Input
							label="Modified from"
							type="date"
							value={filters.from}
							onChange={(event) => setFiltersAndReset({ from: event.target.value })}
						/>
						<Input
							label="Modified to"
							type="date"
							value={filters.to}
							onChange={(event) => setFiltersAndReset({ to: event.target.value })}
						/>
					</div>
					<div className="grid gap-3 sm:grid-cols-3">
						<Select
							label="Per page"
							value={String(pageSize)}
							onChange={(event) => {
								setPageSize(Number(event.target.value));
								setPage(1);
								setPicked([]);
							}}
						>
							{PAGE_SIZE_OPTIONS.map((size) => (
								<option key={size} value={size}>
									{size}
								</option>
							))}
						</Select>
						<Select
							label="Order"
							value={sortDescending ? "desc" : "asc"}
							onChange={(event) => setSort(sortBy, event.target.value === "desc")}
						>
							<option value="asc">Ascending</option>
							<option value="desc">Descending</option>
						</Select>
						<Select label="Order by" value={sortBy} onChange={(event) => setSort(event.target.value, sortDescending)}>
							<option value="title">Title</option>
							<option value="modified">Modified</option>
							<option value="slug">Slug</option>
						</Select>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						{bylines.length > 0 && (
							<Select
								label="Author"
								value={filters.author}
								onChange={(event) => setFiltersAndReset({ author: event.target.value })}
							>
								<option value="">Anyone</option>
								{bylines.map((byline) => (
									<option key={byline.slug} value={byline.slug}>
										{byline.name}
									</option>
								))}
							</Select>
						)}
						{locales.length > 0 && (
							<Select
								label="Language"
								value={filters.lang}
								onChange={(event) => setFiltersAndReset({ lang: event.target.value })}
							>
								<option value="">All</option>
								{locales.map((locale) => (
									<option key={locale} value={locale}>
										{locale}
									</option>
								))}
							</Select>
						)}
					</div>
					<div className="grid gap-2">
						<p className="text-xs font-medium tracking-wider text-zinc-400 uppercase">Columns</p>
						<div className="grid gap-2">
							{COLUMN_OPTIONS.map((column) => (
								<Checkbox
									key={column.id}
									label={column.label}
									checked={columns[column.id]}
									onChange={(event) => setColumns((current) => ({ ...current, [column.id]: event.target.checked }))}
								/>
							))}
						</div>
					</div>
				</div>
			</Dialog>

			<Dialog
				open={bulkOpen}
				title={`Batch edit ${picked.length} ${picked.length === 1 ? singular.toLowerCase() : collection}`}
				onClose={() => setBulkOpen(false)}
				footer={
					<Button variant="ghost" onClick={() => setBulkOpen(false)}>
						Cancel
					</Button>
				}
			>
				<div className="grid gap-3">
					<p className="text-sm text-muted-foreground">Choose what should happen to the selected {collection}.</p>
					<div className="flex flex-wrap gap-2">
						<Button onClick={() => void bulkSetDraft(false)}>
							<CircleCheck size={14} /> Publish
						</Button>
						<Button variant="secondary" onClick={() => void bulkSetDraft(true)}>
							<CircleAlert size={14} /> Move to drafts
						</Button>
						<Button variant="secondary" onClick={() => void bulkDuplicate()}>
							<Copy size={14} /> Duplicate
						</Button>
						<Button variant="destructive" onClick={() => void bulkDelete()}>
							<Trash2 size={14} /> Delete
						</Button>
					</div>
				</div>
			</Dialog>

			<Dialog
				open={createOpen}
				title={`New ${singular.toLowerCase()}`}
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
				<Input
					label="Title"
					placeholder={`My first ${singular.toLowerCase()}`}
					value={title}
					onChange={(event) => changeTitle(event.target.value)}
				/>
				<Input
					label="Slug"
					placeholder={`my-first-${singular.toLowerCase()}`}
					value={slug}
					onChange={(event) => changeSlug(event.target.value)}
					hint="Generated from the title until you edit it. Lowercase letters, numbers, /, ., _ and -"
				/>
				<ErrorText>{createError}</ErrorText>
			</Dialog>
		</div>
	);
}

export function PagesPage() {
	return <ContentWorkspacePage collection="pages" />;
}

export function PostsPage() {
	return <ContentWorkspacePage collection="posts" />;
}
