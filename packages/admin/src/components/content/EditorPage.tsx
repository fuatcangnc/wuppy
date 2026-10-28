import { ArrowLeft, ExternalLink, Pencil } from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { Link, useBlocker, useNavigate, useParams } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { api, slugPath } from "../../lib/api.ts";
import { templateOf, templateUrl } from "../../lib/theme-page.ts";
import { $codeFile } from "../visual-editor/store.ts";
import {
	$autosaved,
	$conflict,
	$dirty,
	$doc,
	$editorError,
	$lockedBy,
	$recovery,
	$saving,
	claimLock,
	discardRecovery,
	openEntry,
	releaseLock,
	restoreRecovery,
	save,
	setBody,
	setField,
	setPublished,
	useTheirs,
} from "../../stores/editor.ts";
import { loadHistory } from "../../stores/git.ts";
import { $collections, loadCollections, uploadImage } from "../../stores/content.ts";
import { Badge, Button, Card, CardHeader, ErrorText, Input } from "../../ui/index.tsx";
import { FieldsForm } from "./FieldsForm.tsx";
import { LinkedFrom } from "./LinkedFrom.tsx";
import { PageSettings } from "./PageSettings.tsx";
import { MarkdownEditor } from "../editor/MarkdownEditor.tsx";
import { HistoryPanel } from "../git/HistoryPanel.tsx";
import { TranslatePanel } from "./TranslatePanel.tsx";

