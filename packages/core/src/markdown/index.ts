import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** The parts of an mdast node (Markdown and MDX) the checks read. */
interface Node {
	type: string;
	value?: unknown;
	url?: string;
	name?: string | null;
	attributes?: { type: string; name?: string; value?: unknown }[];
	children?: Node[];
}

interface Satteri {
	markdownToMdast(source: string, options?: { position?: boolean }): Node;
	mdxToMdast(source: string, options?: { position?: boolean }): Node;
	evaluate(
		source: string,
		options: Record<string, unknown>,
	): Record<string, unknown> | Promise<Record<string, unknown>>;
}

let satteri: Promise<Satteri> | undefined;

/**
 * Astro's own Markdown/MDX parser, so content is checked exactly as the site will compile it. Loaded from Astro's
 * dependency at runtime: it has a native binding, which cannot be bundled, and the site does not depend on it directly.
 */
export function loadSatteri(root = process.cwd()): Promise<Satteri> {
	satteri ??= (async () => {
		const astro = createRequire(join(root, "package.json")).resolve("astro/package.json");
		const md = createRequire(astro).resolve("@astrojs/markdown-satteri");
		return (await import(/* @vite-ignore */ pathToFileURL(createRequire(md).resolve("satteri")).href)) as Satteri;
	})();
	return satteri;
}

const DANGEROUS_TAGS = new Set([
	"script",
	"iframe",
	"frame",
	"frameset",
	"style",
	"object",
	"embed",
	"applet",
	"link",
	"meta",
	"base",
	"form",
	"noscript",
	"template",
]);
const URL_ATTRS = new Set([
	"href",
	"src",
	"action",
	"formaction",
	"xlink:href",
	"poster",
	"data",
	"srcset",
	"background",
]);

/** A URL scheme that runs code or smuggles a document: `javascript:`, `vbscript:`, `data:` (images excepted). */
function badUrl(url: string, image = false): string | null {
	// Browsers ignore whitespace and control characters inside the scheme ("java\tscript:").
	const u = [...url]
		.filter((c) => c.charCodeAt(0) > 32)
		.join("")
		.toLowerCase();
	for (const scheme of ["javascript:", "vbscript:", "data:"])
		if (u.startsWith(scheme) && !(image && scheme === "data:" && /^data:image\/(png|jpe?g|gif|webp|avif);/.test(u)))
			return scheme;
	return null;
}

/** `{/* a comment *\/}` is the only expression allowed on its own: anything else is JavaScript run at build time. */
const ONLY_COMMENT = /^\s*\/\*(?:(?!\*\/)[\s\S])*\*\/\s*$/;

/** JSON values (numbers, strings, booleans, arrays, objects) are data, not code: safe as component props. */
function isJson(source: string): boolean {
	try {
		JSON.parse(source);
		return true;
	} catch {
		return false;
	}
}

/** Raw HTML in Markdown: dangerous tags, event handlers (`onerror=`) and code URLs in any attribute. */
function checkHtml(html: string, allowedComponents: readonly string[], found: Set<string>): void {
	for (const m of html.matchAll(/<\s*\/?\s*([A-Za-z][\w:-]*)/g)) {
		const tag = m[1]!;
		if (DANGEROUS_TAGS.has(tag.toLowerCase())) found.add(tag.toLowerCase());
		// Markdown has no components: a PascalCase tag is a mistake (or a probe), like in MDX.
		else if (/^[A-Z]/.test(tag) && !allowedComponents.includes(tag)) found.add(tag);
	}
	for (const m of html.matchAll(/[\s"'/]((?:on|formaction|srcdoc)[\w-]*)\s*=/gi)) found.add(m[1]!.toLowerCase());
	for (const m of html.matchAll(/=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
		const scheme = badUrl(m[1] ?? m[2] ?? m[3] ?? "");
		if (scheme) found.add(scheme);
	}
}

function checkJsx(node: Node, allowedComponents: readonly string[], found: Set<string>): void {
	const name = node.name;
	if (name) {
		// Member names (`<a.b>`) reach into JavaScript values.
		if (name.includes(".")) found.add(name);
		else if (/^[A-Z]/.test(name)) {
			if (!allowedComponents.includes(name)) found.add(name);
		} else if (DANGEROUS_TAGS.has(name.toLowerCase())) found.add(name);
	}
	for (const attr of node.attributes ?? []) {
		if (attr.type !== "mdxJsxAttribute") {
			found.add("{...spread}");
			continue;
		}
		const key = attr.name ?? "";
		const lower = key.toLowerCase();
		// Event handlers, Astro directives (set:html, is:raw, client:*), raw HTML injection and inline documents.
		if (lower.startsWith("on") || key.includes(":") || lower === "dangerouslysetinnerhtml" || lower === "srcdoc")
			found.add(key);
		const value = attr.value;
		if (value && typeof value === "object") {
			const source = String((value as { value?: unknown }).value ?? "");
			if (!isJson(source)) found.add(`${key}={…}`);
		} else if (typeof value === "string" && URL_ATTRS.has(lower)) {
			const scheme = badUrl(value, lower === "src" && name === "img");
			if (scheme) found.add(scheme);
		}
	}
}

function walk(node: Node, allowedComponents: readonly string[], found: Set<string>): void {
	switch (node.type) {
		case "mdxjsEsm":
			found.add(/^\s*export\b/.test(String(node.value)) ? "export" : "import");
			break;
		case "mdxFlowExpression":
		case "mdxTextExpression":
			if (!ONLY_COMMENT.test(String(node.value ?? ""))) found.add("{expression}");
			break;
		case "mdxJsxFlowElement":
		case "mdxJsxTextElement":
			checkJsx(node, allowedComponents, found);
			break;
		case "html":
			checkHtml(String(node.value ?? ""), allowedComponents, found);
			break;
		case "link":
		case "image":
		case "definition": {
			const scheme = badUrl(node.url ?? "", node.type === "image");
			if (scheme) found.add(scheme);
			break;
		}
	}
	for (const child of node.children ?? []) walk(child, allowedComponents, found);
}

/**
 * What an author may not put in a body: in MDX, imports/exports, JavaScript expressions (props may only be JSON),
 * unlisted components, event handlers, Astro directives and code URLs; in Markdown, dangerous raw HTML, event
 * handlers and code URLs. The body is parsed with the same parser Astro uses, so MDX that would break the build is
 * reported too. Empty means the body is acceptable.
 */
export async function findDisallowed(
	body: string,
	allowedComponents: readonly string[],
	format: "md" | "mdx" = "mdx",
): Promise<string[]> {
	const parser = await loadSatteri();
	let tree: Node;
	try {
		tree =
			format === "mdx"
				? parser.mdxToMdast(body, { position: false })
				: parser.markdownToMdast(body, { position: false });
	} catch (e) {
		return [`invalid MDX: ${(e as Error).message.split("\n")[0]}`];
	}
	const found = new Set<string>();
	walk(tree, allowedComponents, found);
	return [...found];
}
