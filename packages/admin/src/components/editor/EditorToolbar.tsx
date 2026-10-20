import { $createCodeNode } from "@lexical/code";
import { TOGGLE_LINK_COMMAND } from "@lexical/link";
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { $createParagraphNode, $getSelection, $isRangeSelection, FORMAT_TEXT_COMMAND, type ElementNode } from "lexical";
import { useEffect, useState } from "react";
import { apiData } from "../../lib/api.ts";
import type { MediaItem } from "../../stores/content.ts";
import { Button, Dialog, Input, Select } from "../../ui/index.tsx";
import { MediaPicker } from "../media/MediaPicker.tsx";
import { componentSnippet, imageSnippet, insertSnippet, tableSnippet } from "./snippets.ts";

/** Turns the blocks in the selection into another kind (heading, quote, code, paragraph). */
const setBlock = (make: () => ElementNode) => {
	const selection = $getSelection();
	if ($isRangeSelection(selection)) $setBlocksType(selection, make);
};

const button = (label: string, run: () => void, text = label) => (
	<Button type="button" size="sm" variant="ghost" aria-label={label} onClick={run}>
		{text}
	</Button>
);

export function EditorToolbar() {
	const [editor] = useLexicalComposerContext();
	const [components, setComponents] = useState<string[]>([]);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [image, setImage] = useState<{ item: MediaItem; alt: string; caption: string } | null>(null);
	const [link, setLink] = useState<string | null>(null);

	useEffect(() => {
		void apiData<string[]>("GET", "/api/editor/components")
			.then(setComponents)
			.catch(() => undefined);
	}, []);

	return (
		<div
			role="toolbar"
			aria-label="Formatting"
			className="mb-2 flex flex-wrap items-center gap-1 rounded-ui border border-border p-1"
		>
			{button("Bold", () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold"), "B")}
			{button("Italic", () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic"), "I")}
			{button("Inline code", () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code"), "</>")}
			{button("Paragraph", () => editor.update(() => setBlock($createParagraphNode)), "¶")}
			{button("Heading 2", () => editor.update(() => setBlock(() => $createHeadingNode("h2"))), "H2")}
			{button("Heading 3", () => editor.update(() => setBlock(() => $createHeadingNode("h3"))), "H3")}
			{button("Quote", () => editor.update(() => setBlock($createQuoteNode)), "❝")}
			{button("Bulleted list", () => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined), "•")}
			{button("Numbered list", () => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined), "1.")}
			{button("Code block", () => editor.update(() => setBlock($createCodeNode)), "{ }")}
			{button("Link", () => setLink("https://"), "🔗")}
			{button("Table", () => insertSnippet(editor, tableSnippet()), "▦")}
			{button("Image from library", () => setPickerOpen(true), "🖼")}
			{components.length > 0 && (
				<Select
					aria-label="Insert component"
					value=""
					onChange={(e) => e.target.value && insertSnippet(editor, componentSnippet(e.target.value))}
				>
					<option value="">Component…</option>
					{components.map((c) => (
						<option key={c} value={c}>
							{c}
						</option>
					))}
				</Select>
			)}

			<MediaPicker
				open={pickerOpen}
				onClose={() => setPickerOpen(false)}
				onPick={([item]) => {
					setPickerOpen(false);
					if (item) setImage({ item, alt: item.alt ?? "", caption: item.caption ?? "" });
				}}
			/>
			<Dialog
				open={!!image}
				title="Insert image"
				onClose={() => setImage(null)}
				footer={
					<>
						<Button variant="ghost" onClick={() => setImage(null)}>
							Cancel
						</Button>
						<Button
							onClick={() => {
								if (image) insertSnippet(editor, imageSnippet(image.item.url, image.alt, image.caption));
								setImage(null);
							}}
						>
							Insert
						</Button>
					</>
				}
			>
				{image && (
					<div className="grid gap-3">
						<img src={image.item.url} alt="" className="max-h-40 rounded-md object-contain" />
						<Input
							label="Alt text"
							hint="Describe the image for people who cannot see it. Leave empty for decorative images."
							value={image.alt}
							onChange={(e) => setImage({ ...image, alt: e.target.value })}
						/>
						<Input
							label="Caption"
							value={image.caption}
							onChange={(e) => setImage({ ...image, caption: e.target.value })}
						/>
					</div>
				)}
			</Dialog>
			<Dialog
				open={link !== null}
				title="Link"
				onClose={() => setLink(null)}
				footer={
					<>
						<Button
							variant="ghost"
							onClick={() => {
								editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
								setLink(null);
							}}
						>
							Remove link
						</Button>
						<Button
							onClick={() => {
								// Only web, mail and site-relative links; javascript: and data: never reach the document.
								if (link && /^(https?:\/\/|mailto:|\/|#)/i.test(link.trim()))
									editor.dispatchCommand(TOGGLE_LINK_COMMAND, link.trim());
								setLink(null);
							}}
						>
							Apply
						</Button>
					</>
				}
			>
				<Input label="Address" value={link ?? ""} onChange={(e) => setLink(e.target.value)} />
			</Dialog>
		</div>
	);
}