export function EditorPage() {
	const { collection, _splat } = useParams({ from: "/e/$collection/$" });
	const slug = _splat ?? "";
	const doc = useStore($doc);
	const dirty = useStore($dirty);
	const saving = useStore($saving);
	const error = useStore($editorError);
	const collections = useStore($collections);
	const info = collections.find((c) => c.name === collection);
	const fields = info?.fields ?? {};
	const navigate = useNavigate();
	const [version, setVersion] = useState(0);
	const conflict = useStore($conflict);
	const recovery = useStore($recovery);
	const lockedBy = useStore($lockedBy);
	const loaded = doc?.slug === slug && doc.collection === collection;
	const autosaved = useStore($autosaved);
	const [translations, setTranslations] = useState<string[]>([]);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);

	// Leaving through the app's own links needs the same protection as closing the tab.
	useBlocker({
		shouldBlockFn: () => $dirty.get() && !confirm("You have unsaved changes. Leave without saving?"),
		enableBeforeUnload: () => $dirty.get(),
		disabled: !dirty,
	});

	useEffect(() => void loadCollections(), []);
	useEffect(() => {
		const d = $doc.get();
		if (!(d && d.collection === collection && d.slug === slug)) void openEntry(collection, slug);
	}, [collection, slug]);
	// Tell colleagues someone is here: claim on open, refresh every 20 s, release on leave.
	useEffect(() => {
		if (!loaded) return;
		void claimLock();
		const beat = setInterval(() => void claimLock(), 20_000);
		return () => {
			clearInterval(beat);
			void releaseLock(collection, slug);
		};
	}, [loaded, collection, slug]);
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
				e.preventDefault();
				if ($dirty.get()) void save().then((ok) => ok && void loadHistory(collection, slug));
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [collection, slug]);

	if (!doc) return error ? <ErrorText>{error}</ErrorText> : <p className="text-muted-foreground">Loading…</p>;
	const status = doc.data.draft === true ? "draft" : "published";
	// A theme `.astro` page: its text lives in the theme's code, so the entry holds only its title and SEO fields.
	const template = templateOf(doc.data);
	const publicPath = template
		? templateUrl(template)
		: (info?.route ?? `/${collection}/{slug}`).replace("{slug}", slug);
	const siteUrl = `${publicPath}?wuppy-edit=1`;
	const kind = info?.kind ?? (collection === "pages" ? "pages" : collection === "posts" ? "posts" : undefined);
	const advancedFields = new Set([
		"title",
		"draft",
		"publishAt",
		"author",
		"seoTitle",
		"seoDescription",
		"canonical",
		"noindex",
		"ogTitle",
		"ogDescription",
		"ogImage",
		"searchTitle",
		"searchDescription",
		"searchImage",
		"searchExclude",
		"schemaJson",
		"customHead",
		"customBody",
	]);
	const contentFields = Object.fromEntries(Object.entries(fields).filter(([name]) => !advancedFields.has(name)));

	return (
		<div className="grid gap-5">
			<div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
				<div className="flex min-w-0 items-start gap-3">
					<Link
						to="/c/$collection"
						params={{ collection }}
						aria-label={`Back to ${collection}`}
						className="mt-1 grid size-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<ArrowLeft size={16} />
					</Link>
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<h1 className="truncate text-2xl font-semibold tracking-tight">{String(doc.data.title ?? slug)}</h1>
							<Badge tone={status === "published" ? "success" : "warning"}>{status}</Badge>
						</div>
						<p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
							<Link to="/c/$collection" params={{ collection }} className="hover:text-foreground">
								{collection}
							</Link>
							<span className="text-border">/</span>
							<span className="font-mono">{slug}</span>
						</p>
					</div>
				</div>
				<div className="flex flex-col items-end gap-1">
					<div className="flex flex-wrap items-center justify-end gap-2">
						<a href={siteUrl} target="_blank" rel="noreferrer" className="contents">
							<Button variant="secondary" size="sm">
								<ExternalLink size={14} /> View site
							</Button>
						</a>
						<Button
							variant="secondary"
							size="sm"
							onClick={() => void navigate({ to: "/v/$collection/$", params: { collection, _splat: slug } })}
						>
							<Pencil size={14} /> Visual editor
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() =>
								void api<{ data: { url: string } }>("GET", `/api/preview-link/${collection}/${slugPath(slug)}`)
									.then((r) => setPreviewUrl(new URL(r.data.url, location.origin).href))
									.catch((e: Error) => $editorError.set(e.message))
							}
						>
							Preview link
						</Button>
						<Button
							variant="secondary"
							size="sm"
							disabled={saving}
							onClick={() =>
								void setPublished(status !== "published").then((ok) => ok && void loadHistory(collection, slug))
							}
						>
							{status === "published" ? "Unpublish" : "Publish"}
						</Button>
						<Button
							size="sm"
							variant={dirty ? "default" : "secondary"}
							disabled={!dirty || saving || !!lockedBy}
							onClick={() =>
								void save().then((ok) => {
									if (ok) void loadHistory(collection, slug);
								})
							}
						>
							{saving ? "Saving…" : dirty ? "Save" : "Saved"}
						</Button>
					</div>
					<span role="status" aria-live="polite" className="text-[11px] text-muted-foreground">
						{saving
							? "Saving…"
							: dirty
								? autosaved
									? "Unsaved changes (recovery copy kept)"
									: "Unsaved changes"
								: "All changes saved"}
					</span>
				</div>
			</div>
			<ErrorText>{error}</ErrorText>
			{previewUrl && (
				<p className="text-sm" role="status">
					Anyone with this link can see this entry for 24 hours:{" "}
					<a href={previewUrl} target="_blank" rel="noreferrer" className="break-all text-primary underline">
						{previewUrl}
					</a>
				</p>
			)}
			{lockedBy && (
				<Card>
					<div className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm" role="alert">
						<span>
							<strong>{lockedBy.name}</strong> is editing this entry (since{" "}
							{new Date(lockedBy.since).toLocaleTimeString()}). Saving is off so you do not overwrite each other.
						</span>
						<Button size="sm" variant="secondary" onClick={() => void claimLock(true)}>
							Edit anyway
						</Button>
					</div>
				</Card>
			)}
			{recovery && (
				<Card>
					<div className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm" role="alert">
						<span>Unsaved changes from {new Date(recovery.savedAt).toLocaleString()} were recovered.</span>
						<span className="flex gap-2">
							<Button
								size="sm"
								onClick={() => {
									restoreRecovery();
									setVersion((v) => v + 1);
								}}
							>
								Restore them
							</Button>
							<Button size="sm" variant="secondary" onClick={() => void discardRecovery()}>
								Discard
							</Button>
						</span>
					</div>
				</Card>
			)}
			{conflict && (
				<Card>
					<div className="grid gap-2 p-3 text-sm" role="alert">
						<p>
							<strong>Someone else saved this entry while you were editing.</strong> Their version is on the server now.
						</p>
						<ul className="list-disc ps-5 text-muted-foreground">
							{changedFields(doc.data, conflict.theirs.data, doc.body, conflict.theirs.body).map((f) => (
								<li key={f}>{f} differs</li>
							))}
						</ul>
						<span className="flex gap-2">
							<Button
								size="sm"
								variant="secondary"
								onClick={() => void useTheirs().then(() => setVersion((v) => v + 1))}
							>
								Use their version (lose my edits)
							</Button>
							<Button size="sm" onClick={() => void save(undefined, true)}>
								Keep mine (overwrite)
							</Button>
						</span>
					</div>
				</Card>
			)}

			<div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
				<section className="grid content-start gap-4">
					{Object.keys(contentFields).length > 0 && (
						<Card>
							<CardHeader title="Fields" description={`${Object.keys(contentFields).length} configured fields`} />
							<div className="p-4">
								<FieldsForm
									fields={contentFields}
									data={doc.data}
									onChange={setField}
									onUpload={uploadImage}
									labelOf={fieldLabel}
								/>
							</div>
						</Card>
					)}
					<LinkedFrom collection={collection} slug={slug} />
					{template && (
						<Card>
							<CardHeader
								title="Theme page"
								description={`The page's own content is theme code (${template}); the body below is added at the end of it.`}
							/>
							<div className="p-4">
								<Button
									variant="secondary"
									onClick={() => {
										$codeFile.set(template);
										void navigate({ to: "/v/$collection/$", params: { collection, _splat: slug } });
									}}
								>
									Open in Code view
								</Button>
							</div>
						</Card>
					)}
					<Card>
						<CardHeader title="Body" description="Markdown/MDX; JSX and allowed components are preserved." />
						<div className="p-4">
							<MarkdownEditor key={`${slug}:${version}`} initial={doc.body} onChange={setBody} />
						</div>
					</Card>
				</section>

				<aside className="grid content-start gap-4">
					<Card>
						<CardHeader title="Publish" />
						<div className="grid gap-3 p-4">
							<Input
								label="Publish at"
								type="datetime-local"
								value={toLocalInput(doc.data.publishAt)}
								onChange={(e) =>
									setField("publishAt", e.target.value ? new Date(e.target.value).toISOString() : undefined)
								}
							/>
							<Input
								label="Author"
								value={String(doc.data.author ?? "")}
								onChange={(e) => setField("author", e.target.value || undefined)}
							/>
						</div>
					</Card>

					<PageSettings data={doc.data} onChange={setField} path={publicPath} kind={kind} />

					<Card>
						<CardHeader title="Summary" />
						<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 p-4 text-sm">
							<dt className="text-muted-foreground">Language</dt>
							<dd>{languageOf(slug, translations)}</dd>
							{Object.entries(fields)
								.filter(
									([, f]) =>
										(typeof f === "string" ? f : f.type) === "taxonomy" ||
										(typeof f === "string" ? f : f.type) === "list",
								)
								.map(([name]) => (
									<Fragment key={name}>
										<dt className="text-muted-foreground">{name}</dt>
										<dd>{[doc.data[name]].flat().filter(Boolean).join(", ") || "—"}</dd>
									</Fragment>
								))}
						</dl>
					</Card>

					<Card>
						<CardHeader title="Translations" />
						<TranslatePanel collection={collection} slug={slug} onLocales={setTranslations} />
					</Card>

					<Card>
						<CardHeader title="History" description="Every save is a Git commit." />
						<div className="p-2">
							<HistoryPanel
								collection={collection}
								slug={slug}
								onReverted={() => void openEntry(collection, slug).then(() => setVersion((v) => v + 1))}
							/>
						</div>
					</Card>
				</aside>
			</div>
		</div>
	);
}

