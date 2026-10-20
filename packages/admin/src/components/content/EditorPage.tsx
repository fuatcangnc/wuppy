import { useStore } from "@nanostores/react";
import { useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { $dirty, $doc, $editorError, $saving, openEntry, save, setBody, setField } from "../../stores/editor.ts";
import { loadHistory } from "../../stores/git.ts";
import { $collections, loadCollections, uploadImage } from "../../stores/content.ts";
import { Badge, Button, Card, CardHeader, Checkbox, ErrorText, Input, PageHeader, Textarea } from "../../ui/index.tsx";
import { FieldsForm } from "./FieldsForm.tsx";
import { MarkdownEditor } from "../editor/MarkdownEditor.tsx";
import { HistoryPanel } from "../git/HistoryPanel.tsx";

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
	const siteUrl = `${(info?.route ?? `/${collection}/{slug}`).replace("{slug}", slug)}?wuppy-edit=1`;
	const [version, setVersion] = useState(0);

	useEffect(() => void loadCollections(), []);
	useEffect(() => {
		const d = $doc.get();
		if (!(d && d.collection === collection && d.slug === slug)) void openEntry(collection, slug);
	}, [collection, slug]);
	useEffect(() => {
		if (!dirty) return;
		const warn = (e: BeforeUnloadEvent) => e.preventDefault();
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [dirty]);

	if (!doc) return error ? <ErrorText>{error}</ErrorText> : <p className="text-muted-foreground">Loading…</p>;
	const status = doc.data.draft === true ? "draft" : "published";

	return (
		<div className="grid gap-5">
			<PageHeader
				title={String(doc.data.title ?? slug)}
				description={`${collection}/${slug}`}
				actions={
					<>
						<Badge tone={status === "published" ? "success" : "warning"}>{status}</Badge>
						<a href={siteUrl} target="_blank" rel="noreferrer" className="contents">
							<Button variant="secondary">View on site</Button>
						</a>
						<Button
							disabled={!dirty || saving}
							onClick={() =>
								void save().then((ok) => {
									if (ok) void loadHistory(collection, slug);
								})
							}
						>
							{saving ? "Saving…" : dirty ? "Save" : "Saved"}
						</Button>
					</>
				}
			/>
			<ErrorText>{error}</ErrorText>

			<div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
				<section className="grid content-start gap-4">
					<Card>
						<CardHeader title="Fields" description={`${Object.keys(fields).length} configured fields`} />
						<div className="p-4">
							<FieldsForm fields={fields} data={doc.data} onChange={setField} onUpload={uploadImage} />
						</div>
					</Card>
					<Card>
						<CardHeader title="Body" description="Markdown/MDX; JSX and allowed components are preserved." />
						<div className="p-4">
							<MarkdownEditor key={`${slug}:${version}`} initial={doc.body} onChange={setBody} onUpload={uploadImage} />
						</div>
					</Card>
				</section>

				<aside className="grid content-start gap-4">
					<Card>
						<CardHeader title="Publish" />
						<div className="grid gap-3 p-4">
							<Checkbox
								label="Draft"
								checked={doc.data.draft === true}
								onChange={(e) => setField("draft", e.target.checked ? true : undefined)}
							/>
							<Input
								label="Publish at"
								type="datetime-local"
								value={toLocalInput(doc.data.publishAt)}
								onChange={(e) => setField("publishAt", e.target.value ? new Date(e.target.value).toISOString() : undefined)}
							/>
							<Input label="Author" value={String(doc.data.author ?? "")} onChange={(e) => setField("author", e.target.value || undefined)} />
						</div>
					</Card>

					<Card>
						<CardHeader title="SEO" description="Overrides the site defaults." />
						<div className="grid gap-3 p-4">
							<Input
								label="Meta title"
								value={String(doc.data.seoTitle ?? "")}
								onChange={(e) => setField("seoTitle", e.target.value || undefined)}
							/>
							<Textarea
								label="Meta description"
								value={String(doc.data.seoDescription ?? "")}
								onChange={(e) => setField("seoDescription", e.target.value || undefined)}
							/>
							<Input
								label="Canonical URL"
								value={String(doc.data.canonical ?? "")}
								onChange={(e) => setField("canonical", e.target.value || undefined)}
							/>
							<Checkbox
								label="Noindex this entry"
								checked={doc.data.noindex === true}
								onChange={(e) => setField("noindex", e.target.checked ? true : undefined)}
							/>
						</div>
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

function toLocalInput(value: unknown): string {
	if (!value) return "";
	const date = new Date(String(value));
	if (Number.isNaN(date.getTime())) return "";
	const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
	return local.toISOString().slice(0, 16);
}
