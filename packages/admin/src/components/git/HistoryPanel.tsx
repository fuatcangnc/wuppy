import { useStore } from "@nanostores/react";
import { useEffect } from "react";
import { $compare, $diff, $gitError, $history, compareWith, loadHistory, revert, showDiff } from "../../stores/git.ts";
import { RevisionCompare } from "./RevisionCompare.tsx";
import { DiffView } from "./DiffView.tsx";
import { GhostButton, ErrorText } from "../../ui/index.tsx";

export function HistoryPanel({
	collection,
	slug,
	onReverted,
}: {
	collection: string;
	slug: string;
	onReverted: () => void;
}) {
	const history = useStore($history);
	const diff = useStore($diff);
	const compare = useStore($compare);
	const error = useStore($gitError);
	useEffect(() => void loadHistory(collection, slug), [collection, slug]);

	return (
		<aside className="grid content-start gap-2" aria-label="History">
			<h2 className="font-semibold">History</h2>
			<ErrorText>{error}</ErrorText>
			{history.length === 0 && <p className="text-sm text-muted-foreground">No saved versions yet.</p>}
			<ul className="grid gap-2">
				{history.map((c) => (
					<li key={c.sha} className="rounded-ui border border-border p-2 text-sm">
						<div>{c.message}</div>
						<div className="text-muted-foreground">
							{c.author} · {new Date(c.date).toLocaleString()}
						</div>
						<div className="mt-1 flex gap-2">
							<GhostButton onClick={() => void showDiff(c.sha)}>Changes</GhostButton>
							<GhostButton onClick={() => void compareWith(c.sha, collection, slug)}>Compare</GhostButton>
							<GhostButton
								onClick={() => {
									if (confirm("Undo this change? A new version is added; nothing is lost."))
										void revert(c.sha, collection, slug).then(onReverted);
								}}
							>
								Undo
							</GhostButton>
						</div>
					</li>
				))}
			</ul>
			{diff && <DiffView text={diff.text} />}
			{compare && <RevisionCompare changes={compare.changes} />}
		</aside>
	);
}
