/** WordPress export (WXR) reading and HTML-to-Markdown conversion. Pure functions: no I/O. */

export interface WxrPost {
	id: string;
	type: "post" | "page";
	slug: string;
	title: string;
	/** Path of the old public URL, e.g. `/2024/05/hello/`. */
	oldPath: string;
	/** ISO date; GMT when the export has it. */
	date: string;
	published: boolean;
	author: string;
	html: string;
	categories: string[];
	tags: string[];
}
export interface WxrAttachment {
	id: string;
	url: string;
	title: string;
}
export interface WxrTerm {
	taxonomy: "category" | "tag";
	slug: string;
	name: string;
	parent?: string;
}
export interface WxrAuthor {
	login: string;
	name: string;
	email: string;
}
export interface WxrMenuItem {
	label: string;
	url: string;
	order: number;
	/** `id` of the parent menu item, or "0". */
	parent: string;
	id: string;
}
export interface WxrMenu {
	slug: string;
	name: string;
	items: WxrMenuItem[];
}
export interface Wxr {
	siteUrl: string;
	authors: WxrAuthor[];
	terms: WxrTerm[];
	posts: WxrPost[];
	attachments: WxrAttachment[];
	menus: WxrMenu[];
	/** Posts and pages left out because they have no title or slug. */
	skipped: number;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export const decodeEntities = (s: string, keepAngles = false) =>
	s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
		// `&lt;` stays escaped in Markdown output, or decoded text could turn into live HTML.
		if (keepAngles && /^(lt|gt|#0*(60|62)|#x0*3[ce])$/i.test(e)) return m;
		if (e[0] === "#") {
			const code = e[1]?.toLowerCase() === "x" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1));
			return Number.isInteger(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
		}
		return ENTITIES[e.toLowerCase()] ?? m;
	});

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Text of `<name>` in `block`, CDATA unwrapped. Empty when absent. */
export function tag(block: string, name: string): string {
	const n = escapeRe(name);
	const m = new RegExp(`<${n}(?:\\s[^>]*)?>(?:\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*|([\\s\\S]*?))</${n}>`).exec(
		block,
	);
	return m ? (m[1] ?? decodeEntities(m[2] ?? "")).trim() : "";
}

const blocks = (xml: string, name: string) =>
	[...xml.matchAll(new RegExp(`<${escapeRe(name)}>([\\s\\S]*?)</${escapeRe(name)}>`, "g"))].map((m) => m[1] ?? "");

const metaOf = (item: string): Record<string, string> =>
	Object.fromEntries(blocks(item, "wp:postmeta").map((m) => [tag(m, "wp:meta_key"), tag(m, "wp:meta_value")]));

const pathOf = (link: string): string => {
	try {
		return new URL(link).pathname;
	} catch {
		return link.startsWith("/") ? link : "";
	}
};

const slugify = (s: string) =>
	s
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");

function isoDate(item: string): string {
	const gmt = tag(item, "wp:post_date_gmt");
	const local = tag(item, "wp:post_date");
	const raw = gmt && !gmt.startsWith("0000") ? gmt : local;
	const d = new Date(`${raw.replace(" ", "T")}Z`);
	return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** Reads the parts of a WXR file Wuppy can use. Items without a title or slug are kept out (see the analysis). */
export function parseWxr(xml: string): Wxr {
	const channel = xml.slice(0, xml.indexOf("<item>") === -1 ? xml.length : xml.indexOf("<item>"));
	const items = blocks(xml, "item");
	const wxr: Wxr = {
		siteUrl: tag(channel, "wp:base_site_url") || tag(channel, "link"),
		authors: blocks(xml, "wp:author").map((a) => ({
			login: tag(a, "wp:author_login"),
			name: tag(a, "wp:author_display_name") || tag(a, "wp:author_login"),
			email: tag(a, "wp:author_email"),
		})),
		terms: [
			...blocks(xml, "wp:category").map((c): WxrTerm => ({
				taxonomy: "category",
				slug: tag(c, "wp:category_nicename"),
				name: tag(c, "wp:cat_name"),
				parent: tag(c, "wp:category_parent") || undefined,
			})),
			...blocks(xml, "wp:tag").map((t): WxrTerm => ({
				taxonomy: "tag",
				slug: tag(t, "wp:tag_slug"),
				name: tag(t, "wp:tag_name"),
			})),
		].filter((t) => t.slug && t.name),
		posts: [],
		attachments: [],
		menus: [],
		skipped: 0,
	};

	const byId = new Map<string, string>();
	for (const item of items) byId.set(tag(item, "wp:post_id"), pathOf(tag(item, "link")));
	const menus = new Map<string, WxrMenu>();

	for (const item of items) {
		const type = tag(item, "wp:post_type");
		const id = tag(item, "wp:post_id");
		const title = tag(item, "title");
		if (type === "attachment") {
			const url = tag(item, "wp:attachment_url");
			if (url) wxr.attachments.push({ id, url, title });
		} else if (type === "nav_menu_item") {
			const meta = metaOf(item);
			const menuSlug = /<category[^>]*domain="nav_menu"[^>]*nicename="([^"]+)"/.exec(item)?.[1];
			if (!menuSlug) continue;
			const object = meta["_menu_item_object_id"] ?? "";
			const url = meta["_menu_item_type"] === "custom" ? (meta["_menu_item_url"] ?? "") : (byId.get(object) ?? "");
			const menu = menus.get(menuSlug) ?? { slug: menuSlug, name: menuSlug, items: [] };
			menu.items.push({
				id,
				label: title || url,
				url,
				order: Number(tag(item, "wp:menu_order")) || 0,
				parent: meta["_menu_item_menu_item_parent"] ?? "0",
			});
			menus.set(menuSlug, menu);
		} else if (type === "post" || type === "page") {
			const slug = tag(item, "wp:post_name") || slugify(title);
			if (!slug || !title) {
				wxr.skipped++;
				continue;
			}
			const cats = [...item.matchAll(/<category\s+domain="(category|post_tag)"\s+nicename="([^"]*)"/g)];
			wxr.posts.push({
				id,
				type,
				slug,
				title,
				oldPath: pathOf(tag(item, "link")),
				date: isoDate(item),
				published: tag(item, "wp:status") === "publish",
				author: tag(item, "dc:creator"),
				html: tag(item, "content:encoded"),
				categories: cats.filter((m) => m[1] === "category").map((m) => m[2] ?? ""),
				tags: cats.filter((m) => m[1] === "post_tag").map((m) => m[2] ?? ""),
			});
		}
	}
	wxr.menus = [...menus.values()];
	return wxr;
}

