type Kind = "add" | "del" | "hunk" | "ctx";

const kindOf = (line: string): Kind =>
	line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") || line.startsWith("index ")
		? "hunk"
		: line.startsWith("@@")
			? "hunk"
			: line.startsWith("+")
				? "add"
				: line.startsWith("-")
					? "del"
					: "ctx";

const STYLE: Record<Kind, string> = {
	add: "bg-primary/15",
	del: "bg-destructive/15",
	hunk: "text-muted-foreground",
	ctx: "",
};

/** Colour is a hint only: added/removed lines also carry a text label for screen readers. */
export function DiffView({ text }: { text: string }) {
	const lines = text.split("\n").filter((l) => l !== "");
	if (lines.length === 0) return <p className="text-sm text-muted-foreground">No changes</p>;
	return (
		<ul className="overflow-auto rounded-ui bg-card p-2 font-mono text-xs" aria-label="Changes">
			{lines.map((line, i) => {
				const kind = kindOf(line);
				const body = kind === "add" || kind === "del" ? line.slice(1) : line;
				return (
					<li key={i} data-kind={kind} className={`whitespace-pre-wrap ${STYLE[kind]}`}>
						{kind === "add" && <span className="sr-only">Added: </span>}
						{kind === "del" && <span className="sr-only">Removed: </span>}
						<span>{body}</span>
					</li>
				);
			})}
		</ul>
	);
}
