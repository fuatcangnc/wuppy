import {
	$createLineBreakNode,
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	$getSelection,
	$isRangeSelection,
	type LexicalEditor,
} from "lexical";

const clean = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

/** Markdown for an image; a caption becomes the title, which renderers show as a tooltip or `<figcaption>`. */
export function imageSnippet(url: string, alt: string, caption = ""): string {
	const title = clean(caption).replaceAll('"', "'");
	return `![${clean(alt).replace(/[[\]]/g, "")}](${url}${title ? ` "${title}"` : ""})`;
}

export const tableSnippet = (columns = 3, rows = 2): string => {
	const row = (cell: (i: number) => string) => `| ${Array.from({ length: columns }, (_, i) => cell(i)).join(" | ")} |`;
	return [row((i) => `Column ${i + 1}`), row(() => "---"), ...Array.from({ length: rows }, () => row(() => " "))].join(
		"\n",
	);
};

/** An MDX component the site allows. Only names matching the allowlist pattern can be inserted. */
export function componentSnippet(name: string): string {
	if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) throw new Error(`Not a component name: ${name}`);
	return `<${name}>\nContent\n</${name}>`;
}

/** Puts `text` (several lines allowed) in a new paragraph after the block with the cursor, or at the end. */
export function insertSnippet(editor: LexicalEditor, text: string): void {
	editor.update(() => {
		const paragraph = $createParagraphNode();
		text.split("\n").forEach((line, i) => {
			if (i > 0) paragraph.append($createLineBreakNode());
			paragraph.append($createTextNode(line));
		});
		const selection = $getSelection();
		if ($isRangeSelection(selection)) selection.anchor.getNode().getTopLevelElementOrThrow().insertAfter(paragraph);
		else $getRoot().append(paragraph);
		paragraph.selectEnd();
	});
}
