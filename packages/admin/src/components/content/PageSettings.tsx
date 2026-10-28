import {
	Braces,
	CircleAlert,
	Code2,
	Globe,
	Image as ImageIcon,
	Lock,
	Search,
	Settings2,
	Share2,
	Sparkles,
} from "@react-zero-ui/icon-sprite";
import { useEffect, useState } from "react";
import {
	Button,
	Card,
	CardHeader,
	Checkbox,
	Input,
	Switch,
	Textarea,
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "../../ui/index.tsx";
import { MediaPicker } from "../media/MediaPicker.tsx";
import { SeoPreview } from "./SeoPreview.tsx";

interface Props {
	data: Record<string, unknown>;
	/** `undefined` removes the frontmatter field. */
	onChange: (name: string, value: unknown) => void;
	/** Public path of the entry, e.g. `/about` or `/posts/hello`. */
	path: string;
	kind?: "pages" | "posts";
	/** Hide the card header when the panel already lives in a dialog. */
	showHeader?: boolean;
}

const str = (data: Record<string, unknown>, name: string): string =>
	typeof data[name] === "string" ? (data[name] as string) : "";

const or = (...values: string[]) => values.find((value) => value.trim()) ?? "";

/** Page-level search, sharing, schema and code settings, stored in the entry's frontmatter. */
export function PageSettings({ data, onChange, path, kind, showHeader = true }: Props) {
	const title = str(data, "title");
	const seoTitle = str(data, "seoTitle");
	const seoDescription = str(data, "seoDescription");
	const cover = str(data, "cover");
	const ogTitle = str(data, "ogTitle");
	const ogDescription = str(data, "ogDescription");
	const ogImage = str(data, "ogImage");
	const searchTitle = str(data, "searchTitle");
	const searchDescription = str(data, "searchDescription");
	const searchImage = str(data, "searchImage");
	const [picking, setPicking] = useState<"og" | "search" | null>(null);
	const [schemaText, setSchemaText] = useState(str(data, "schemaJson"));
	const [schemaError, setSchemaError] = useState("");

	useEffect(() => {
		setSchemaText(str(data, "schemaJson"));
		setSchemaError("");
	}, [data.schemaJson]);

	const setSame = (name: string, same: boolean, fallback: string) => onChange(name, same ? undefined : fallback);
	const generatedImage = or(ogImage, cover);

	const updateSchema = (text: string) => {
		setSchemaText(text);
		if (!text.trim()) {
			setSchemaError("");
			onChange("schemaJson", undefined);
			return;
		}
		try {
			JSON.parse(text);
			setSchemaError("");
			onChange("schemaJson", text);
		} catch {
			setSchemaError("Invalid JSON. Fix it before the schema can be published.");
		}
	};

	const generateSchema = () => {
		const schema = {
			"@context": "https://schema.org",
			"@type": kind === "posts" ? "Article" : "WebPage",
			name: title || "Untitled page",
			...(kind === "posts" ? { headline: title || "Untitled page" } : {}),
			...(seoDescription || ogDescription ? { description: or(ogDescription, seoDescription) } : {}),
			...(ogImage || cover ? { image: or(ogImage, cover) } : {}),
			...(str(data, "canonical") ? { url: str(data, "canonical") } : {}),
		};
		updateSchema(JSON.stringify(schema, null, 2));
	};

	return (
		<Card>
			{showHeader && <CardHeader title="Page settings" description="Search, sharing, schema and page code." />}
			<Accordion type="multiple" defaultValue={["general", "seo"]} className="px-2">
				<AccordionItem value="general">
					<AccordionTrigger>
						<span className="flex items-center gap-2">
							<Settings2 size={14} className="text-muted-foreground" /> General
						</span>
					</AccordionTrigger>
					<AccordionContent className="grid gap-3">
						<Input
							label={kind === "posts" ? "Post title" : kind === "pages" ? "Page name" : "Title"}
							value={title}
							onChange={(event) => onChange("title", event.target.value || undefined)}
						/>
						<p className="text-xs text-muted-foreground">
							The title is also the fallback for search and social settings.
						</p>
					</AccordionContent>
				</AccordionItem>

				<AccordionItem value="access">
					<AccordionTrigger>
						<span className="flex items-center gap-2">
							<Lock size={14} className="text-muted-foreground" /> Access control
						</span>
					</AccordionTrigger>
					<AccordionContent className="grid gap-3">
						<div className="rounded-md border border-border bg-muted/30 p-3">
							<p className="text-sm font-medium">{data.draft === true ? "Draft" : "Public"}</p>
							<p className="mt-1 text-xs text-muted-foreground">
								{data.draft === true
									? "Only a signed preview link can open this page."
									: "Anyone on the internet can access this page when it is published."}
							</p>
						</div>
						<Checkbox
							label="Draft (only preview links can open it)"
							checked={data.draft === true}
							onChange={(event) => onChange("draft", event.target.checked ? true : undefined)}
						/>
						<p className="text-xs text-muted-foreground">
							Password-protected pages are not available yet; use a signed preview link to share a draft privately.
						</p>
					</AccordionContent>
				</AccordionItem>

				<AccordionItem value="seo">
					<AccordionTrigger>
						<span className="flex items-center gap-2">
							<Search size={14} className="text-muted-foreground" /> SEO settings
						</span>
					</AccordionTrigger>
					<AccordionContent className="grid gap-4">
						<SeoPreview
							variant="search"
							title={title}
							seoTitle={seoTitle || undefined}
							seoDescription={seoDescription || undefined}
							image={cover || undefined}
							path={path}
						/>
						<Input
							label="Title tag"
							value={seoTitle}
							onChange={(event) => onChange("seoTitle", event.target.value || undefined)}
						/>
						<Textarea
							label="Meta description"
							className="min-h-24"
							value={seoDescription}
							onChange={(event) => onChange("seoDescription", event.target.value || undefined)}
						/>
						<Input
							label="Canonical URL"
							value={str(data, "canonical")}
							onChange={(event) => onChange("canonical", event.target.value || undefined)}
							hint="Overrides the canonical URL for this page. Trailing slashes are removed by the site."
						/>
						<Switch
							label="Sitemap indexing"
							checked={data.noindex !== true}
							onChange={(event) => onChange("noindex", event.target.checked ? undefined : true)}
						/>
						<p className="text-xs text-muted-foreground">
							When off, the page is left out of search results and the sitemap.
						</p>
					</AccordionContent>
				</AccordionItem>

				<AccordionItem value="og">
					<AccordionTrigger>
						<span className="flex items-center gap-2">
							<Share2 size={14} className="text-muted-foreground" /> Open Graph settings
						</span>
					</AccordionTrigger>
					<AccordionContent className="grid gap-4">
						<SeoPreview
							variant="social"
							title={title}
							seoTitle={ogTitle || seoTitle || undefined}
							seoDescription={ogDescription || seoDescription || undefined}
							image={ogImage || cover || undefined}
							path={path}
						/>
						<div className="grid gap-2">
							<Input
								label="Open Graph title"
								value={ogTitle}
								placeholder={or(seoTitle, title)}
								onChange={(event) => onChange("ogTitle", event.target.value || undefined)}
							/>
							<Checkbox
								label="Same as SEO title tag"
								checked={!ogTitle}
								onChange={(event) => setSame("ogTitle", event.target.checked, or(seoTitle, title))}
							/>
						</div>
						<div className="grid gap-2">
							<Textarea
								label="Open Graph description"
								className="min-h-24"
								value={ogDescription}
								placeholder={seoDescription}
								onChange={(event) => onChange("ogDescription", event.target.value || undefined)}
							/>
							<Checkbox
								label="Same as SEO meta description"
								checked={!ogDescription}
								onChange={(event) => setSame("ogDescription", event.target.checked, or(seoDescription, ""))}
							/>
						</div>
						<div className="grid gap-2">
							<Input
								label="Open Graph image"
								value={ogImage}
								placeholder={cover || "https://…"}
								onChange={(event) => onChange("ogImage", event.target.value || undefined)}
							/>
							<Checkbox
								label="Same as the page cover image"
								checked={!ogImage}
								onChange={(event) => setSame("ogImage", event.target.checked, cover)}
							/>
							<Button type="button" variant="ghost" size="sm" onClick={() => setPicking("og")}>
								<ImageIcon size={14} /> Choose image
							</Button>
						</div>
					</AccordionContent>
				</AccordionItem>

				<AccordionItem value="search">
					<AccordionTrigger>
						<span className="flex items-center gap-2">
							<Globe size={14} className="text-muted-foreground" /> Site search settings
						</span>
					</AccordionTrigger>
					<AccordionContent className="grid gap-4">
						<Checkbox
							label="Exclude this page from site search"
							checked={data.searchExclude === true}
							onChange={(event) => onChange("searchExclude", event.target.checked ? true : undefined)}
						/>
						<div className="grid gap-2">
							<Input
								label="Search title"
								value={searchTitle}
								placeholder={or(seoTitle, title)}
								onChange={(event) => onChange("searchTitle", event.target.value || undefined)}
							/>
							<Checkbox
								label="Same as the SEO title tag"
								checked={!searchTitle}
								onChange={(event) => setSame("searchTitle", event.target.checked, or(seoTitle, title))}
							/>
						</div>
						<div className="grid gap-2">
							<Textarea
								label="Search description"
								className="min-h-24"
								value={searchDescription}
								placeholder={seoDescription}
								onChange={(event) => onChange("searchDescription", event.target.value || undefined)}
							/>
							<Checkbox
								label="Same as the SEO meta description"
								checked={!searchDescription}
								onChange={(event) => setSame("searchDescription", event.target.checked, seoDescription)}
							/>
						</div>
						<div className="grid gap-2">
							<Input
								label="Search image"
								value={searchImage}
								placeholder={or(ogImage, cover)}
								onChange={(event) => onChange("searchImage", event.target.value || undefined)}
							/>
							<Checkbox
								label="Same as the Open Graph image"
								checked={!searchImage}
								onChange={(event) => setSame("searchImage", event.target.checked, generatedImage)}
							/>
							<Button type="button" variant="ghost" size="sm" onClick={() => setPicking("search")}>
								<ImageIcon size={14} /> Choose image
							</Button>
						</div>
					</AccordionContent>
				</AccordionItem>

				<AccordionItem value="schema">
					<AccordionTrigger>
						<span className="flex items-center gap-2">
							<Braces size={14} className="text-muted-foreground" /> Schema markup
						</span>
					</AccordionTrigger>
					<AccordionContent className="grid gap-3">
						<p className="text-xs text-muted-foreground">
							Add JSON-LD so search engines can better understand and display this page.
						</p>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<span className="text-xs font-medium">JSON-LD Schema</span>
							<Button type="button" variant="secondary" size="sm" onClick={generateSchema}>
								<Sparkles size={14} /> Generate schema markup
							</Button>
						</div>
						<Textarea
							aria-label="JSON-LD Schema"
							className="min-h-48 font-mono text-xs"
							value={schemaText}
							onChange={(event) => updateSchema(event.target.value)}
							aria-invalid={schemaError ? true : undefined}
						/>
						{schemaError ? (
							<p role="alert" className="text-xs text-destructive">
								{schemaError}
							</p>
						) : (
							<p className="flex items-start gap-1.5 text-xs text-muted-foreground">
								<CircleAlert size={13} className="mt-0.5 shrink-0" />
								Generated markup is a starting point; review it before publishing.
							</p>
						)}
					</AccordionContent>
				</AccordionItem>

				<AccordionItem value="code">
					<AccordionTrigger>
						<span className="flex items-center gap-2">
							<Code2 size={14} className="text-muted-foreground" /> Custom code
						</span>
					</AccordionTrigger>
					<AccordionContent className="grid gap-4">
						<p className="text-xs text-muted-foreground">
							Runs on this page only. Custom code can break the page; paste code you trust.
						</p>
						<Textarea
							label="Head code"
							className="min-h-28 font-mono text-xs"
							value={str(data, "customHead")}
							onChange={(event) => onChange("customHead", event.target.value || undefined)}
							placeholder={'<meta name="example" content="value">'}
						/>
						<Textarea
							label="Body code"
							className="min-h-28 font-mono text-xs"
							value={str(data, "customBody")}
							onChange={(event) => onChange("customBody", event.target.value || undefined)}
							placeholder="<script>…</script>"
						/>
					</AccordionContent>
				</AccordionItem>
			</Accordion>
			<MediaPicker
				open={picking !== null}
				onClose={() => setPicking(null)}
				onPick={([item]) => {
					if (item) onChange(picking === "og" ? "ogImage" : "searchImage", item.url);
					setPicking(null);
				}}
			/>
		</Card>
	);
}
