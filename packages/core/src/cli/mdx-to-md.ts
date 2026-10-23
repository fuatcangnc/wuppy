import { access, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { loadConfig } from "../config/index.ts";
import { findDisallowed } from "../markdown/index.ts";

/** Code (fenced and inline) is copied as is, so it is left out of the checks. */
const prose = (body: string) => body.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, "").replace(/`[^`\n]*`/g, "");

/**
 * One `.mdx` body as Markdown: drops `import`/`export` lines, turns `{/* comments *\/}` into HTML comments and
 * `className` into `class`. Returns the reasons it cannot be converted (components, expressions) instead.
 */
export async function mdxToMarkdown(source: string): Promise<{ markdown: string } | { problems: string[] }> {
	const front = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(source)?.[0] ?? "";
	const raw = source.slice(front.length).replace(/^(import|export)\s[^\n]*\n?/gm, "");
	const body = raw
		.replace(/\{\/\*([\s\S]*?)\*\/\}/g, "<!--$1-->")
		.replace(/(<[a-z][\w-]*\b[^>]*?\s)className=/g, "$1class=")
		.replace(/^\n+/, "");
	const problems: string[] = [];
	if (/\{[^}\n]*\}/.test(prose(body).replace(/<!--[\s\S]*?-->/g, ""))) problems.push("JSX expression {…}");
	problems.push(...(await findDisallowed(raw, [], "mdx")));
	return problems.length ? { problems } : { markdown: front + body };
}

/** `wuppy mdx-to-md [dir]`: converts the `.mdx` entries of every collection (or one folder) to `.md`, once. */
export async function convertMdx(cwd: string, dir?: string): Promise<{ code: number; stdout: string; stderr: string }> {
	let dirs: string[];
	try {
		dirs = dir ? [dir] : (await loadConfig(cwd)).collections.map((c) => c.dir);
	} catch (e) {
		return { code: 1, stdout: "", stderr: (e as Error).message };
	}
	const lines: string[] = [];
	let kept = 0;
	for (const d of dirs) {
		const names = await readdir(join(cwd, d), { recursive: true }).catch(() => [] as string[]);
		for (const name of names.filter((n) => n.endsWith(".mdx"))) {
			const file = join(cwd, d, name);
			const target = file.replace(/\.mdx$/, ".md");
			const rel = relative(cwd, file);
			const taken = await access(target).then(
				() => true,
				() => false,
			);
			const out = taken
				? { problems: [`${relative(cwd, target)} already exists`] }
				: await mdxToMarkdown(await readFile(file, "utf8"));
			if ("problems" in out) {
				kept++;
				lines.push(`kept      ${rel}: ${out.problems.join(", ")}`);
				continue;
			}
			await writeFile(target, out.markdown);
			await rm(file);
			lines.push(`converted ${rel}`);
		}
	}
	if (!lines.length) lines.push("No .mdx files found.");
	else if (kept)
		lines.push("", `${kept} file(s) kept as .mdx: move their components into .astro files, then run this again.`);
	return { code: 0, stdout: lines.join("\n") + "\n", stderr: "" };
}
