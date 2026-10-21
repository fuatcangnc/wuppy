import {
	Copy,
	ExternalLink,
	FileImage,
	HardDrive,
	LayoutGrid,
	List,
	Pencil,
	Plus,
	Repeat2,
	Ruler,
	Search,
	Trash2,
	Upload,
	WandSparkles,
} from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiData } from "../../lib/api.ts";
import { imageToWebp } from "../../lib/webp.ts";
import { imagesFrom, uploadWithProgress } from "../../lib/upload.ts";
import {
	$media,
	$mediaFolders,
	deleteMedia,
	deleteMediaFolder,
	deleteUnusedMedia,
	loadMedia,
	renameMediaFolder,
	replaceMedia,
	saveMediaFolders,
	updateMedia,
	type MediaItem,
} from "../../stores/content.ts";
import {
	Button,
	Checkbox,
	DataPagination,
	Dialog,
	EmptyState,
	Input,
	PageHeader,
	Select,
	Textarea,
	toast,
} from "../../ui/index.tsx";
import { filterMedia } from "./filter.ts";
import { fresh, MediaDetailDialog, sizeLabel, type Usage } from "./MediaDetailDialog.tsx";
import { UploadDialog } from "./UploadDialog.tsx";

const DEFAULT_PAGE_SIZE = 20;
const TYPES = { png: "PNG", jpg: "JPEG", gif: "GIF", webp: "WebP" } as const;
const VARIANTS = [
	{ id: "full", label: "Full", query: "" },
	{ id: "thumbnail", label: "Thumbnail", query: "w=320" },
	{ id: "medium", label: "Medium", query: "w=768" },
	{ id: "large", label: "Large", query: "w=1280" },
	{ id: "webp", label: "WebP", query: "w=1280&format=webp" },
] as const;
type Variant = (typeof VARIANTS)[number]["id"];
const labelOf = (m: MediaItem) => m.title || m.name.split("/").pop() || m.name;
const filenameOf = (m: MediaItem) => m.name.split("/").pop() || m.name;
const formatOf = (m: MediaItem) => {
	const ext = m.name.split(".").pop()?.toLowerCase() ?? "";
	return ext === "jpg" || ext === "jpeg" ? "JPEG" : ext.toUpperCase();
};
const extOf = (m: MediaItem) => m.name.split(".").pop()?.toLowerCase() ?? "";
const draftOf = (m: MediaItem | null) => ({
	title: m ? (m.title ?? filenameOf(m)) : "",
	alt: m?.alt ?? "",
	caption: m?.caption ?? "",
	credit: m?.credit ?? "",
	folder: m?.folder ?? "",
});
const variantSrc = (m: MediaItem, variant: Variant) => {
	const base = fresh(m);
	const query = VARIANTS.find((entry) => entry.id === variant)?.query;
	return query ? `${base}&${query}` : base;
};

