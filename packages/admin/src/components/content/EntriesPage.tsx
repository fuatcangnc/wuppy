import { Copy, Plus, Trash2 } from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
	$collections,
	$entries,
	$contentError,
	deleteEntry,
	duplicateEntry,
	loadCollections,
	loadEntries,
	setEntryDraft,
} from "../../stores/content.ts";
import { slugifyTitle } from "../../lib/slug.ts";
import { newEntry } from "../../stores/editor.ts";
import {
	Badge,
	Button,
	Card,
	Checkbox,
	Dialog,
	EmptyState,
	ErrorText,
	Input,
	PageHeader,
	Select,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../../ui/index.tsx";

function statusOf(data: Record<string, unknown>): { label: string; tone: "success" | "warning" | "accent" } {
	if (data.draft === true) {
		const at = data.publishAt ? new Date(String(data.publishAt)).getTime() : NaN;
		return at > Date.now() ? { label: "scheduled", tone: "accent" } : { label: "draft", tone: "warning" };
	}
	return { label: "published", tone: "success" };
}

export function EntriesPage() {
	const { collection } = useParams({ from: "/c/$collection" });
	const entries = useStore($entries)[collection] ?? [];
	const collections = useStore($collections);
	const error = useStore($contentError);
	const [query, setQuery] = useState("");
	const [status, setStatus] = useState("all");
	const [createOpen, setCreateOpen] = useState(false);
	const [title, setTitle] = useState("");
	const [slug, setSlug] = useState("");
	const [slugEdited, setSlugEdited] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);
	const [selected, setSelected] = useState<string[]>([]);
	const navigate = useNavigate();
	const info = collections.find((c) => c.name === collection);
	const label = collection.charAt(0).toUpperCase() + collection.slice(1);

	useEffect(() => {
		void loadCollections();
		void loadEntries(collection);
	}, [collection]);

	const filtered = useMemo(
		() =>
			entries.filter((entry) => {
				const entryTitle = String(entry.data.title ?? entry.slug).toLowerCase();
				if (query && !entryTitle.includes(query.toLowerCase()) && !entry.slug.includes(query)) return false;
				if (status === "all") return true;
				return statusOf(entry.data).label === status;
			}),
		[entries, query, status],
	);

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

	const create = () => {
		const nextSlug = slug.trim();
		const nextTitle = title.trim();
		if (!nextSlug) {
			setCreateError("Enter a title or slug.");
			return;
		}
		if (entries.some((entry) => entry.slug === nextSlug)) {
			setCreateError("An entry with this slug already exists.");
			return;
		}
		setCreateError(null);
		newEntry(collection, nextSlug, nextTitle && info?.fields.title ? { title: nextTitle } : {});
		setTitle("");
		setSlug("");
		setSlugEdited(false);
		setCreateOpen(false);
		void navigate({ to: "/e/$collection/$", params: { collection, _splat: nextSlug } });
	};

	return (
		<div className="grid gap-4">
			<PageHeader
				title={label}
				description={`${entries.length} entries in ${info?.dir ?? collection}`}
				actions={
					<>
						<Link to="/t/$collection" params={{ collection }} className="contents">
							<Button variant="secondary">Translations</Button>
						</Link>
						<Button onClick={openCreate}>
							<Plus size={14} /> New {label.toLowerCase().replace(/s$/, "")}
						</Button>
					</>
				}
			/>
			<ErrorText>{createError ?? error}</ErrorText>
			<div className="flex flex-wrap items-end gap-2">
				<Input label="Search" placeholder="Title or slug" value={query} onChange={(e) => setQuery(e.target.value)} />
				<Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
					<option value="all">All</option>
					<option value="published">Published</option>
					<option value="draft">Draft</option>
					<option value="scheduled">Scheduled</option>
				</Select>
				<Input
					label="New entry title"
					placeholder="My first post"
					value={title}
					onChange={(e) => changeTitle(e.target.value)}
				/>
				<Input
					label="New entry slug"
					placeholder="my-first-post"
					value={slug}
					onChange={(e) => changeSlug(e.target.value)}
				/>
				<Button onClick={create} disabled={!/^[a-z0-9][a-z0-9/_.-]*$/i.test(slug)}>
					Create
				</Button>
			</div>

			<Card className="overflow-hidden">
				{selected.length > 0 && (
					<div className="flex flex-wrap items-center gap-2 border-b border-border p-2 text-sm">
						<span>{selected.length} selected</span>
						<Button
							size="sm"
							onClick={() =>
								void Promise.all(selected.map((s) => setEntryDraft(collection, s, false))).then(() => setSelected([]))
							}
						>
							Publish
						</Button>
						<Button
							size="sm"
							variant="secondary"
							onClick={() =>
								void Promise.all(selected.map((s) => setEntryDraft(collection, s, true))).then(() => setSelected([]))
							}
						>
							Unpublish
						</Button>
						<Button
							size="sm"
							variant="destructive"
							onClick={() => {
								if (!confirm(`Delete ${selected.length} entries? Git history keeps them recoverable.`)) return;
								void Promise.all(selected.map((s) => deleteEntry(collection, s))).then(() => setSelected([]));
							}}
						>
							Delete
						</Button>
					</div>
				)}
				{filtered.length === 0 ? (
					<div className="p-4">
						<EmptyState
							title={entries.length ? "No matches" : `No ${collection} yet`}
							description={entries.length ? "Try a different search or status." : "Create the first entry."}
							action={<Button onClick={openCreate}>+ New entry</Button>}
						/>
					</div>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-12" />
								<TableHead className="min-w-56">Title</TableHead>
								<TableHead className="min-w-40">Slug</TableHead>
								<TableHead className="w-28">Status</TableHead>
								<TableHead className="w-36">Modified</TableHead>
								<TableHead className="w-52" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{filtered.map((entry) => {
								const s = statusOf(entry.data);
								return (
									<TableRow key={entry.slug}>
										<TableCell className="w-12">
											<Checkbox
												aria-label={`Select ${entry.slug}`}
												checked={selected.includes(entry.slug)}
												onChange={() =>
													setSelected((ids) =>
														ids.includes(entry.slug) ? ids.filter((id) => id !== entry.slug) : [...ids, entry.slug],
													)
												}
											/>
										</TableCell>
										<TableCell>
											<Link
												to="/e/$collection/$"
												params={{ collection, _splat: entry.slug }}
												className="font-medium text-primary hover:underline"
											>
												{String(entry.data.title ?? entry.slug)}
											</Link>
										</TableCell>
										<TableCell className="text-muted-foreground">{entry.slug}</TableCell>
										<TableCell>
											<Badge tone={s.tone}>{s.label}</Badge>
										</TableCell>
										<TableCell className="text-muted-foreground" title={new Date(entry.modified).toLocaleString()}>
											{new Date(entry.modified).toLocaleDateString(undefined, {
												year: "numeric",
												month: "short",
												day: "numeric",
											})}
										</TableCell>
										<TableCell className="whitespace-nowrap text-end">
											<Button variant="ghost" size="sm" onClick={() => void duplicateEntry(collection, entry.slug)}>
												<Copy size={14} /> Duplicate
											</Button>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => {
													if (confirm(`Delete ${entry.slug}? It stays recoverable in the trash.`))
														void deleteEntry(collection, entry.slug);
												}}
											>
												<Trash2 size={14} /> Delete
											</Button>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				)}
			</Card>

			<Dialog
				open={createOpen}
				title={`New ${label.toLowerCase().replace(/s$/, "")}`}
				onClose={() => setCreateOpen(false)}
				footer={
					<>
						<Button variant="ghost" onClick={() => setCreateOpen(false)}>
							Cancel
						</Button>
						<Button onClick={create} disabled={!/^[a-z0-9][a-z0-9/_.-]*$/i.test(slug)}>
							Create
						</Button>
					</>
				}
			>
				<Input label="Title" placeholder="My first post" value={title} onChange={(e) => changeTitle(e.target.value)} />
				<Input
					label="Slug"
					placeholder="my-first-post"
					value={slug}
					onChange={(e) => changeSlug(e.target.value)}
					hint="Generated from the title until you edit it. Lowercase letters, numbers, /, ., _ and -"
				/>
				<ErrorText>{createError}</ErrorText>
			</Dialog>
		</div>
	);
}
