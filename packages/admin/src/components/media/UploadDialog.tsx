import { RefreshCw, Upload, X } from "@react-zero-ui/icon-sprite";
import { useEffect, useRef, useState } from "react";
import { imagesFrom, uploadWithProgress, type UploadHandle } from "../../lib/upload.ts";
import { Button, Dialog } from "../../ui/index.tsx";
import { sizeLabel } from "./MediaDetailDialog.tsx";

const ACCEPT = "image/png,image/jpeg,image/gif,image/webp";
const ALLOWED = new Set(ACCEPT.split(","));

type UploadState = "queued" | "uploading" | "done" | "failed";

interface Entry {
	id: number;
	file: File;
	preview: string;
	state: UploadState;
	fraction: number;
	error?: string;
	url?: string;
}

let nextId = 0;
const previewOf = (file: File) => URL.createObjectURL?.(file) ?? "";

/**
 * Add files and they upload immediately. The dialog stays open to show
 * progress, failures and retries; metadata is edited later in Media details.
 */
export function UploadDialog({
	initial,
	folder,
	onClose,
	onDone,
}: {
	initial: File[];
	/** Library folder for this upload; omit for the main library. */
	folder?: string;
	onClose: () => void;
	/** Close after Done, passing the URLs that uploaded successfully. */
	onDone: (urls: string[]) => void;
}) {
	const [entries, setEntries] = useState<Entry[]>([]);
	const entriesRef = useRef<Entry[]>([]);
	const queue = useRef<number[]>([]);
	const handles = useRef(new Map<number, UploadHandle>());
	const previews = useRef(new Set<string>());
	const running = useRef(false);
	const mounted = useRef(true);
	const cleanupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const initialRef = useRef(initial);
	const started = useRef(false);
	const input = useRef<HTMLInputElement>(null);
	const [dragging, setDragging] = useState(false);

	const commit = (next: Entry[]) => {
		entriesRef.current = next;
		setEntries(next);
	};
	const patch = (id: number, change: Partial<Entry>) =>
		commit(entriesRef.current.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)));

	const pump = async () => {
		if (running.current) return;
		running.current = true;
		while (mounted.current && queue.current.length > 0) {
			const id = queue.current.shift();
			if (id === undefined) break;
			const entry = entriesRef.current.find((item) => item.id === id);
			if (!entry || entry.state === "done") continue;
			patch(id, { state: "uploading", fraction: 0, error: undefined });
			const handle = uploadWithProgress(
				entry.file,
				{ title: entry.file.name, ...(folder ? { folder } : {}) },
				(fraction) => {
					if (mounted.current) patch(id, { fraction });
				},
			);
			handles.current.set(id, handle);
			try {
				const url = await handle.done;
				if (mounted.current) patch(id, { state: "done", fraction: 1, url, error: undefined });
			} catch (e) {
				if (mounted.current && (e as Error).name !== "AbortError") {
					patch(id, { state: "failed", error: (e as Error).message });
				}
			} finally {
				handles.current.delete(id);
			}
		}
		running.current = false;
	};

	const add = (files: File[]) => {
		const accepted = files.filter((file) => ALLOWED.has(file.type));
		if (accepted.length === 0) return;
		const added = accepted.map((file): Entry => {
			const preview = previewOf(file);
			if (preview) previews.current.add(preview);
			return { id: nextId++, file, preview, state: "queued", fraction: 0 };
		});
		commit([...entriesRef.current, ...added]);
		queue.current.push(...added.map((entry) => entry.id));
		void pump();
	};

	const retry = (id: number) => {
		const entry = entriesRef.current.find((item) => item.id === id);
		if (!entry || entry.state !== "failed") return;
		patch(id, { state: "queued", fraction: 0, error: undefined });
		queue.current.push(id);
		void pump();
	};

	const retryFailed = () => {
		const ids = entriesRef.current.filter((entry) => entry.state === "failed").map((entry) => entry.id);
		if (ids.length === 0) return;
		for (const id of ids) patch(id, { state: "queued", fraction: 0, error: undefined });
		queue.current.push(...ids);
		void pump();
	};

	const remove = (id: number) => {
		const entry = entriesRef.current.find((item) => item.id === id);
		handles.current.get(id)?.cancel();
		handles.current.delete(id);
		queue.current = queue.current.filter((queued) => queued !== id);
		if (entry?.preview) {
			URL.revokeObjectURL?.(entry.preview);
			previews.current.delete(entry.preview);
		}
		commit(entriesRef.current.filter((item) => item.id !== id));
	};

	const close = () => {
		mounted.current = false;
		queue.current = [];
		for (const handle of handles.current.values()) handle.cancel();
		handles.current.clear();
		for (const preview of previews.current) URL.revokeObjectURL?.(preview);
		previews.current.clear();
		onClose();
	};

	const done = () => {
		const urls = entriesRef.current.flatMap((entry) => (entry.state === "done" && entry.url ? [entry.url] : []));
		onDone(urls);
	};

	useEffect(() => {
		mounted.current = true;
		if (cleanupTimer.current) {
			clearTimeout(cleanupTimer.current);
			cleanupTimer.current = null;
		}
		if (!started.current) {
			started.current = true;
			add(initialRef.current);
		}
		return () => {
			mounted.current = false;
			// Defer teardown: React StrictMode runs setup/cleanup/setup in dev.
			cleanupTimer.current = setTimeout(() => {
				if (mounted.current) return;
				for (const handle of handles.current.values()) handle.cancel();
				handles.current.clear();
				for (const preview of previews.current) URL.revokeObjectURL?.(preview);
				previews.current.clear();
			}, 0);
		};
		// The initial batch is consumed once; later files are added by the drop zone.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const doneCount = entries.filter((entry) => entry.state === "done").length;
	const failedCount = entries.filter((entry) => entry.state === "failed").length;
	const busy = entries.some((entry) => entry.state === "queued" || entry.state === "uploading");

	return (
		<Dialog
			open
			title="Upload to Library"
			size="medium"
			description="Files upload as soon as you add them."
			onClose={close}
			footer={
				<div className="flex w-full flex-wrap items-center justify-between gap-3">
					<p className="text-sm text-muted-foreground">
						{doneCount} of {entries.length} complete
					</p>
					<div className="flex gap-2">
						<Button variant="secondary" disabled={failedCount === 0 || busy} onClick={retryFailed}>
							<RefreshCw size={14} /> Retry failed
						</Button>
						<Button disabled={busy || entries.length === 0} onClick={done}>
							Done
						</Button>
					</div>
				</div>
			}
		>
			<div className="grid gap-4 p-6">
				<div
					className={`grid justify-items-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors sm:py-20 ${
						dragging ? "border-primary bg-muted/40" : "border-border"
					}`}
					onDragOver={(event) => {
						event.preventDefault();
						setDragging(true);
					}}
					onDragLeave={() => setDragging(false)}
					onDrop={(event) => {
						event.preventDefault();
						event.stopPropagation();
						setDragging(false);
						add(imagesFrom(event.dataTransfer));
					}}
				>
					<span className="grid size-16 place-items-center rounded-full border border-border bg-background text-muted-foreground">
						<Upload size={24} />
					</span>
					<div className="grid gap-1">
						<p className="text-lg font-semibold">Drag and drop files here</p>
						<p className="text-sm text-muted-foreground">Or browse files from your computer</p>
					</div>
					<Button variant="secondary" onClick={() => input.current?.click()}>
						<Upload size={14} /> Browse files
					</Button>
					<input
						ref={input}
						type="file"
						multiple
						accept={ACCEPT}
						className="sr-only"
						tabIndex={-1}
						aria-label="Choose files to upload"
						onChange={(event) => {
							add(imagesFrom(event.currentTarget));
							event.currentTarget.value = "";
						}}
					/>
				</div>

				{entries.length > 0 && (
					<ul className="grid gap-2" aria-label="Upload queue">
						{entries.map((entry) => {
							const percent = Math.round(entry.fraction * 100);
							return (
								<li key={entry.id} className="flex items-center gap-3 rounded-lg border p-3">
									<div className="wuppy-checkerboard grid h-12 w-16 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted">
										{entry.preview ? (
											<img src={entry.preview} alt="" className="h-full w-full object-cover" />
										) : (
											<Upload size={16} className="text-muted-foreground" />
										)}
									</div>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium" title={entry.file.name}>
											{entry.file.name}
										</p>
										<p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
											{entry.state === "queued" && (
												<span className="size-2 shrink-0 rounded-full bg-muted-foreground" />
											)}
											{entry.state === "uploading" && (
												<span className="size-2 shrink-0 animate-pulse rounded-full bg-primary" />
											)}
											{entry.state === "done" && <span className="size-2 shrink-0 rounded-full bg-emerald-500" />}
											{entry.state === "failed" && <span className="size-2 shrink-0 rounded-full bg-destructive" />}
											<span className={entry.state === "failed" ? "truncate text-destructive" : "truncate"}>
												{entry.state === "queued" && "Waiting…"}
												{entry.state === "uploading" && `Uploading… ${percent}%`}
												{entry.state === "done" && "Uploaded"}
												{entry.state === "failed" && "Upload failed"}
											</span>
											<span className="shrink-0">· {sizeLabel(entry.file.size)}</span>
										</p>
										{entry.state === "uploading" && (
											<progress
												aria-label={`Progress of ${entry.file.name}`}
												value={entry.fraction}
												max={1}
												className="mt-1.5 h-1 w-full"
											/>
										)}
										{entry.state === "failed" && entry.error && (
											<p className="truncate text-xs text-muted-foreground" title={entry.error}>
												{entry.error}
											</p>
										)}
									</div>
									<div className="flex shrink-0 items-center gap-1">
										{entry.state === "failed" && (
											<Button
												variant="ghost"
												size="icon-sm"
												aria-label={`Retry ${entry.file.name}`}
												onClick={() => retry(entry.id)}
											>
												<RefreshCw size={14} />
											</Button>
										)}
										<Button
											variant="ghost"
											size="icon-sm"
											aria-label={`Remove ${entry.file.name}`}
											onClick={() => remove(entry.id)}
										>
											<X size={14} />
										</Button>
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</Dialog>
	);
}