export function MediaPage() {
	const items = useStore($media);
	const folders = useStore($mediaFolders);
	const [folder, setFolder] = useState("all");
	const [query, setQuery] = useState("");
	const [type, setType] = useState("");
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const [view, setView] = useState<"grid" | "list">("list");
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
	const [picked, setPicked] = useState<string[]>([]);
	const [selected, setSelected] = useState<string | null>(null);
	const [draft, setDraft] = useState(() => draftOf(null));
	const [variant, setVariant] = useState<Variant>("full");
	const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null);
	const [usage, setUsage] = useState<Usage[]>([]);
	const [usageLoading, setUsageLoading] = useState(false);
	const [converting, setConverting] = useState(false);
	const [editUrl, setEditUrl] = useState<string | null>(null);
	const [pending, setPending] = useState<File[] | null>(null);
	const [dropping, setDropping] = useState(false);
	const [folderDialog, setFolderDialog] = useState(false);
	const [newFolder, setNewFolder] = useState("");
	const replaceInput = useRef<HTMLInputElement>(null);

	useEffect(() => void loadMedia(), []);
	const current = items.find((item) => item.url === selected) ?? null;
	const editCurrent = items.find((item) => item.url === editUrl) ?? null;

	useEffect(() => {
		setDraft(draftOf(current));
		setVariant("full");
		setMeasured(null);
	}, [current?.url]);

	useEffect(() => {
		if (!current) {
			setUsage([]);
			setUsageLoading(false);
			return;
		}
		let cancelled = false;
		setUsage([]);
		setUsageLoading(true);
		void apiData<Usage[]>("GET", `/api/media/usage?url=${encodeURIComponent(current.url)}`)
			.then((next) => {
				if (!cancelled) setUsage(next);
			})
			.catch(() => {
				if (!cancelled) setUsage([]);
			})
			.finally(() => {
				if (!cancelled) setUsageLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [current?.url]);

	const filtered = useMemo(
		() => filterMedia(items, { folder, query, type, from, to }),
		[items, folder, query, type, from, to],
	);
	const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
	const currentPage = Math.min(page, pageCount);
	const visible = useMemo(
		() => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
		[filtered, currentPage, pageSize],
	);
	useEffect(() => {
		if (page > pageCount) setPage(pageCount);
	}, [page, pageCount]);
	useEffect(() => {
		setPage(1);
		setPicked([]);
	}, [folder, query, type, from, to, pageSize]);

	// Pasting an image anywhere on the page uploads it.
	useEffect(() => {
		const onPaste = (event: ClipboardEvent) => {
			const files = imagesFrom(event.clipboardData);
			if (files.length) setPending((open) => [...(open ?? []), ...files]);
		};
		document.addEventListener("paste", onPaste);
		return () => document.removeEventListener("paste", onPaste);
	}, []);

	const baseDraft = draftOf(current);
	const dirty =
		current !== null &&
		Object.keys(draft).some((key) => draft[key as keyof typeof draft] !== baseDraft[key as keyof typeof baseDraft]);
	const sizing = current?.width && current?.height ? current : measured ? { ...current, ...measured } : current;
	const extension = current ? extOf(current) : "";
	const canConvert = Boolean(current && extension !== "gif" && extension !== "webp");

	const selectMedia = (url: string) => {
		if (url === selected) return;
		if (dirty && !confirm("Discard unsaved media changes?")) return;
		setSelected(url);
	};

	const saveDetails = async () => {
		if (!current) return;
		try {
			await updateMedia(current.url, draft);
			toast("Saved");
		} catch (error) {
			toast((error as Error).message, "error");
		}
	};

	const removeCurrent = async () => {
		if (!current) return;
		if (!confirm("Delete this image? Git history keeps it.")) return;
		try {
			await deleteMedia(current.url);
			const next = visible.find((item) => item.url !== current.url) ?? items.find((item) => item.url !== current.url);
			setSelected(next?.url ?? null);
			toast("Deleted");
		} catch (error) {
			if (error instanceof ApiError && error.code === "IN_USE" && confirm(`${error.message}. Delete anyway?`)) {
				await deleteMedia(current.url, true);
				const next = visible.find((item) => item.url !== current.url) ?? items.find((item) => item.url !== current.url);
				setSelected(next?.url ?? null);
				toast("Deleted");
			} else {
				toast((error as Error).message, "error");
			}
		}
	};

	const replaceCurrent = async (file: File) => {
		if (!current) return;
		try {
			await replaceMedia(current.url, file);
			setDraft(draftOf(current));
			toast("Image replaced");
		} catch (error) {
			toast((error as Error).message, "error");
		}
	};

	const convertCurrent = async () => {
		if (!current || !canConvert || converting) return;
		setConverting(true);
		try {
			const file = await imageToWebp(fresh(current));
			const url = await uploadWithProgress(file, {
				title: file.name,
				alt: current.alt,
				caption: current.caption,
				folder: current.folder,
			}).done;
			await loadMedia();
			setSelected(url);
			toast("WebP created");
		} catch (error) {
			toast((error as Error).message, "error");
		} finally {
			setConverting(false);
		}
	};

	const togglePicked = (url: string) =>
		setPicked((all) => (all.includes(url) ? all.filter((entry) => entry !== url) : [...all, url]));

	const row = (item: MediaItem) => {
		const selectedRow = selected === item.url;
		return (
			<li key={item.url}>
				<div
					className={`group flex items-center gap-2 rounded-lg border p-2 transition ${
						selectedRow ? "border-primary/50 bg-secondary" : "border-transparent hover:bg-muted/50"
					}`}
				>
					<Checkbox
						aria-label={`Select ${item.name}`}
						checked={picked.includes(item.url)}
						onChange={() => togglePicked(item.url)}
						className="opacity-0 group-hover:opacity-100 focus:opacity-100"
					/>
					<button
						type="button"
						aria-label={`Open ${item.title || item.name}`}
						onClick={() => selectMedia(item.url)}
						className="flex min-w-0 flex-1 items-center gap-2 text-left"
					>
						<img src={fresh(item)} alt="" className="size-10 shrink-0 rounded-md object-cover" loading="lazy" />
						<span className="grid min-w-0 flex-1 gap-0.5">
							<span className="truncate text-sm font-medium">{labelOf(item)}</span>
							<span className="truncate text-xs text-muted-foreground">
								{sizeLabel(item.size)} · {new Date(item.modified).toLocaleDateString()}
							</span>
						</span>
					</button>
				</div>
			</li>
		);
	};

	return (
		<div
			className={`grid gap-4 ${dropping ? "rounded-lg outline-dashed outline-2 outline-primary" : ""}`}
			onDragOver={(event) => {
				if ([...event.dataTransfer.items].some((item) => item.kind === "file")) {
					event.preventDefault();
					setDropping(true);
				}
			}}
			onDragLeave={() => setDropping(false)}
			onDrop={(event) => {
				event.preventDefault();
				setDropping(false);
				const files = imagesFrom(event.dataTransfer);
				if (files.length) setPending(files);
			}}
		>
			<PageHeader
				title="Media Library"
				description={`${filtered.length === items.length ? items.length : `${filtered.length} of ${items.length}`} files · drop or paste images anywhere on this page`}
				actions={
					<>
						<Button
							variant="ghost"
							onClick={() => {
								if (!confirm("Delete every image that no entry or setting uses? Git history keeps them.")) return;
								void deleteUnusedMedia()
									.then((count) => toast(`Removed ${count} unused ${count === 1 ? "file" : "files"}`))
									.catch((error: Error) => toast(error.message, "error"));
							}}
						>
							Clean up unused
						</Button>
						<Button variant="secondary" onClick={() => setFolderDialog(true)}>
							<Plus size={14} /> Add new folder
						</Button>
						<Button variant="secondary" onClick={() => setPending([])}>
							<Upload size={14} /> Upload media
						</Button>
					</>
				}
			/>

			<div className="grid min-h-[620px] overflow-hidden rounded-xl border border-border bg-card lg:h-[calc(100vh-13rem)] lg:grid-cols-[310px_minmax(0,1fr)_390px]">
				<aside className="flex min-h-0 flex-col border-b border-border lg:border-e lg:border-b-0">
					<div className="grid gap-2 border-b border-border p-3">
						<div className="relative">
							<Search
								size={14}
								className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								aria-label="Search"
								className="pl-9"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Search media…"
							/>
						</div>
						<div className="flex flex-wrap gap-1">
							<button
								type="button"
								onClick={() => setType("")}
								className={`rounded-md px-2.5 py-1 text-xs ${type === "" ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-muted/60"}`}
							>
								All
							</button>
							{Object.entries(TYPES).map(([ext, label]) => (
								<button
									key={ext}
									type="button"
									onClick={() => setType(ext)}
									className={`rounded-md px-2.5 py-1 text-xs ${type === ext ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-muted/60"}`}
								>
									{label}
								</button>
							))}
						</div>
						<Select aria-label="Folder" value={folder} onChange={(event) => setFolder(event.target.value)}>
							<option value="all">All folders</option>
							<option value="">Main library</option>
							{folders.map((name) => (
								<option key={name} value={name}>
									{name}
								</option>
							))}
						</Select>
						<details className="rounded-md border border-border">
							<summary className="cursor-pointer px-2 py-1.5 text-xs text-muted-foreground">Date filters</summary>
							<div className="grid gap-2 border-t border-border p-2">
								<Input
									aria-label="Modified from"
									title="Modified from"
									type="date"
									value={from}
									onChange={(event) => setFrom(event.target.value)}
								/>
								<Input
									aria-label="Modified to"
									title="Modified to"
									type="date"
									value={to}
									onChange={(event) => setTo(event.target.value)}
								/>
							</div>
						</details>
						{(folder !== "all" && folder !== "") || picked.length > 0 ? (
							<div className="flex flex-wrap items-center gap-1">
								{folder !== "all" && folder !== "" && (
									<>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => {
												const renamed = prompt("Rename folder", folder)?.trim();
												if (renamed && renamed !== folder) {
													void renameMediaFolder(folder, renamed)
														.then(() => setFolder(renamed))
														.catch((error: Error) => toast(error.message, "error"));
												}
											}}
										>
											Rename folder
										</Button>
										<Button
											variant="ghost"
											size="sm"
											className="text-destructive"
											onClick={() => {
												if (!confirm(`Delete folder "${folder}"? Its images stay in the library, unfiled.`)) return;
												void deleteMediaFolder(folder)
													.then(() => setFolder("all"))
													.catch((error: Error) => toast(error.message, "error"));
											}}
										>
											Delete folder
										</Button>
									</>
								)}
								{picked.length > 0 && (
									<div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Bulk actions">
										<span className="text-xs">{picked.length} selected</span>
										<Select
											aria-label="Move selected to folder"
											value=""
											onChange={(event) => {
												const target = event.target.value;
												if (!target) return;
												void Promise.all(
													picked.map((url) => updateMedia(url, { folder: target === "__none" ? "" : target })),
												).then(() => {
													setPicked([]);
													toast("Moved");
												});
											}}
										>
											<option value="">Move to…</option>
											<option value="__none">Main library</option>
											{folders.map((name) => (
												<option key={name} value={name}>
													{name}
												</option>
											))}
										</Select>
										<Button
											size="sm"
											variant="destructive"
											onClick={() => {
												if (!confirm(`Delete ${picked.length} files? Files that entries still use are kept.`)) return;
												void (async () => {
													let kept = 0;
													for (const url of picked) {
														try {
															await deleteMedia(url);
														} catch (error) {
															if (error instanceof ApiError && error.code === "IN_USE") kept++;
															else toast((error as Error).message, "error");
														}
													}
													setPicked([]);
													toast(kept ? `${kept} in use, kept` : "Deleted");
												})();
											}}
										>
											Delete
										</Button>
										<Button size="sm" variant="ghost" onClick={() => setPicked([])}>
											Clear
										</Button>
									</div>
								)}
							</div>
						) : null}
					</div>

					<div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs text-muted-foreground">
						<span>
							{filtered.length} {filtered.length === 1 ? "item" : "items"}
						</span>
						<div role="group" aria-label="View" className="flex rounded-md border border-border p-0.5">
							<Button
								variant={view === "grid" ? "secondary" : "ghost"}
								size="icon-sm"
								aria-label="Grid view"
								aria-pressed={view === "grid"}
								onClick={() => setView("grid")}
							>
								<LayoutGrid size={13} />
							</Button>
							<Button
								variant={view === "list" ? "secondary" : "ghost"}
								size="icon-sm"
								aria-label="List view"
								aria-pressed={view === "list"}
								onClick={() => setView("list")}
							>
								<List size={13} />
							</Button>
						</div>
					</div>

					<div className="min-h-0 flex-1 overflow-y-auto p-2">
						{filtered.length === 0 ? (
							<EmptyState title="No media yet" description="Upload an image or change the filters." />
						) : view === "list" ? (
							<ul className="grid gap-1">{visible.map(row)}</ul>
						) : (
							<ul className="grid grid-cols-2 gap-2">
								{visible.map((item) => (
									<li key={item.url} className="group relative">
										<button
											type="button"
											aria-label={`Open ${item.title || item.name}`}
											onClick={() => selectMedia(item.url)}
											className={`block w-full overflow-hidden rounded-lg border text-left ${
												selected === item.url ? "border-primary" : "border-border hover:border-foreground/40"
											}`}
										>
											<img src={fresh(item)} alt="" className="aspect-square w-full object-cover" loading="lazy" />
											<span className="block truncate px-2 py-1.5 text-xs">{labelOf(item)}</span>
										</button>
										<Checkbox
											aria-label={`Select ${item.name}`}
											checked={picked.includes(item.url)}
											onChange={() => togglePicked(item.url)}
											className="absolute top-1 left-1 bg-background/80 opacity-0 group-hover:opacity-100 focus:opacity-100"
										/>
									</li>
								))}
							</ul>
						)}
					</div>
				</aside>

				<section className="flex min-h-0 flex-col border-b border-border lg:border-b-0">
					{current ? (
						<>
							<div className="flex items-center gap-1 overflow-x-auto border-b border-border px-3 py-2">
								{VARIANTS.map((entry) => (
									<button
										key={entry.id}
										type="button"
										onClick={() => setVariant(entry.id)}
										className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
											variant === entry.id
												? "bg-secondary text-foreground shadow-sm"
												: "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
										}`}
									>
										{entry.label}
									</button>
								))}
							</div>
							<div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-background p-6">
								<img
									src={variantSrc(current, variant)}
									alt={current.alt ?? ""}
									data-testid="media-preview"
									className="max-h-full max-w-full object-contain"
									onLoad={(event) => {
										const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
										if (width > 0 && height > 0) setMeasured({ width, height });
									}}
								/>
							</div>
							<div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
								<span>
									{sizing?.width && sizing?.height ? `${sizing.width} × ${sizing.height}` : "—"} ·{" "}
									{sizeLabel(current.size)} · {formatOf(current)}
								</span>
								<span>Uploaded {new Date(current.modified).toLocaleDateString()}</span>
							</div>
						</>
					) : (
						<div className="grid flex-1 place-items-center p-6">
							<EmptyState title="Select a file" description="Choose an image from the library to inspect it." />
						</div>
					)}
				</section>

				<aside className="min-h-0 overflow-y-auto">
					{current ? (
						<div data-testid="media-inspector" className="grid gap-5 p-5">
							<div className="grid gap-3">
								<Input
									label="Title"
									value={draft.title}
									onChange={(event) => setDraft({ ...draft, title: event.target.value })}
								/>
								<Textarea
									label="Alt text"
									rows={2}
									placeholder="Describe the image for screen readers"
									value={draft.alt}
									onChange={(event) => setDraft({ ...draft, alt: event.target.value })}
								/>
								<Textarea
									label="Caption"
									rows={2}
									placeholder="Add a caption"
									value={draft.caption}
									onChange={(event) => setDraft({ ...draft, caption: event.target.value })}
								/>
								<Input
									label="Credit"
									placeholder="Photographer or source"
									value={draft.credit}
									onChange={(event) => setDraft({ ...draft, credit: event.target.value })}
								/>
								<Select
									label="Location"
									value={draft.folder}
									onChange={(event) => setDraft({ ...draft, folder: event.target.value })}
								>
									<option value="">Main library</option>
									{folders.map((name) => (
										<option key={name} value={name}>
											{name}
										</option>
									))}
								</Select>
								<Button onClick={() => void saveDetails()} disabled={!dirty}>
									Save
								</Button>
							</div>

							<div className="grid gap-1.5">
								<p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">File URL</p>
								<div className="flex items-center gap-1 rounded-md border border-border px-2 py-1">
									<input
										readOnly
										aria-label="File URL"
										value={new URL(current.url, window.location.origin).href}
										className="min-w-0 flex-1 truncate bg-transparent py-1 font-mono text-xs outline-none"
									/>
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label="Copy URL"
										onClick={() =>
											void navigator.clipboard
												.writeText(new URL(current.url, window.location.origin).href)
												.then(() => toast("URL copied"))
										}
									>
										<Copy size={14} />
									</Button>
								</div>
							</div>

							<div className="grid gap-2">
								<p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Actions</p>
								<Button
									variant="secondary"
									className="justify-start"
									disabled={!canConvert || converting}
									onClick={() => void convertCurrent()}
								>
									<WandSparkles size={14} /> {converting ? "Converting…" : "Convert Webp"}
								</Button>
								<Button variant="secondary" className="justify-start" onClick={() => replaceInput.current?.click()}>
									<Repeat2 size={14} /> Replace image
								</Button>
								<input
									ref={replaceInput}
									type="file"
									accept="image/png,image/jpeg,image/gif,image/webp"
									className="sr-only"
									tabIndex={-1}
									aria-label="Replace image file"
									onChange={(event) => {
										const file = event.currentTarget.files?.[0];
										event.currentTarget.value = "";
										if (file) void replaceCurrent(file);
									}}
								/>
								<Button variant="secondary" className="justify-start" onClick={() => setEditUrl(current.url)}>
									<Pencil size={14} /> Edit image
								</Button>
								<Button variant="destructive" className="justify-start" onClick={() => void removeCurrent()}>
									<Trash2 size={14} /> Delete
								</Button>
							</div>

							<div className="grid gap-2">
								<p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Details</p>
								<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
									<dt className="text-muted-foreground">Filename</dt>
									<dd className="truncate text-end" title={filenameOf(current)}>
										{filenameOf(current)}
									</dd>
									<dt className="text-muted-foreground">Modified</dt>
									<dd className="text-end">{new Date(current.modified).toLocaleDateString()}</dd>
									<dt className="text-muted-foreground">File size</dt>
									<dd className="text-end">{sizeLabel(current.size)}</dd>
									<dt className="flex items-center gap-1 text-muted-foreground">
										<Ruler size={12} /> Dimensions
									</dt>
									<dd className="text-end">
										{sizing?.width && sizing?.height ? `${sizing.width} × ${sizing.height}` : "—"}
									</dd>
									<dt className="flex items-center gap-1 text-muted-foreground">
										<HardDrive size={12} /> Format
									</dt>
									<dd className="text-end">{formatOf(current)}</dd>
								</dl>
							</div>

							<div className="grid gap-2">
								<p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Used in</p>
								{usageLoading ? (
									<p role="status" className="text-xs text-muted-foreground">
										Checking where this file is used…
									</p>
								) : usage.length === 0 ? (
									<p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
										Not referenced by any entry.
									</p>
								) : (
									<ul className="grid gap-2">
										{usage.map((entry) => (
											<li key={`${entry.collection}:${entry.slug}`}>
												<a
													href={`/admin/e/${entry.collection}/${entry.slug}`}
													className="flex items-center gap-2 rounded-lg border p-2 text-xs hover:bg-muted/60"
												>
													<span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
														<FileImage size={13} />
													</span>
													<span className="min-w-0 flex-1">
														<span className="block truncate font-medium">{entry.title}</span>
														<span className="capitalize text-muted-foreground">{entry.collection}</span>
													</span>
													<ExternalLink size={13} />
												</a>
											</li>
										))}
									</ul>
								)}
							</div>
						</div>
					) : (
						<div className="p-5">
							<EmptyState title="No file selected" description="Select a file to edit its details." />
						</div>
					)}
				</aside>
			</div>

			{filtered.length > 0 && (
				<div className="rounded-lg border border-border bg-card">
					<DataPagination
						page={currentPage}
						pageCount={pageCount}
						pageSize={pageSize}
						total={filtered.length}
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
				</div>
			)}

			<Dialog
				open={folderDialog}
				title="Add new folder"
				onClose={() => setFolderDialog(false)}
				footer={
					<>
						<Button variant="secondary" onClick={() => setFolderDialog(false)}>
							Cancel
						</Button>
						<Button
							disabled={!newFolder.trim() || folders.includes(newFolder.trim())}
							onClick={() => {
								void saveMediaFolders([...folders, newFolder.trim()]).then(() => {
									setNewFolder("");
									setFolderDialog(false);
									toast("Folder created");
								});
							}}
						>
							Create folder
						</Button>
					</>
				}
			>
				<Input
					label="Folder name"
					hint="Use / for a subfolder, e.g. blog/2026 (up to 3 levels)."
					value={newFolder}
					onChange={(event) => setNewFolder(event.target.value)}
				/>
			</Dialog>

			{editCurrent && (
				<MediaDetailDialog
					key={editCurrent.url}
					item={editCurrent}
					folders={folders}
					usage={usage}
					usageLoading={usageLoading}
					initialTab="edit"
					onClose={() => setEditUrl(null)}
					onSelect={(url) => {
						setEditUrl(null);
						setSelected(url);
					}}
				/>
			)}

			{pending && (
				<UploadDialog
					initial={pending}
					folder={folder === "all" || folder === "" ? undefined : folder}
					onClose={() => {
						setPending(null);
						void loadMedia();
					}}
					onDone={() => {
						setPending(null);
						void loadMedia();
					}}
				/>
			)}
		</div>
	);
}
