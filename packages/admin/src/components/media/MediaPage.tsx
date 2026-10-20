import { LayoutGrid, List, Plus, Search, Upload } from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { useEffect, useMemo, useState } from "react";
import { ApiError, apiData } from "../../lib/api.ts";
import {
	$media,
	$mediaFolders,
	deleteMedia,
	deleteMediaFolder,
	deleteUnusedMedia,
	loadMedia,
	renameMediaFolder,
	saveMediaFolders,
	updateMedia,
} from "../../stores/content.ts";
import { imagesFrom } from "../../lib/upload.ts";
import { Badge, Button, Checkbox, Dialog, EmptyState, Input, PageHeader, Select, toast } from "../../ui/index.tsx";
import type { MediaItem } from "../../stores/content.ts";
import { filterMedia } from "./filter.ts";
import { fresh, MediaDetailDialog, sizeLabel, type Usage } from "./MediaDetailDialog.tsx";
import { UploadDialog } from "./UploadDialog.tsx";
import { UploadList, useUploadQueue } from "./UploadQueue.tsx";

const PAGE = 36;
const TYPES = { png: "PNG", jpg: "JPEG", gif: "GIF", webp: "WebP" } as const;
const labelOf = (m: MediaItem) => m.title || m.name.split("/").pop() || m.name;
const formatOf = (m: MediaItem) => {
	const ext = m.name.split(".").pop()?.toLowerCase() ?? "";
	return ext === "jpg" || ext === "jpeg" ? "JPEG" : ext.toUpperCase();
};

