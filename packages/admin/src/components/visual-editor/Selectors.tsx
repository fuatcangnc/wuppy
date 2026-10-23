import { Trash2 } from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { safeSelector } from "@wuppy/visual-editor";
import { useState } from "react";
import { Button, IconButton, Input } from "../../ui/index.tsx";
import { Section } from "./Explorer.tsx";
import { $target, $visual, ensureSelector, mutateVisual } from "./store.ts";

/** Instatic's selector library: class and element selectors shared by every page, styled in Properties. */
export function SelectorsPanel() {
	const visual = useStore($visual);
	const target = useStore($target);
	const [query, setQuery] = useState("");
	const [draft, setDraft] = useState("");
	const list = visual.selectors.filter((s) => s.selector.toLowerCase().includes(query.toLowerCase()));
	const add = () => {
		const s = draft.trim();
		if (!safeSelector(s)) return;
		$target.set(ensureSelector(s));
		setDraft("");
	};
	return (
		<div>
			<Section title="New selector">
				<div className="flex items-end gap-1">
					<Input
						label="Selector"
						placeholder=".card, h2, .hero > p"
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && add()}
						error={draft && !safeSelector(draft.trim()) ? "Not a valid selector" : null}
						className="h-8 font-mono text-xs"
					/>
					<Button size="sm" variant="secondary" disabled={!safeSelector(draft.trim())} onClick={add}>
						Add
					</Button>
				</div>
			</Section>
			<Section title={`Library (${visual.selectors.length})`}>
				<Input
					aria-label="Search selectors"
					placeholder="Search…"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					className="h-8 text-xs"
				/>
				<ul className="grid gap-0.5 text-xs">
					{list.map((s) => {
						const count =
							Object.keys(s.styles).length + Object.values(s.overrides).reduce((n, o) => n + Object.keys(o).length, 0);
						return (
							<li
								key={s.id}
								className={`group flex items-center gap-1 rounded px-1 ${target === s.id ? "bg-purple-500/20" : "hover:bg-muted"}`}
							>
								<button
									type="button"
									className="min-w-0 flex-1 truncate py-1 text-left font-mono"
									onClick={() => $target.set(s.id)}
								>
									{s.selector}
								</button>
								<span className="text-muted-foreground">{count}</span>
								<IconButton
									label="Delete selector"
									size="icon-sm"
									onClick={() =>
										confirm(`Delete ${s.selector}? Elements keep the class name but lose these styles.`) &&
										mutateVisual((v) => void (v.selectors = v.selectors.filter((x) => x.id !== s.id)))
									}
								>
									<Trash2 size={12} />
								</IconButton>
							</li>
						);
					})}
				</ul>
				{target && visual.selectors.some((s) => s.id === target) && (
					<Input
						label="Rename selected"
						value={visual.selectors.find((s) => s.id === target)!.selector}
						onChange={(e) =>
							safeSelector(e.target.value.trim()) &&
							mutateVisual(
								(v) => void (v.selectors.find((s) => s.id === target)!.selector = e.target.value.trim()),
								`rename:${target}`,
							)
						}
						className="h-8 font-mono text-xs"
					/>
				)}
			</Section>
		</div>
	);
}
