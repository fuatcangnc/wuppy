const ALLOWED = new Set([
	"a",
	"b",
	"blockquote",
	"br",
	"code",
	"em",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"hr",
	"i",
	"li",
	"ol",
	"p",
	"pre",
	"strong",
	"ul",
]);
const VOID = new Set(["br", "hr"]);
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi;
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const decode = (s: string) =>
	s
		.replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
		.replace(/&#(\d+);?/g, (_, d: string) => String.fromCodePoint(Number(d)))
		.replace(/&(colon|tab|newline);/gi, (_, n: string) => ({ colon: ":", tab: "\t", newline: "\n" })[n.toLowerCase()]!);

/** Only relative links and http(s)/mailto survive; entity and whitespace tricks in the scheme are decoded first. */
function safeHref(raw: string): string | null {
	// eslint-disable-next-line no-control-regex
	const value = decode(raw).replace(/[\u0000- ]+/g, "");
	if (/^(https?:|mailto:)/i.test(value) || /^(\/(?!\/)|#|\?)/.test(value)) return decode(raw).trim();
	return null;
}

/**
 * Allowlist sanitizer for author/widget HTML: known tags are rebuilt from scratch (no attributes except a checked `href`),
 * everything else, including the text of dropped tags, is escaped to inert text.
 */
export function sanitizeHtml(input: string): string {
	// Drop code-carrying elements together with their content, repeatedly so nesting tricks cannot rebuild one.
	let html = input;
	for (let prev = ""; prev !== html;) {
		prev = html;
		html = html.replace(DROP_WITH_CONTENT, "");
	}
	let out = "";
	let last = 0;
	for (const m of html.matchAll(TAG)) {
		out += esc(html.slice(last, m.index));
		last = m.index + m[0].length;
		const [, closing, rawName = "", attrs = ""] = m;
		const name = rawName.toLowerCase();
		if (!ALLOWED.has(name)) continue;
		if (closing) {
			if (!VOID.has(name)) out += `</${name}>`;
			continue;
		}
		let href = "";
		if (name === "a") {
			const attr = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attrs);
			const safe = attr ? safeHref(attr[1] ?? attr[2] ?? attr[3] ?? "") : null;
			if (safe) href = ` href="${esc(safe)}" rel="noopener noreferrer"`;
		}
		out += `<${name}${href}>`;
	}
	return out + esc(html.slice(last));
}