/** URLs of images in `html` (`<img src>`), in order, without duplicates. */
export const imageUrls = (html: string): string[] => [
	...new Set([...html.matchAll(/<img\b[^>]*?\ssrc=["']([^"']+)["']/gi)].map((m) => m[1] ?? "")),
];

/** Converts WordPress post HTML to Markdown. Unknown tags are dropped but their text is kept; nothing is passed through as HTML. */
export function htmlToMarkdown(html: string): string {
	let s = html
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
		.replace(/\r\n?/g, "\n");
	s = s.replace(/<pre\b[^>]*>\s*(?:<code\b[^>]*>)?([\s\S]*?)(?:<\/code>)?\s*<\/pre>/gi, (_, code: string) => {
		const plain = decodeEntities(code.replace(/<[^>]+>/g, ""));
		return `\n\n\`\`\`\n${plain.replace(/\n+$/, "")}\n\`\`\`\n\n`;
	});
	s = s.replace(/<img\b[^>]*>/gi, (m) => {
		const src = /\ssrc=["']([^"']+)["']/i.exec(m)?.[1];
		const alt = /\salt=["']([^"']*)["']/i.exec(m)?.[1] ?? "";
		return src ? `![${decodeEntities(alt)}](${src})` : "";
	});
	s = s.replace(/<a\b[^>]*?\shref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, text: string) => {
		const label = text.replace(/<(?!\/?img)[^>]+>/gi, "").trim();
		return /^\s*(javascript|data|vbscript):/i.test(href) ? label : `[${label || href}](${href})`;
	});
	s = s.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**").replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*");
	s = s.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, c: string) => `\`${c.replace(/<[^>]+>/g, "")}\``);
	s = s.replace(
		/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
		(_, n: string, t: string) => `\n\n${"#".repeat(Number(n))} ${t.replace(/<[^>]+>/g, "").trim()}\n\n`,
	);
	s = s.replace(
		/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi,
		(_, q: string) =>
			`\n\n${q
				.replace(/<[^>]+>/g, "")
				.trim()
				.split("\n")
				.map((l) => `> ${l.trim()}`)
				.join("\n")}\n\n`,
	);
	s = s.replace(/<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, kind: string, inner: string) => {
		const items = [...inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((m) =>
			(m[1] ?? "").replace(/<(?!\/?img)[^>]+>/gi, "").trim(),
		);
		return `\n\n${items.map((t, i) => `${kind.toLowerCase() === "ol" ? `${i + 1}.` : "-"} ${t}`).join("\n")}\n\n`;
	});
	s = s.replace(/<br\s*\/?>/gi, "  \n").replace(/<hr\s*\/?>/gi, "\n\n---\n\n");
	s = s.replace(/<\/p>/gi, "\n\n").replace(/<p\b[^>]*>/gi, "");
	// Whatever is left is a tag we do not map; keep the text. Markdown's own `![` and `](` survive because they contain no `<`.
	s = s.replace(/<\/?[a-z][^>]*>/gi, "");
	return decodeEntities(s, true)
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export { slugify };
