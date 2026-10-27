import {
	ArrowDown,
	ArrowUp,
	ChevronDown,
	GripVertical,
	IndentDecrease,
	IndentIncrease,
	Plus,
	Trash2,
} from "@react-zero-ui/icon-sprite";
import { useState } from "react";
import { Badge, Button, Input } from "../../ui/index.tsx";
import { add, indent, outdent, relocate, remove, shift, update, type MenuItem, type Path } from "./tree.ts";

const kindLabel = (kind?: string) => {
	switch (kind) {
		case "page":
			return "Page";
		case "post":
			return "Post";
		case "category":
			return "Category";
		case "language":
			return "Language";
		case "custom":
			return "Custom Link";
		default:
			return kind ? kind.replace(/[-_]/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()) : "Custom Link";
	}
};

/** Visual editor for a menu's links: reorder by dragging, indent into a submenu, edit in place. */
export function MenuItemsEditor({ items, onChange }: { items: MenuItem[]; onChange: (items: MenuItem[]) => void }) {
	const [expanded, setExpanded] = useState<string | null>(null);
	const [dragging, setDragging] = useState<Path | null>(null);
	const [over, setOver] = useState<string | null>(null);

	const row = (link: MenuItem["children"][number], path: Path) => {
		const key = path.join(".");
		const name = link.label || "link";
		const open = expanded === key;
		return (
			<li
				key={key}
				draggable
				data-dragging={dragging?.join(".") === key ? "true" : undefined}
				onDragStart={(event) => {
					setDragging(path);
					if (event.dataTransfer) {
						event.dataTransfer.effectAllowed = "move";
						event.dataTransfer.setData("text/plain", key);
					}
				}}
				onDragEnd={() => {
					setDragging(null);
					setOver(null);
				}}
				onDragOver={(event) => {
					if (!dragging) return;
					event.preventDefault();
					if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
					setOver(key);
				}}
				onDragLeave={(event) => {
					if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
					setOver((current) => (current === key ? null : current));
				}}
				onDrop={(event) => {
					event.preventDefault();
					const fallback = event.dataTransfer?.getData("text/plain") || "";
					const source = dragging ?? (fallback ? (fallback.split(".").map(Number) as Path) : null);
					if (source?.length) onChange(relocate(items, source, path));
					setDragging(null);
					setOver(null);
				}}
				className={`overflow-hidden rounded-xl border bg-muted/25 transition ${
					path.length === 2 ? "ms-6" : ""
				} ${dragging?.join(".") === key ? "opacity-40" : ""} ${
					over === key ? "border-primary ring-2 ring-primary/20" : "border-border"
				}`}
			>
				<div className="flex items-center gap-2 px-3 py-2.5">
					<GripVertical size={16} className="shrink-0 cursor-grab text-muted-foreground" aria-hidden="true" />
					<span className="min-w-0 flex-1 truncate text-sm font-medium">{link.label || "Untitled link"}</span>
					{path.length === 2 && <span className="text-xs text-muted-foreground italic">Sub item</span>}
					<Badge tone="neutral">{kindLabel(link.kind)}</Badge>
					<Button
						size="icon-sm"
						variant="ghost"
						aria-label={`Toggle options for ${name}`}
						aria-expanded={open}
						onClick={() => setExpanded(open ? null : key)}
					>
						<ChevronDown size={14} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
					</Button>
				</div>
				{open && (
					<div className="grid gap-3 border-t border-border bg-background/60 p-3">
						<div className="grid gap-2 sm:grid-cols-2">
							<Input
								aria-label={`Label of ${name}`}
								placeholder="Label"
								value={link.label}
								onChange={(event) => onChange(update(items, path, { label: event.target.value }))}
							/>
							<Input
								aria-label={`Link of ${name}`}
								placeholder="/path or https://…"
								value={link.href}
								onChange={(event) => onChange(update(items, path, { href: event.target.value }))}
							/>
						</div>
						<Input
							aria-label={`Description of ${name}`}
							placeholder="Description (optional, shown by themes that support it)"
							maxLength={300}
							value={link.description ?? ""}
							onChange={(event) => onChange(update(items, path, { description: event.target.value || undefined }))}
						/>
						<div className="flex flex-wrap items-center gap-1">
							<Button
								size="icon-sm"
								variant="ghost"
								aria-label={`Move ${name} up`}
								title="Move up"
								onClick={() => onChange(shift(items, path, -1))}
							>
								<ArrowUp size={14} />
							</Button>
							<Button
								size="icon-sm"
								variant="ghost"
								aria-label={`Move ${name} down`}
								title="Move down"
								onClick={() => onChange(shift(items, path, 1))}
							>
								<ArrowDown size={14} />
							</Button>
							{path.length === 1 ? (
								<Button
									size="sm"
									variant="ghost"
									aria-label={`Make ${name} a submenu item`}
									onClick={() => onChange(indent(items, path))}
								>
									<IndentIncrease size={14} /> Submenu
								</Button>
							) : (
								<Button
									size="sm"
									variant="ghost"
									aria-label={`Move ${name} to the top level`}
									onClick={() => onChange(outdent(items, path))}
								>
									<IndentDecrease size={14} /> Top level
								</Button>
							)}
							<Button
								size="sm"
								variant="ghost"
								className="ms-auto text-destructive"
								aria-label={`Remove ${name}`}
								onClick={() => onChange(remove(items, path))}
							>
								<Trash2 size={14} /> Remove
							</Button>
						</div>
					</div>
				)}
			</li>
		);
	};

	return (
		<div className="grid gap-3">
			<ul className="flex flex-col gap-2" aria-label="Menu links">
				{items.flatMap((item, i) => [row(item, [i]), ...item.children.map((child, j) => row(child, [i, j]))])}
			</ul>
			<Button size="sm" variant="secondary" onClick={() => onChange(add(items))}>
				<Plus size={14} /> Add link
			</Button>
		</div>
	);
}
