import { useRef, useState } from "react";
import { uploadWithProgress, type UploadHandle, type UploadMeta } from "../../lib/upload.ts";
import { Button } from "../../ui/index.tsx";

interface Job {
	id: number;
	name: string;
	state: "uploading" | "done" | "failed" | "cancelled";
	fraction: number;
	error?: string;
}

/**
 * Uploads several files one after another and shows progress with a cancel button per file.
 * `add(files)` is returned through `onReady` so a drop zone or paste handler elsewhere can feed it.
 */
export function useUploadQueue(folder: string | undefined, onUploaded: (urls: string[]) => void) {
	const [jobs, setJobs] = useState<Job[]>([]);
	const handles = useRef(new Map<number, UploadHandle>());
	const next = useRef(0);

	const patch = (id: number, change: Partial<Job>) =>
		setJobs((all) => all.map((j) => (j.id === id ? { ...j, ...change } : j)));

	/** `metas[i]` is stored with `files[i]`; the queue folder is used where it has none. */
	const add = async (files: File[], metas: UploadMeta[] = []) => {
		const queued = files.map((file, i) => ({ file, id: next.current++, meta: metas[i] ?? {} }));
		setJobs((all) => [
			...all,
			...queued.map(({ file, id, meta }): Job => ({
				id,
				name: meta.title || file.name,
				state: "uploading",
				fraction: 0,
			})),
		]);
		const urls: string[] = [];
		for (const { file, id, meta } of queued) {
			const handle = uploadWithProgress(file, { folder, ...meta }, (fraction) => patch(id, { fraction }));
			handles.current.set(id, handle);
			try {
				urls.push(await handle.done);
				patch(id, { state: "done", fraction: 1 });
			} catch (e) {
				const cancelled = (e as Error).name === "AbortError";
				patch(id, { state: cancelled ? "cancelled" : "failed", error: cancelled ? undefined : (e as Error).message });
			}
			handles.current.delete(id);
		}
		// A batch that fully succeeded needs no list; failures and cancellations stay visible.
		if (urls.length === queued.length) setJobs((all) => all.filter((j) => !queued.some((q) => q.id === j.id)));
		if (urls.length) onUploaded(urls);
	};

	return {
		jobs,
		add,
		cancel: (id: number) => handles.current.get(id)?.cancel(),
		clear: () => setJobs((all) => all.filter((j) => j.state === "uploading")),
	};
}

export function UploadList({
	jobs,
	cancel,
	clear,
}: Pick<ReturnType<typeof useUploadQueue>, "jobs" | "cancel" | "clear">) {
	if (jobs.length === 0) return null;
	return (
		<div className="grid gap-1 rounded-md border p-3 text-sm" aria-label="Uploads">
			{jobs.map((j) => (
				<div key={j.id} className="flex items-center gap-2">
					<span className="min-w-0 flex-1 truncate">{j.name}</span>
					{j.state === "uploading" && (
						<>
							<progress aria-label={`Progress of ${j.name}`} value={j.fraction} max={1} className="w-32" />
							<Button size="sm" variant="ghost" aria-label={`Cancel ${j.name}`} onClick={() => cancel(j.id)}>
								Cancel
							</Button>
						</>
					)}
					{j.state === "done" && <span className="text-muted-foreground">Uploaded</span>}
					{j.state === "cancelled" && <span className="text-muted-foreground">Cancelled</span>}
					{j.state === "failed" && (
						<span role="alert" className="text-destructive">
							{j.error ?? "Failed"}
						</span>
					)}
				</div>
			))}
			<div>
				<Button size="sm" variant="ghost" onClick={clear}>
					Clear finished
				</Button>
			</div>
		</div>
	);
}
