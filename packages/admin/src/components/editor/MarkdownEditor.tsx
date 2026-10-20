import { $convertFromMarkdownString, $convertToMarkdownString } from "@lexical/markdown";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { NODES, TRANSFORM } from "../../lib/markdown.ts";
import { EditorToolbar } from "./EditorToolbar.tsx";

/** Uncontrolled: `initial` seeds the editor once; remount (key) to load another document. */
export function MarkdownEditor({ initial, onChange }: { initial: string; onChange: (markdown: string) => void }) {
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
			<EditorToolbar />
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
