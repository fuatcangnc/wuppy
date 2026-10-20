import { Upload, X } from "@react-zero-ui/icon-sprite";
import { useEffect, useRef, useState } from "react";
import { imagesFrom, type UploadMeta } from "../../lib/upload.ts";
import { Button, Dialog, Input, Select, Textarea } from "../../ui/index.tsx";

const ACCEPT = "image/png,image/jpeg,image/gif,image/webp";

interface Entry {
	id: number;
	file: File;
	preview: string;
	title: string;
	alt: string;
	caption: string;
	folder: string;
}

let nextId = 0;
const entryOf = (file: File, folder: string): Entry => ({
	id: nextId++,
	file,
	// jsdom has no object URLs; the preview is skipped there.
	preview: URL.createObjectURL?.(file) ?? "",
	title: file.name,
	alt: "",
	caption: "",
	folder,
});

/** Choose or drop images, then give each one its filename, location, alt text and caption before it uploads. */
export function UploadDialog({
	initial,
	folders,
	defaultFolder,
	onClose,
	onSubmit,
}: {
	initial: File[];
	folders: string[];
	defaultFolder: string;
	onClose: () => void;
	onSubmit: (files: File[], metas: UploadMeta[]) => void;
}) {
	const [entries, setEntries] = useState<Entry[]>(() => initial.map((f) => entryOf(f, defaultFolder)));
	const input = useRef<HTMLInputElement>(null);
	const latest = useRef(entries);
	latest.current = entries;
	useEffect(
		() => () => {
			for (const e of latest.current) if (e.preview) URL.revokeObjectURL(e.preview);
		},
		[],
	);

	const add = (files: File[]) => setEntries((all) => [...all, ...files.map((f) => entryOf(f, defaultFolder))]);
	const patch = (id: number, change: Partial<Entry>) =>
		setEntries((all) => all.map((e) => (e.id === id ? { ...e, ...change } : e)));
	const remove = (id: number) => {
		const gone = entries.find((e) => e.id === id);
		if (gone?.preview) URL.revokeObjectURL(gone.preview);
		setEntries((all) => all.filter((e) => e.id !== id));
	};

	return (
		<Dialog
			open
			title="Upload files"
			size="wide"
			description="Give each image its details before it uploads."
			onClose={onClose}
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button
						disabled={entries.length === 0}
						onClick={() =>
							onSubmit(
								entries.map((e) => e.file),
								entries.map(({ title, alt, caption, folder }) => ({ title, alt, caption, folder })),
							)
						}
					>
						<Upload size={14} /> Upload {entries.length > 1 ? `${entries.length} files` : entries.length ? "file" : ""}
					</Button>
				</>
			}
		>
			<div className="grid gap-4 p-6">
				<div
					className="grid justify-items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center"
					onDragOver={(e) => e.preventDefault()}
					onDrop={(e) => {
						e.preventDefault();
						e.stopPropagation();
						add(imagesFrom(e.dataTransfer));
					}}
				>
					<p className="font-medium">Drag and drop images here</p>
					<p className="text-sm text-muted-foreground">or choose them from your computer. PNG, JPEG, GIF or WebP.</p>
					<Button variant="secondary" onClick={() => input.current?.click()}>
						Browse files
					</Button>
					<input
						ref={input}
						type="file"
						multiple
						accept={ACCEPT}
						className="sr-only"
						tabIndex={-1}
						aria-label="Choose files to upload"
						onChange={(e) => {
							add(imagesFrom(e.currentTarget));
							e.currentTarget.value = "";
						}}
					/>
				</div>

				<ul className="grid gap-3">
					{entries.map((e) => (
						<li key={e.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[8rem_1fr]">
							<div className="grid content-start gap-2">
								{e.preview ? (
									<img src={e.preview} alt="" className="wuppy-checkerboard h-24 w-full rounded-md object-cover" />
								) : (
									<div className="h-24 rounded-md bg-muted" />
								)}
								<Button variant="ghost" size="sm" aria-label={`Remove ${e.file.name}`} onClick={() => remove(e.id)}>
									<X size={14} /> Remove
								</Button>
							</div>
							<div className="grid gap-3">
								<Input
									label="Filename"
									value={e.title}
									onChange={(ev) => patch(e.id, { title: ev.target.value })}
									aria-label={`Filename of ${e.file.name}`}
								/>
								<Select
									label="Location"
									value={e.folder}
									onChange={(ev) => patch(e.id, { folder: ev.target.value })}
									aria-label={`Location of ${e.file.name}`}
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
									hint="Describe the image for people who cannot see it."
									value={e.alt}
									onChange={(ev) => patch(e.id, { alt: ev.target.value })}
									aria-label={`Alt text of ${e.file.name}`}
								/>
								<Textarea
									label="Caption"
									placeholder="Optional caption for display"
									value={e.caption}
									onChange={(ev) => patch(e.id, { caption: ev.target.value })}
									aria-label={`Caption of ${e.file.name}`}
								/>
							</div>
						</li>
					))}
				</ul>
			</div>
		</Dialog>
	);
}
