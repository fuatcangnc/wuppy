import { Button, Input, Select, Textarea } from "../../ui/index.tsx";

export const WIDGET_TYPES = ["text", "html", "menu", "recent", "taxonomy", "custom"] as const;
export interface Widget {
	id: string;
	type: (typeof WIDGET_TYPES)[number];
	title: string;
	body: string;
	menu?: string;
	taxonomy?: string;
	locales: string[];
	collections: string[];
	paths: string[];
}

export const newWidget = (existing: Widget[]): Widget => {
	let n = existing.length + 1;
	while (existing.some((w) => w.id === `widget-${n}`)) n++;
	return { id: `widget-${n}`, type: "text", title: "", body: "", locales: [], collections: [], paths: [] };
};

const list = (text: string) =>
	text
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);

/** Widgets of one area: add, edit, reorder, remove. Visibility rules are comma-separated lists. */
export function WidgetListEditor({ widgets, onChange }: { widgets: Widget[]; onChange: (widgets: Widget[]) => void }) {
	const patch = (i: number, change: Partial<Widget>) =>
		onChange(widgets.map((w, j) => (j === i ? { ...w, ...change } : w)));
	const move = (i: number, by: -1 | 1) => {
		const next = widgets.slice();
		const [w] = next.splice(i, 1);
		next.splice(Math.min(Math.max(i + by, 0), next.length), 0, w!);
		onChange(next);
	};

	return (
		<div className="grid gap-3">
			{widgets.map((w, i) => (
				<fieldset key={w.id} className="grid gap-2 rounded-md border p-3">
					<legend className="px-1 text-xs text-muted-foreground">{w.id}</legend>
					<div className="flex flex-wrap items-end gap-2">
						<Select
							aria-label={`Type of ${w.id}`}
							value={w.type}
							onChange={(e) => patch(i, { type: e.target.value as Widget["type"] })}
						>
							{WIDGET_TYPES.map((t) => (
								<option key={t} value={t}>
									{t}
								</option>
							))}
						</Select>
						<Input
							aria-label={`Title of ${w.id}`}
							placeholder="Title"
							value={w.title}
							onChange={(e) => patch(i, { title: e.target.value })}
						/>
						<Button
							size="sm"
							variant="ghost"
							aria-label={`Move ${w.id} up`}
							disabled={i === 0}
							onClick={() => move(i, -1)}
						>
							↑
						</Button>
						<Button
							size="sm"
							variant="ghost"
							aria-label={`Move ${w.id} down`}
							disabled={i === widgets.length - 1}
							onClick={() => move(i, 1)}
						>
							↓
						</Button>
						<Button
							size="sm"
							variant="ghost"
							aria-label={`Remove ${w.id}`}
							onClick={() => onChange(widgets.filter((_, j) => j !== i))}
						>
							✕
						</Button>
					</div>
					{(w.type === "text" || w.type === "html" || w.type === "custom") && (
						<Textarea
							aria-label={`Content of ${w.id}`}
							placeholder={
								w.type === "html"
									? "HTML (scripts and event handlers are refused)"
									: w.type === "custom"
										? 'Markdown, e.g. **Hello** or <div class="note">…</div>'
										: "Text"
							}
							value={w.body}
							onChange={(e) => patch(i, { body: e.target.value })}
						/>
					)}
					{w.type === "menu" && (
						<Input
							aria-label={`Menu of ${w.id}`}
							placeholder="Menu key"
							value={w.menu ?? ""}
							onChange={(e) => patch(i, { menu: e.target.value })}
						/>
					)}
					{w.type === "taxonomy" && (
						<Input
							aria-label={`Taxonomy of ${w.id}`}
							placeholder="Taxonomy key"
							value={w.taxonomy ?? ""}
							onChange={(e) => patch(i, { taxonomy: e.target.value })}
						/>
					)}
					<div className="grid gap-2 md:grid-cols-3">
						<Input
							aria-label={`Languages of ${w.id}`}
							placeholder="Languages (all)"
							defaultValue={w.locales.join(", ")}
							onBlur={(e) => patch(i, { locales: list(e.target.value) })}
						/>
						<Input
							aria-label={`Collections of ${w.id}`}
							placeholder="Collections (all)"
							defaultValue={w.collections.join(", ")}
							onBlur={(e) => patch(i, { collections: list(e.target.value) })}
						/>
						<Input
							aria-label={`Pages of ${w.id}`}
							placeholder="Pages, e.g. /about, /blog/* (all)"
							defaultValue={w.paths.join(", ")}
							onBlur={(e) => patch(i, { paths: list(e.target.value) })}
						/>
					</div>
				</fieldset>
			))}
			<Button size="sm" variant="secondary" onClick={() => onChange([...widgets, newWidget(widgets)])}>
				+ Add widget
			</Button>
		</div>
	);
}
