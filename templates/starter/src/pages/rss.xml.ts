import { getCollection } from "astro:content";
import config from "../../wuppy.config.mjs";

export async function GET() {
	const posts = (await getCollection("posts", ({ data }) => data.draft !== true)).toSorted(
		(a, b) => (b.data.date?.getTime() ?? 0) - (a.data.date?.getTime() ?? 0),
	);
	const items = posts
		.map((post) => {
			const url = new URL(`/posts/${post.id}`, config.site.url).href;
			const date = post.data.date?.toUTCString() ?? new Date().toUTCString();
			return `<item><title>${escape(post.data.title)}</title><link>${url}</link><guid>${url}</guid><pubDate>${date}</pubDate><description>${escape(post.data.seoDescription ?? "")}</description></item>`;
		})
		.join("");
	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escape(config.site.name)}</title><link>${config.site.url}</link><description>${escape(config.site.name)}</description>${items}</channel></rss>`,
		{ headers: { "content-type": "application/rss+xml; charset=utf-8" } },
	);
}

function escape(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
