const DANGEROUS_HTML = new Set(["script", "iframe", "style", "object", "embed", "link", "meta", "base", "form"]);

const stripCode = (s: string) => s.replace(/^```[\s\S]*?^```/gm, "").replace(/`[^`\n]*`/g, "");

/**
 * Returns what an author is not allowed to put in MDX: unlisted components, code (import/export),
 * dangerous raw HTML and `javascript:` links. Empty array means the body is acceptable.
 * shortcut: a line-based scan, not a full MDX parse; swap for the MDX AST (remark-mdx) when we need exact positions.
 */
export function findDisallowed(body: string, allowedComponents: readonly string[]): string[] {
	const text = stripCode(body);
	const found = new Set<string>();

	if (/^\s*import\s/m.test(text)) found.add("import");
	if (/^\s*export\s/m.test(text)) found.add("export");
	if (/\]\(\s*javascript:/i.test(text)) found.add("javascript:");

	for (const m of text.matchAll(/<([A-Za-z][A-Za-z0-9.-]*)(?=[\s/>])/g)) {
		const name = m[1] ?? "";
		if (/^[A-Z]/.test(name) ? !allowedComponents.includes(name) : DANGEROUS_HTML.has(name.toLowerCase()))
			found.add(name);
	}
	return [...found];
}
