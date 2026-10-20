import { Pencil, Trash2, Upload } from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { useEffect, useMemo, useState } from "react";
import { apiData } from "../../lib/api.ts";
import { $media, $mediaFolders, deleteMedia, loadMedia, saveMediaFolders, updateMedia, uploadImage } from "../../stores/content.ts";
import {
	Badge,
	Button,
	Dialog,
	EmptyState,
	Input,
	PageHeader,
	Select,
	Textarea,
	toast,
} from "../../ui/index.tsx";

export function MediaPage() {
	const items = useStore($media);
	const folders = useStore($mediaFolders);
	const [folder, setFolder] = useState("all");
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<string | null>(null);
	const [usage, setUsage] = useState<Array<{ collection: string; slug: string; title: string }>>([]);
	const [newFolder, setNewFolder] = useState("");
	const [uploading, setUploading] = useState(false);

	useEffect(() => void loadMedia(), []);
	const current = items.find((m) => m.url === selected) ?? null;
	useEffect(() => {
		if (!current) return;
		void apiData<Array<{ collection: string; slug: string; title: string }>>(
			"GET",
			`/api/media/usage?url=${encodeURIComponent(current.url)}`,
		)
			.then(setUsage)
			.catch(() => setUsage([]));
	}, [current]);

	const filtered = useMemo(
		() =>
			items.filter((item) => {
				if (folder !== "all" && (item.folder ?? "") !== folder) return false;
				if (query && !`${item.name} ${item.alt ?? ""}`.toLowerCase().includes(query.toLowerCase())) return false;
				return true;
			}),
		[items, folder, query],
	);

	const upload = async (file: File) => {
		setUploading(true);
		try {
			await uploadImage(file, { folder: folder === "all" ? undefined : folder });
			await loadMedia();
			toast("Image uploaded");
		} catch (e) {
			toast((e as Error).message, "error");
		} finally {
			setUploading(false);
		}
	};

	return (
		<div className="grid gap-4">
			<PageHeader
				title="Media"
				description={`${items.length} files`}
				actions={
					<label className="contents">
						<span className="sr-only">Upload image</span>
						<Input
							type="file"
							accept="image/png,image/jpeg,image/gif,image/webp"
							className="hidden"
							onChange={(e) => {
								const f = e.target.files?.[0];
								e.target.value = "";
								if (f) void upload(f);
							}}
						/>
						<Button><Upload size={14} /> {uploading ? "Uploading…" : "Upload media"}</Button>
					</label>
				}
			/>

			<div className="flex flex-wrap items-end gap-2">
				<Input label="Search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or alt text" />
				<Select label="Folder" value={folder} onChange={(e) => setFolder(e.target.value)}>
					<option value="all">All folders</option>
					<option value="">Unfiled</option>
					{folders.map((f) => (
						<option key={f} value={f}>
							{f}
						</option>
					))}
				</Select>
				<div className="flex items-end gap-2">
					<Input label="New folder" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} />
					<Button
						variant="secondary"
						disabled={!newFolder.trim() || folders.includes(newFolder.trim())}
						onClick={() => {
							void saveMediaFolders([...folders, newFolder.trim()]).then(() => {
								setNewFolder("");
								toast("Folder created");
							});
						}}
					>
						Add folder
					</Button>
				</div>
			</div>

			{filtered.length === 0 ? (
				<EmptyState title="No media yet" description="Upload an image or change the filters." />
			) : (
				<ul className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
					{filtered.map((m) => (
						<li key={m.url} className="grid gap-2 rounded-ui border border-border bg-card p-2">
							<Button
								variant="ghost"
								className="h-auto p-0"
								onClick={() => setSelected(m.url)}
								aria-label={`Open ${m.name}`}
							>
								<img src={m.url} alt={m.alt ?? ""} className="h-28 w-full rounded-md object-cover" loading="lazy" />
							</Button>
							<div className="flex items-center justify-between gap-1 text-xs">
								<span className="truncate text-muted-foreground">{m.name.split("/").pop()}</span>
								{m.folder && <Badge>{m.folder}</Badge>}
							</div>
							<div className="flex gap-1">
								<Button
									variant="ghost"
									size="sm"
									onClick={() => void navigator.clipboard.writeText(m.url).then(() => toast("URL copied"))}
								>
									Copy URL
								</Button>
								<Button variant="ghost" size="sm" onClick={() => setSelected(m.url)}>
									<Pencil size={14} /> Edit
								</Button>
							</div>
						</li>
					))}
				</ul>
			)}

			<Dialog open={!!current} title="Media details" onClose={() => setSelected(null)}>
				{current && (
					<div className="grid gap-3">
						<img
							src={current.url}
							alt={current.alt ?? ""}
							className="max-h-60 rounded-md object-contain"
							style={{ objectPosition: `${current.focalX ?? 50}% ${current.focalY ?? 50}%` }}
						/>
						<div className="grid grid-cols-2 gap-3">
							<Input
								label="Focal X (%)"
								type="number"
								min={0}
								max={100}
								value={current.focalX ?? 50}
								onChange={(e) => void updateMedia(current.url, { focalX: Number(e.target.value) })}
							/>
							<Input
								label="Focal Y (%)"
								type="number"
								min={0}
								max={100}
								value={current.focalY ?? 50}
								onChange={(e) => void updateMedia(current.url, { focalY: Number(e.target.value) })}
							/>
						</div>
						<Input
							label="Alt text"
							value={current.alt ?? ""}
							onChange={(e) => void updateMedia(current.url, { alt: e.target.value })}
							hint="Describe the image for screen readers."
						/>
						<Input
							label="Title"
							value={current.title ?? ""}
							onChange={(e) => void updateMedia(current.url, { title: e.target.value })}
						/>
						<Textarea
							label="Caption"
							value={current.caption ?? ""}
							onChange={(e) => void updateMedia(current.url, { caption: e.target.value })}
						/>
						<Select
							label="Folder"
							value={current.folder ?? ""}
							onChange={(e) => void updateMedia(current.url, { folder: e.target.value })}
						>
							<option value="">Unfiled</option>
							{folders.map((f) => (
								<option key={f}>{f}</option>
							))}
						</Select>
						<div>
							<p className="text-sm font-medium">Used in</p>
							{usage.length === 0 ? (
								<p className="text-xs text-muted-foreground">Not referenced by any entry.</p>
							) : (
								<ul className="mt-1 grid gap-1 text-xs">
									{usage.map((item) => (
										<li key={`${item.collection}:${item.slug}`}>
											<a href={`/admin/e/${item.collection}/${item.slug}`} className="text-primary hover:underline">
												{item.title} <span className="text-muted-foreground">({item.collection})</span>
											</a>
										</li>
									))}
								</ul>
							)}
						</div>
						<div className="flex justify-between">
							<Button
								variant="destructive"
								onClick={() => {
									if (!confirm("Delete this file? Git history keeps the old version.")) return;
									void deleteMedia(current.url).then(() => setSelected(null));
								}}
							>
								<Trash2 size={14} /> Delete
							</Button>
							<Button variant="secondary" onClick={() => setSelected(null)}>
								Close
							</Button>
						</div>
					</div>
				)}
			</Dialog>
		</div>
	);
}
