import { useStore } from "@nanostores/react";
import { apiUrl } from "../../lib/api.ts";
import { useEffect, useMemo, useState } from "react";
import { $media, loadMedia, type MediaItem } from "../../stores/content.ts";
import { Button, Dialog, EmptyState, Input } from "../../ui/index.tsx";
import { filterMedia } from "./filter.ts";
import { UploadList, useUploadQueue } from "./UploadQueue.tsx";

/** Choose images from the library (or upload new ones) without leaving the page you are editing. */
export function MediaPicker({
	open,
	onClose,
	onPick,
	multiple = false,
}: {
	open: boolean;
	onClose: () => void;
	onPick: (items: MediaItem[]) => void;
	multiple?: boolean;
}) {
	const items = useStore($media);
	const [query, setQuery] = useState("");
	const [chosen, setChosen] = useState<string[]>([]);
	const queue = useUploadQueue(undefined, (urls) => {
		void loadMedia().then(() => setChosen(multiple ? (c) => [...c, ...urls] : urls.slice(0, 1)));
	});

	useEffect(() => {
		if (!open) return;
		setChosen([]);
		setQuery("");
		void loadMedia();
	}, [open]);

	const shown = useMemo(
		() => filterMedia(items, { folder: "all", query, type: "", from: "", to: "" }).slice(0, 60),
		[items, query],
	);
	const toggle = (url: string) =>
		setChosen((c) => (c.includes(url) ? c.filter((u) => u !== url) : multiple ? [...c, url] : [url]));

	return (
		<Dialog
			open={open}
			title="Choose from the library"
			onClose={onClose}
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button disabled={chosen.length === 0} onClick={() => onPick(items.filter((m) => chosen.includes(m.url)))}>
						{multiple ? `Insert ${chosen.length || ""}` : "Insert"}
					</Button>
				</>
			}
		>
			<div className="grid gap-3">
				<div className="flex flex-wrap items-end gap-2">
					<Input
						label="Search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Name or alt text"
					/>
					<Input
						label="Upload"
						type="file"
						multiple={multiple}
						accept="image/png,image/jpeg,image/gif,image/webp"
						onChange={(e) => {
							const files = [...(e.target.files ?? [])];
							e.target.value = "";
							if (files.length) void queue.add(files);
						}}
					/>
				</div>
				<UploadList jobs={queue.jobs} cancel={queue.cancel} clear={queue.clear} />
				{shown.length === 0 ? (
					<EmptyState title="No images" description="Upload one, or change the search." />
				) : (
					<ul className="grid max-h-80 grid-cols-3 gap-2 overflow-auto md:grid-cols-4">
						{shown.map((m) => (
							<li key={m.url}>
								<button
									type="button"
									aria-pressed={chosen.includes(m.url)}
									aria-label={`Pick ${m.name}`}
									onClick={() => toggle(m.url)}
									className={`block w-full rounded-md border-2 p-0.5 ${chosen.includes(m.url) ? "border-primary" : "border-transparent"}`}
								>
									<img
										src={apiUrl(m.url)}
										alt={m.alt ?? ""}
										className="h-20 w-full rounded object-cover"
										loading="lazy"
									/>
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
		</Dialog>
	);
}