const FIELD_ACRONYMS = new Set(["seo", "cta", "url", "id", "og", "api", "rss"]);

/** `featureTitle` -> "Feature title"; the field key itself is never changed. */
function fieldLabel(name: string): string {
	const words = name
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[-_]+/g, " ")
		.split(/\s+/)
		.filter(Boolean);
	return (
		words
			.map((word, index) => {
				const lower = word.toLowerCase();
				if (FIELD_ACRONYMS.has(lower)) return lower.toUpperCase();
				return index === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
			})
			.join(" ") || name
	);
}

function toLocalInput(value: unknown): string {
	if (!value) return "";
	const date = new Date(String(value));
	if (Number.isNaN(date.getTime())) return "";
	const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
	return local.toISOString().slice(0, 16);
}

/** Locale from the slug's first segment (`tr/hello`), when that segment is a configured locale. */
function languageOf(slug: string, locales: string[]): string {
	return locales.find((l) => slug.startsWith(`${l}/`)) ?? "—";
}

function changedFields(
	mine: Record<string, unknown>,
	theirs: Record<string, unknown>,
	myBody: string,
	theirBody: string,
): string[] {
	const names = [...new Set([...Object.keys(mine), ...Object.keys(theirs)])].filter(
		(k) => JSON.stringify(mine[k]) !== JSON.stringify(theirs[k]),
	);
	return myBody === theirBody ? names : [...names, "body"];
}
