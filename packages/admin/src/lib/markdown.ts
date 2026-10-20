import { CodeNode } from "@lexical/code";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { $convertFromMarkdownString, $convertToMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { createEditor } from "lexical";

export const NODES = [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, AutoLinkNode, CodeNode];
export const TRANSFORM = TRANSFORMERS;

/** Headless Markdown -> editor state -> Markdown. Used to prove the editor does not mangle content. */
export function roundTrip(markdown: string): string {
	const editor = createEditor({
		nodes: NODES,
		onError: (e) => {
			throw e;
		},
	});
	let out = "";
	editor.update(() => $convertFromMarkdownString(markdown, TRANSFORM), { discrete: true });
	editor.read(() => (out = $convertToMarkdownString(TRANSFORM)));
	return out;
}