export function MediaPage() {
	const items = useStore($media);
	const folders = useStore($mediaFolders);
	const [folder, setFolder] = useState("all");
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<string | null>(null);
	const [usage, setUsage] = useState<Usage[]>([]);
	const [newFolder, setNewFolder] = useState("");
	const [type, setType] = useState("");
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const [shown, setShown] = useState(PAGE);
	const [picked, setPicked] = useState<string[]>([]);
	// Files waiting in the upload dialog; `null` keeps it closed.
	const [pending, setPending] = useState<File[] | null>(null);
	const [dropping, setDropping] = useState(false);
	const [view, setView] = useState<"grid" | "list">("grid");
	const [folderDialog, setFolderDialog] = useState(false);
	const queue = useUploadQueue(folder === "all" || folder === "" ? undefined : folder, () => {
		void loadMedia();
		toast("Upload finished");
	});

	useEffect(() => void loadMedia(), []);
	const current = items.find((m) => m.url === selected) ?? null;
	useEffect(() => {
		if (!current) return;
		void apiData<Usage[]>("GET", `/api/media/usage?url=${encodeURIComponent(current.url)}`)
			.then(setUsage)
			.catch(() => setUsage([]));
	}, [current]);

	const filtered = useMemo(
		() => filterMedia(items, { folder, query, type, from, to }),
		[items, folder, query, type, from, to],
	);
	useEffect(() => setShown(PAGE), [folder, query, type, from, to]);

	// Pasting an image anywhere on the page uploads it.
	useEffect(() => {
		const onPaste = (e: ClipboardEvent) => {
			const files = imagesFrom(e.clipboardData);
			if (files.length) setPending((open) => [...(open ?? []), ...files]);
		};
		document.addEventListener("paste", onPaste);
		return () => document.removeEventListener("paste", onPaste);
	}, []);

	const togglePicked = (url: string) =>
		setPicked((all) => (all.includes(url) ? all.filter((u) => u !== url) : [...all, url]));

	return (
		<div
			className={`grid gap-4 ${dropping ? "rounded-lg outline-dashed outline-2 outline-primary" : ""}`}
			onDragOver={(e) => {
				if ([...e.dataTransfer.items].some((i) => i.kind === "file")) {
					e.preventDefault();
					setDropping(true);
				}
			}}
			onDragLeave={() => setDropping(false)}
			onDrop={(e) => {
				e.preventDefault();
				setDropping(false);
				const files = imagesFrom(e.dataTransfer);
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
									.then((n) => toast(`Removed ${n} unused ${n === 1 ? "file" : "files"}`))
									.catch((err: Error) => toast(err.message, "error"));
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

			<div className="flex flex-wrap items-center gap-2">
				<div className="relative w-full max-w-xs">
					<Search
						size={14}
						className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						aria-label="Search"
						className="pl-9"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search by filename or alt text…"
					/>
				</div>
				<Select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)}>
					<option value="">All types</option>
					{Object.entries(TYPES).map(([ext, label]) => (
						<option key={ext} value={ext}>
							{label}
						</option>
					))}
				</Select>
				<Select aria-label="Folder" value={folder} onChange={(e) => setFolder(e.target.value)}>
					<option value="all">All folders</option>
					<option value="">Main library</option>
					{folders.map((f) => (
						<option key={f} value={f}>
							{f}
						</option>
					))}
				</Select>
				<Input
					aria-label="Modified from"
					title="Modified from"
					type="date"
					value={from}
					onChange={(e) => setFrom(e.target.value)}
				/>
				<Input
					aria-label="Modified to"
					title="Modified to"
					type="date"
					value={to}
					onChange={(e) => setTo(e.target.value)}
				/>
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
										.catch((err: Error) => toast(err.message, "error"));
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
									.catch((err: Error) => toast(err.message, "error"));
							}}
						>
							Delete folder
						</Button>
					</>
				)}
				<div role="group" aria-label="View" className="ml-auto flex rounded-lg border p-0.5">
					<Button
						variant={view === "grid" ? "secondary" : "ghost"}
						size="icon-sm"
						aria-label="Grid view"
						aria-pressed={view === "grid"}
						onClick={() => setView("grid")}
					>
						<LayoutGrid size={14} />
					</Button>
					<Button
						variant={view === "list" ? "secondary" : "ghost"}
						size="icon-sm"
						aria-label="List view"
						aria-pressed={view === "list"}
						onClick={() => setView("list")}
					>
						<List size={14} />
					</Button>
				</div>
			</div>

			<UploadList jobs={queue.jobs} cancel={queue.cancel} clear={queue.clear} />

			{picked.length > 0 && (
				<div
					className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm"
					role="toolbar"
					aria-label="Bulk actions"
				>
					<span>{picked.length} selected</span>
					<Select
						aria-label="Move selected to folder"
						value=""
						onChange={(e) => {
							const target = e.target.value;
							if (!target) return;
							void Promise.all(picked.map((u) => updateMedia(u, { folder: target === "__none" ? "" : target }))).then(
								() => {
									setPicked([]);
									toast("Moved");
								},
							);
						}}
					>
						<option value="">Move to…</option>
						<option value="__none">Main library</option>
						{folders.map((f) => (
							<option key={f} value={f}>
								{f}
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
									} catch (err) {
										if (err instanceof ApiError && err.code === "IN_USE") kept++;
										else toast((err as Error).message, "error");
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

			{filtered.length === 0 ? (
				<EmptyState title="No media yet" description="Upload an image or change the filters." />
			) : view === "grid" ? (
				<ul className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
					{filtered.slice(0, shown).map((m) => (
						<li
							key={m.url}
							className={`group relative overflow-hidden rounded-lg border bg-card transition hover:border-foreground/40 ${picked.includes(m.url) ? "border-primary ring-1 ring-primary" : "border-border"}`}
						>
							<button
								type="button"
								className="block w-full text-left"
								onClick={() => setSelected(m.url)}
								aria-label={`Open ${m.title || m.name}`}
							>
								<img
									src={fresh(m)}
									alt={m.alt ?? ""}
									className="aspect-video w-full bg-muted object-cover"
									loading="lazy"
								/>
								<span className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
									<span className="truncate">{labelOf(m)}</span>
									<Badge>{formatOf(m)}</Badge>
								</span>
							</button>
							<span
								className={`absolute top-2 left-2 rounded bg-background/80 p-0.5 ${picked.includes(m.url) ? "" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"}`}
							>
								<Checkbox
									aria-label={`Select ${m.name}`}
									checked={picked.includes(m.url)}
									onChange={() => togglePicked(m.url)}
								/>
							</span>
						</li>
					))}
				</ul>
			) : (
				<table className="w-full text-sm">
					<thead className="text-left text-xs text-muted-foreground uppercase">
						<tr className="border-b">
							<th className="w-10 p-2" />
							<th className="p-2">File</th>
							<th className="p-2">Type</th>
							<th className="p-2">Size</th>
							<th className="p-2">Dimensions</th>
							<th className="p-2">Location</th>
							<th className="p-2">Modified</th>
						</tr>
					</thead>
					<tbody>
						{filtered.slice(0, shown).map((m) => (
							<tr key={m.url} className="border-b hover:bg-muted/50">
								<td className="p-2">
									<Checkbox
										aria-label={`Select ${m.name}`}
										checked={picked.includes(m.url)}
										onChange={() => togglePicked(m.url)}
									/>
								</td>
								<td className="p-2">
									<button
										type="button"
										className="flex items-center gap-3 text-left hover:underline"
										onClick={() => setSelected(m.url)}
										aria-label={`Open ${m.title || m.name}`}
									>
										<img src={fresh(m)} alt="" className="size-10 rounded object-cover" loading="lazy" />
										<span className="truncate">{labelOf(m)}</span>
									</button>
								</td>
								<td className="p-2">{formatOf(m)}</td>
								<td className="p-2 tabular-nums">{sizeLabel(m.size)}</td>
								<td className="p-2 tabular-nums">{m.width && m.height ? `${m.width} × ${m.height}` : "—"}</td>
								<td className="p-2">{m.folder || "Main library"}</td>
								<td className="p-2">{new Date(m.modified).toLocaleDateString()}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
			{filtered.length > shown && (
				<div className="text-center">
					<Button variant="secondary" onClick={() => setShown((n) => n + PAGE)}>
						Show more ({shown} of {filtered.length})
					</Button>
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
					onChange={(e) => setNewFolder(e.target.value)}
				/>
			</Dialog>

			{current && (
				<MediaDetailDialog
					key={current.url}
					item={current}
					folders={folders}
					usage={usage}
					onClose={() => setSelected(null)}
					onSelect={setSelected}
				/>
			)}
			{pending && (
				<UploadDialog
					initial={pending}
					folders={folders}
					defaultFolder={folder === "all" ? "" : folder}
					onClose={() => setPending(null)}
					onSubmit={(files, metas) => {
						setPending(null);
						void queue.add(files, metas);
					}}
				/>
			)}
		</div>
	);
}
