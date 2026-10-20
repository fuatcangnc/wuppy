import {
	Calendar,
	Copy,
	ExternalLink,
	FileImage,
	HardDrive,
	Link,
	RefreshCw,
	RotateCcw,
	Ruler,
	Trash2,
} from "@react-zero-ui/icon-sprite";
import { useMemo, useRef, useState, type ReactNode } from "react";
import type { PercentCrop } from "react-image-crop";
import { ApiError } from "../../lib/api.ts";
import {
	createCroppedFilename,
	createCroppedImageFile,
	type CropAspectMode,
	type PixelCrop,
} from "../../lib/crop-image.ts";
import { uploadWithProgress } from "../../lib/upload.ts";
import { deleteMedia, loadMedia, replaceMedia, updateMedia, type MediaItem } from "../../stores/content.ts";
import {
	Button,
	Dialog,
	Input,
	Select,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
	Textarea,
	toast,
} from "../../ui/index.tsx";
import { FocalPointEditor, FocalPreviews, type Focal } from "./FocalPoint.tsx";
import { ImageCropper } from "./ImageCropper.tsx";

export interface Usage {
	collection: string;
	slug: string;
	title: string;
}

type Tab = "details" | "edit" | "used";
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
const ASPECTS: Array<[CropAspectMode, string]> = [
	["original", "Original"],
	["freeform", "Freeform"],
	["square", "Square (1:1)"],
	["4:3", "4:3"],
	["3:2", "3:2"],
	["16:9", "16:9"],
];

const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
export const sizeLabel = (bytes: number) =>
	bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
/** Replacing a file keeps its URL, so the modified time keeps browsers from showing the old picture. */
export const fresh = (m: Pick<MediaItem, "url" | "modified">) => `${m.url}?v=${encodeURIComponent(m.modified)}`;

function aspectNumber(mode: CropAspectMode, source: { width: number; height: number } | null) {
	if (mode === "freeform") return undefined;
	if (mode === "original") return source ? source.width / source.height : undefined;
	if (mode === "square") return 1;
	const [w, h] = mode.split(":").map(Number) as [number, number];
	return w / h;
}

