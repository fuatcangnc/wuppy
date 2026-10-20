import { useEffect, useState } from "react";
import { apiData } from "../../lib/api.ts";

interface SiteSeo {
	siteName: string;
	siteUrl: string;
	seo: { titleTemplate: string; description: string; image: string };
}

export interface SeoPreviewInput {
	title: string;
	seoTitle?: string;
	seoDescription?: string;
	image?: string;
	/** Public path of the entry, e.g. `/posts/hello`. */
	path: string;
}

export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 160;

/** What a search result and a social card will show, plus length warnings. Mirrors `buildSeo` in the core package. */
export function seoPreview(input: SeoPreviewInput, site: SiteSeo) {
	const page = input.seoTitle || input.title;
	const title = (site.seo.titleTemplate || "{title} | {site}")
		.replace("{title}", () => page)
		.replace("{site}", () => site.siteName);
	const description = input.seoDescription || site.seo.description;
	const image = input.image || site.seo.image;
	const warnings = [
		...(title.length > TITLE_MAX
			? [`Title is ${title.length} characters; search engines cut it near ${TITLE_MAX}.`]
			: []),
		...(!description ? ["No description: search engines will pick text from the page."] : []),
		...(description.length > DESCRIPTION_MAX
			? [`Description is ${description.length} characters; search engines cut it near ${DESCRIPTION_MAX}.`]
			: []),
		...(!image ? ["No share image: social cards will have no picture."] : []),
	];
	const host = site.siteUrl ? new URL(site.siteUrl).host : "";
	return { title, description, image, warnings, url: `${host}${input.path}` };
}

export function SeoPreview(input: SeoPreviewInput) {
	const [site, setSite] = useState<SiteSeo | null>(null);
	useEffect(() => {
		void apiData<SiteSeo>("GET", "/api/data/settings")
			.then(setSite)
			.catch(() => undefined);
	}, []);
	if (!site) return null;
	const p = seoPreview(input, site);
	return (
		<div className="grid gap-3" aria-label="Search and social preview">
			<div className="rounded-md border p-3 text-sm">
				<div className="truncate text-xs text-muted-foreground">{p.url}</div>
				<div className="truncate text-base font-medium text-blue-700 dark:text-blue-400">{p.title}</div>
				<div className="line-clamp-2 text-muted-foreground">{p.description}</div>
			</div>
			<div className="overflow-hidden rounded-md border text-sm">
				{p.image ? (
					<img src={p.image} alt="" className="h-32 w-full object-cover" />
				) : (
					<div className="h-32 bg-muted" />
				)}
				<div className="p-3">
					<div className="text-xs uppercase text-muted-foreground">{p.url.split("/")[0]}</div>
					<div className="font-medium">{input.seoTitle || input.title}</div>
				</div>
			</div>
			{p.warnings.length > 0 && (
				<ul className="list-disc pl-5 text-xs text-muted-foreground">
					{p.warnings.map((w) => (
						<li key={w}>{w}</li>
					))}
				</ul>
			)}
		</div>
	);
}
