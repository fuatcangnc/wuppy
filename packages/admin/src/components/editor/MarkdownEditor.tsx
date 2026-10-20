import { $convertFromMarkdownString, $convertToMarkdownString } from "@lexical/markdown";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { $createParagraphNode, $createTextNode, $getRoot } from "lexical";
import { NODES, TRANSFORM } from "../../lib/markdown.ts";
import { Input } from "../../ui/index.tsx";

function ImageButton({ onUpload }: { onUpload: (file: File) => Promise<string> }) {
	const [editor] = useLexicalComposerContext();
	return (
		<Input
			type="file"
			accept="image/png,image/jpeg,image/gif,image/webp"
			aria-label="Insert image"
			onChange={(e) => {
				const file = e.target.files?.[0];
				e.target.value = "";
				if (!file) return;
				const alt = window.prompt("Describe the image (alt text)", file.name.replace(/\.[^.]+$/, "")) ?? "";
				void onUpload(file)
					.then((url) =>
						editor.update(() => {
							$getRoot().append($createParagraphNode().append($createTextNode(`![${alt}](${url})`)));
						}),
					)
					.catch((error: Error) => alert(`Upload failed: ${error.message}`));
			}}
		/>
	);
}

/** Uncontrolled: `initial` seeds the editor once; remount (key) to load another document. */
export function MarkdownEditor({
	initial,
	onChange,
	onUpload,
}: {
	initial: string;
	onChange: (markdown: string) => void;
	onUpload?: (file: File) => Promise<string>;
}) {
	return (
		<LexicalComposer
			initialConfig={{
				namespace: "wuppy",
				nodes: NODES,
				onError: (error) => {
					throw error;
				},
				editorState: () => $convertFromMarkdownString(initial, TRANSFORM),
				theme: {
					paragraph: "mb-3",
					heading: { h1: "text-2xl font-bold mb-3", h2: "text-xl font-bold mb-3", h3: "text-lg font-bold mb-2" },
				},
			}}
		>
			{onUpload && <ImageButton onUpload={onUpload} />}
			<RichTextPlugin
				contentEditable={
					<ContentEditable
						aria-label="Content"
						className="min-h-64 rounded-ui border border-border p-3 outline-none focus-visible:outline-2 focus-visible:outline-accent"
					/>
				}
				ErrorBoundary={LexicalErrorBoundary}
			/>
			<HistoryPlugin />
			<ListPlugin />
			<LinkPlugin />
			<MarkdownShortcutPlugin transformers={TRANSFORM} />
			<OnChangePlugin
				ignoreSelectionChange
				onChange={(state) => state.read(() => onChange($convertToMarkdownString(TRANSFORM)))}
			/>
		</LexicalComposer>
	);
}