/** Details, image editing (crop and focal point) and usage of one library file. */
export function MediaDetailDialog({
	item,
	folders,
	usage,
	usageLoading = false,
	onClose,
	onSelect,
}: {
	item: MediaItem;
	folders: string[];
	usage: Usage[];
	usageLoading?: boolean;
	onClose: () => void;
	/** Called with the URL of a new file (a cropped copy) so the page can open it. */
	onSelect: (url: string) => void;
}) {
	const [tab, setTab] = useState<Tab>("details");
	const [visited, setVisited] = useState<Set<Tab>>(() => new Set(["details"]));
	const selectTab = (next: Tab) => {
		setTab(next);
		setVisited((current) => (current.has(next) ? current : new Set(current).add(next)));
	};
	const [draft, setDraft] = useState({
		title: item.title ?? item.name.split("/").pop() ?? "",
		folder: item.folder ?? "",
		alt: item.alt ?? "",
		caption: item.caption ?? "",
	});
	const dirty =
		draft.title !== (item.title ?? item.name.split("/").pop()) ||
		draft.folder !== (item.folder ?? "") ||
		draft.alt !== (item.alt ?? "") ||
		draft.caption !== (item.caption ?? "");
	const replaceInput = useRef<HTMLInputElement>(null);

	const [mode, setMode] = useState<"crop" | "focal">("crop");
	const [aspect, setAspect] = useState<CropAspectMode>("original");
	const [crop, setCrop] = useState<PercentCrop>();
	const [pixels, setPixels] = useState<PixelCrop | null>(null);
	const [source, setSource] = useState<{ width: number; height: number } | null>(null);
	const [image, setImage] = useState<HTMLImageElement | null>(null);
	const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null);
	const [busy, setBusy] = useState(false);
	const original: Focal = { x: (item.focalX ?? 50) / 100, y: (item.focalY ?? 50) / 100 };
	const [focal, setFocal] = useState<Focal>(original);

	const mime = MIME[extOf(item.name)];
	const canCrop = !!mime;
	const src = fresh(item);
	const ratio = useMemo(() => aspectNumber(aspect, source), [aspect, source]);
	const focalChanged = focal.x !== original.x || focal.y !== original.y;

	const run = async (job: () => Promise<unknown>, done: string) => {
		setBusy(true);
		try {
			await job();
			toast(done);
		} catch (err) {
			toast((err as Error).message, "error");
		} finally {
			setBusy(false);
		}
	};
	const croppedFile = () => {
		if (!image || !pixels || !mime) throw new Error("Choose an area to keep first");
		return createCroppedImageFile(
			image,
			pixels,
			createCroppedFilename(item.name.split("/").pop() ?? "image", aspect, pixels),
			mime,
		);
	};
	const remove = async () => {
		if (!confirm("Delete this file? Git history keeps the old version.")) return;
		try {
			await deleteMedia(item.url);
		} catch (err) {
			if (!(err instanceof ApiError) || err.code !== "IN_USE") return toast((err as Error).message, "error");
			if (!confirm(`${err.message}. Delete anyway? Those entries will show a broken image.`)) return;
			await deleteMedia(item.url, true).catch((e: Error) => toast(e.message, "error"));
		}
		onClose();
	};

	const replaceButton = (
		<>
			<Button variant="secondary" onClick={() => replaceInput.current?.click()}>
				<RefreshCw size={14} /> Replace image
			</Button>
			<input
				ref={replaceInput}
				type="file"
				accept="image/png,image/jpeg,image/gif,image/webp"
				className="sr-only"
				tabIndex={-1}
				aria-label="Replace file"
				onChange={(e) => {
					const file = e.currentTarget.files?.[0];
					e.currentTarget.value = "";
					if (file) void run(() => replaceMedia(item.url, file), "File replaced");
				}}
			/>
		</>
	);
	const deleteButton = (
		<Button variant="destructive" onClick={() => void remove()}>
			<Trash2 size={14} /> Delete
		</Button>
	);

	const footer =
		tab === "edit" ? (
			<>
				<Button variant="secondary" onClick={onClose}>
					Cancel
				</Button>
				{mode === "crop" && canCrop ? (
					<>
						<Button
							variant="secondary"
							className="text-destructive"
							disabled={busy || !pixels}
							onClick={() => {
								if (!confirm("Replace the original with the cropped image? Git history keeps the old version.")) return;
								void run(async () => {
									await replaceMedia(item.url, await croppedFile());
									setCrop(undefined);
								}, "Original replaced");
							}}
						>
							Replace original
						</Button>
						<Button
							disabled={busy || !pixels}
							onClick={() =>
								void run(async () => {
									const file = await croppedFile();
									const url = await uploadWithProgress(file, {
										title: file.name,
										alt: item.alt,
										caption: item.caption,
										folder: item.folder,
									}).done;
									await loadMedia();
									onSelect(url);
								}, "Cropped copy created")
							}
						>
							Create cropped copy
						</Button>
					</>
				) : (
					<Button
						disabled={busy || !focalChanged}
						onClick={() =>
							void run(
								() =>
									updateMedia(item.url, {
										focalX: Math.round(focal.x * 1000) / 10,
										focalY: Math.round(focal.y * 1000) / 10,
									}),
								"Focal point saved",
							)
						}
					>
						Save focal point
					</Button>
				)}
			</>
		) : (
			<div className="flex w-full items-center justify-between gap-2">
				<div className="flex gap-2">
					{deleteButton}
					{tab === "details" && replaceButton}
				</div>
				<div className="flex gap-2">
					{tab === "details" ? (
						<>
							<Button variant="secondary" onClick={onClose}>
								Cancel
							</Button>
							<Button disabled={busy || !dirty} onClick={() => void run(() => updateMedia(item.url, draft), "Saved")}>
								Save
							</Button>
						</>
					) : (
						<Button variant="secondary" onClick={onClose}>
							Close
						</Button>
					)}
				</div>
			</div>
		);

	return (
		<Dialog
			open
			size="wide"
			title="Media details"
			description={item.title || item.name.split("/").pop()}
			onClose={onClose}
			footer={footer}
		>
			<Tabs value={tab} onChange={selectTab}>
				<div className="border-b border-border px-8 py-4">
					<TabsList stretch className="max-w-lg">
						<TabsTrigger value="details">Details</TabsTrigger>
						<TabsTrigger value="edit">Edit image</TabsTrigger>
						<TabsTrigger value="used">Used in</TabsTrigger>
					</TabsList>
				</div>

				<TabsContent value="details" forceMount className="grid md:grid-cols-2">
					<div className="grid content-start gap-4 border-border p-6 md:border-r">
						<img
							src={src}
							alt={item.alt ?? ""}
							data-testid="media-preview"
							className="wuppy-checkerboard max-h-80 w-full rounded-xl object-contain ring-1 ring-border"
							onLoad={(e) => {
								const { naturalWidth: width, naturalHeight: height } = e.currentTarget;
								if (width > 0 && height > 0) setMeasured({ width, height });
							}}
						/>
						<dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
							<Meta icon={<HardDrive size={14} />} label="Size">
								{sizeLabel(item.size)}
							</Meta>
							<Meta icon={<Ruler size={14} />} label="Dimensions">
								{item.width && item.height
									? `${item.width} × ${item.height}`
									: measured
										? `${measured.width} × ${measured.height}`
										: "—"}
							</Meta>
							<Meta icon={<Calendar size={14} />} label="Uploaded">
								{new Date(item.modified).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
							</Meta>
							<Meta icon={<FileImage size={14} />} label="Format">
								{extOf(item.name) === "jpg" ? "JPEG" : extOf(item.name).toUpperCase()}
							</Meta>
						</dl>
						<div className="flex items-center gap-2 text-sm">
							<Link size={14} className="shrink-0 text-muted-foreground" />
							<span className="text-muted-foreground">URL:</span>
							<div className="flex min-w-0 flex-1 items-center rounded-md border border-input">
								<input
									readOnly
									aria-label="URL"
									value={item.url}
									className="min-w-0 flex-1 truncate bg-transparent px-3 py-1.5 font-mono text-xs outline-none"
								/>
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label="Copy URL"
									onClick={() => void navigator.clipboard.writeText(item.url).then(() => toast("URL copied"))}
								>
									<Copy size={14} />
								</Button>
							</div>
						</div>
					</div>
					<div className="grid content-start gap-5 p-6">
						<Input
							label="Filename"
							title="The name shown in the library. The stored file keeps its unique id."
							value={draft.title}
							onChange={(e) => setDraft({ ...draft, title: e.target.value })}
						/>
						<Select
							label="Location"
							value={draft.folder}
							onChange={(e) => setDraft({ ...draft, folder: e.target.value })}
						>
							<option value="">Main library</option>
							{folders.map((f) => (
								<option key={f} value={f}>
									{f}
								</option>
							))}
						</Select>
						<Textarea
							label="Alt text"
							title="Describe the image for people who cannot see it."
							placeholder="Describe the image for screen readers"
							value={draft.alt}
							onChange={(e) => setDraft({ ...draft, alt: e.target.value })}
						/>
						<Textarea
							label="Caption"
							rows={4}
							placeholder="Optional caption for display"
							value={draft.caption}
							onChange={(e) => setDraft({ ...draft, caption: e.target.value })}
						/>
					</div>
				</TabsContent>

				<TabsContent value="edit" forceMount={visited.has("edit")} className="grid md:grid-cols-2">
					<div className="border-border p-6 md:border-r">
						{mode === "crop" && canCrop ? (
							<ImageCropper
								key={src}
								src={src}
								crop={crop}
								aspect={ratio}
								disabled={busy}
								onCropChange={setCrop}
								onCropComplete={setPixels}
								onImageReady={setImage}
								onSourceReady={setSource}
							/>
						) : (
							<FocalPointEditor src={src} point={focal} onChange={setFocal} />
						)}
					</div>
					<div className="grid content-start gap-5 p-6">
						<Tabs
							stretch
							value={canCrop ? mode : "focal"}
							onChange={setMode}
							items={[
								...(canCrop ? [{ value: "crop" as const, label: "Crop" }] : []),
								{ value: "focal" as const, label: "Focal point" },
							]}
						/>
						{mode === "crop" && canCrop ? (
							<>
								<div className="flex items-end gap-2">
									<div className="flex-1">
										<Select
											label="Aspect ratio"
											value={aspect}
											onChange={(e) => {
												setAspect(e.target.value as CropAspectMode);
												setCrop(undefined);
											}}
										>
											{ASPECTS.map(([value, label]) => (
												<option key={value} value={value}>
													{label}
												</option>
											))}
										</Select>
									</div>
									<Button
										variant="secondary"
										onClick={() => {
											setAspect("original");
											setCrop(undefined);
										}}
									>
										<RotateCcw size={14} /> Reset
									</Button>
								</div>
								<div className="flex items-center justify-between rounded-lg bg-muted px-4 py-2.5 text-sm">
									<span className="text-muted-foreground">Output size</span>
									<span className="tabular-nums">{pixels ? `${pixels.width} × ${pixels.height}` : "—"}</span>
								</div>
							</>
						) : (
							<>
								<p className="text-sm text-muted-foreground">
									Click or drag on the image to choose the part that stays visible when themes crop it.
								</p>
								<FocalPreviews src={src} point={focal} />
								<Button variant="secondary" size="sm" onClick={() => setFocal({ x: 0.5, y: 0.5 })}>
									<RotateCcw size={14} /> Reset to center
								</Button>
							</>
						)}
					</div>
				</TabsContent>

				<TabsContent value="used" forceMount={visited.has("used")} className="grid max-w-xl gap-3 p-6">
					<div>
						<h3 className="font-semibold">Used in</h3>
						<p className="text-sm text-muted-foreground">See where this file is used.</p>
					</div>
					{usageLoading ? (
						<p role="status" className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
							Checking where this file is used…
						</p>
					) : usage.length === 0 ? (
						<p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
							Not referenced by any entry.
						</p>
					) : (
						usage.map((u) => (
							<a
								key={`${u.collection}:${u.slug}`}
								href={`/admin/e/${u.collection}/${u.slug}`}
								className="flex items-center gap-3 rounded-lg border p-3 text-sm hover:bg-muted"
							>
								<span className="grid size-10 place-items-center rounded-md bg-muted text-muted-foreground">
									<FileImage size={16} />
								</span>
								<span className="min-w-0 flex-1">
									<span className="block truncate font-medium">{u.title}</span>
									<span className="text-xs text-muted-foreground capitalize">{u.collection}</span>
								</span>
								<span className="inline-flex items-center gap-1">
									Open <ExternalLink size={14} />
								</span>
							</a>
						))
					)}
				</TabsContent>
			</Tabs>
		</Dialog>
	);
}

function Meta({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
	return (
		<div className="flex items-center gap-2">
			<span className="text-muted-foreground">{icon}</span>
			<dt className="text-muted-foreground">{label}:</dt>
			<dd className="tabular-nums">{children}</dd>
		</div>
	);
}
