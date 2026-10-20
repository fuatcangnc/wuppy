import { useRef, useState } from "react";
import { apiData } from "../../lib/api.ts";
import { Badge, Button, Card, CardHeader, Checkbox, ErrorText, Input, Select, toast } from "../../ui/index.tsx";

export interface JobState {
	id: string;
	status: "ready" | "running" | "done" | "rolled-back";
	total: number;
	cursor: number;
	analysis: {
		posts: number;
		pages: number;
		drafts: number;
		attachments: number;
		images: number;
		authors: number;
		categories: number;
		tags: number;
		menus: number;
		conflicts: string[];
		unusable: number;
	};
	created: unknown[];
	media: string[];
	redirects: number;
	skipped: string[];
	errors: string[];
}

const BATCH = 25;

export function WordpressImport({ file }: { file: File | null }) {
	const [collection, setCollection] = useState("posts");
	const [pageCollection, setPageCollection] = useState("");
	const [onConflict, setOnConflict] = useState<"skip" | "rename">("skip");
	const [downloadMedia, setDownloadMedia] = useState(false);
	const [job, setJob] = useState<JobState | null>(null);
	const [running, setRunning] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const paused = useRef(false);

	const fail = (e: unknown) => {
		setError((e as Error).message);
		setRunning(false);
	};

	const analyze = async () => {
		if (!file) return;
		setError(null);
		try {
			setJob(
				await apiData<JobState>("POST", "/api/import/wordpress/jobs", {
					xml: await file.text(),
					collection,
					...(pageCollection ? { pageCollection } : {}),
					onConflict,
					downloadMedia,
				}),
			);
		} catch (e) {
			fail(e);
		}
	};

	// Runs batch after batch until the job is done or Pause is pressed; Resume simply calls it again.
	const run = async (id: string) => {
		paused.current = false;
		setRunning(true);
		setError(null);
		try {
			for (;;) {
				const next = await apiData<JobState>("POST", `/api/import/wordpress/jobs/${id}/run`, { batch: BATCH });
				setJob(next);
				if (next.status === "done") {
					toast("Import finished");
					break;
				}
				if (paused.current) break;
			}
		} catch (e) {
			setError((e as Error).message);
		}
		setRunning(false);
	};

	const rollback = async () => {
		if (!job || !confirm("Undo this import? Imported entries move to the trash and imported media is deleted.")) return;
		try {
			setJob(await apiData<JobState>("POST", `/api/import/wordpress/jobs/${job.id}/rollback`, {}));
			toast("Import rolled back");
		} catch (e) {
			fail(e);
		}
	};

	const a = job?.analysis;
	return (
		<div className="grid gap-4">
			<ErrorText>{error}</ErrorText>
			{!job && (
				<Card>
					<CardHeader title="Options" />
					<div className="grid gap-3 p-4">
						<Input label="Posts go to collection" value={collection} onChange={(e) => setCollection(e.target.value)} />
						<Input
							label="Pages go to collection"
							hint="Leave empty to skip WordPress pages."
							value={pageCollection}
							onChange={(e) => setPageCollection(e.target.value)}
						/>
						<Select
							label="If a slug already exists"
							value={onConflict}
							onChange={(e) => setOnConflict(e.target.value as typeof onConflict)}
						>
							<option value="skip">Skip it</option>
							<option value="rename">Import it as slug-2</option>
						</Select>
						<Checkbox
							label="Download images from the old site into the media library"
							checked={downloadMedia}
							onChange={(e) => setDownloadMedia(e.target.checked)}
						/>
						<Button disabled={!file} onClick={() => void analyze()}>
							Analyze file
						</Button>
					</div>
				</Card>
			)}
			{job && a && (
				<Card>
					<CardHeader title="Analysis" description={`${job.status}`} />
					<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 p-4 text-sm">
						<dt>Posts / pages</dt>
						<dd>
							{a.posts} / {a.pages} ({a.drafts} drafts)
						</dd>
						<dt>Authors</dt>
						<dd>{a.authors}</dd>
						<dt>Categories / tags</dt>
						<dd>
							{a.categories} / {a.tags}
						</dd>
						<dt>Menus</dt>
						<dd>{a.menus}</dd>
						<dt>Images in posts</dt>
						<dd>{a.images}</dd>
						<dt>Cannot import</dt>
						<dd>{a.unusable} (no title or slug)</dd>
						<dt>Already exist</dt>
						<dd>{a.conflicts.length ? a.conflicts.join(", ") : "none"}</dd>
					</dl>
					<div className="grid gap-3 p-4">
						<progress aria-label="Import progress" value={job.cursor} max={job.total} className="w-full" />
						<p className="text-sm">
							{job.cursor} / {job.total} processed · {job.created.length} created · {job.redirects} redirects ·{" "}
							{job.media.length} images
							{job.status === "done" && <Badge>done</Badge>}
						</p>
						<div className="flex gap-2">
							{job.status !== "done" && job.status !== "rolled-back" && !running && (
								<Button onClick={() => void run(job.id)}>{job.cursor === 0 ? "Start import" : "Resume"}</Button>
							)}
							{running && (
								<Button variant="ghost" onClick={() => (paused.current = true)}>
									Pause
								</Button>
							)}
							{job.cursor > 0 && job.status !== "rolled-back" && !running && (
								<Button variant="ghost" onClick={() => void rollback()}>
									Undo import
								</Button>
							)}
						</div>
						{[...job.skipped, ...job.errors].length > 0 && (
							<ul className="list-disc pl-5 text-xs text-muted-foreground" aria-label="Import report">
								{[...job.skipped, ...job.errors].map((line) => (
									<li key={line}>{line}</li>
								))}
							</ul>
						)}
					</div>
				</Card>
			)}
		</div>
	);
}
