import { useState } from "react";
import { Button, Input } from "../../ui/index.tsx";
import { add, indent, outdent, relocate, remove, shift, update, type MenuItem, type Path } from "./tree.ts";

/** Visual editor for a menu's links: reorder with the arrows or by dragging, indent into a submenu, edit in place. */
export function MenuItemsEditor({ items, onChange }: { items: MenuItem[]; onChange: (items: MenuItem[]) => void }) {
	const [dragging, setDragging] = useState<Path | null>(null);

	const row = (label: string, href: string, path: Path) => {
		const name = `${label || "link"}`;
		return (
			<li
				key={path.join(".")}
				draggable
				onDragStart={() => setDragging(path)}
				onDragEnd={() => setDragging(null)}
				onDragOver={(e) => dragging && e.preventDefault()}
				onDrop={(e) => {
					e.preventDefault();
					if (dragging) onChange(relocate(items, dragging, path));
					setDragging(null);
				}}
				className={`flex flex-wrap items-end gap-2 rounded-md border p-2 ${path.length === 2 ? "ms-6" : ""}`}
			>
				<Input
					aria-label={`Label of ${name}`}
					value={label}
					onChange={(e) => onChange(update(items, path, { label: e.target.value }))}
				/>
				<Input
					aria-label={`Link of ${name}`}
					value={href}
					onChange={(e) => onChange(update(items, path, { href: e.target.value }))}
				/>
				<Button
					size="sm"
					variant="ghost"
					aria-label={`Move ${name} up`}
					onClick={() => onChange(shift(items, path, -1))}
				>
					↑
				</Button>
				<Button
					size="sm"
					variant="ghost"
					aria-label={`Move ${name} down`}
					onClick={() => onChange(shift(items, path, 1))}
				>
					↓
				</Button>
				{path.length === 1 ? (
					<Button
						size="sm"
						variant="ghost"
						aria-label={`Make ${name} a submenu item`}
						onClick={() => onChange(indent(items, path))}
					>
						→
					</Button>
				) : (
					<Button
						size="sm"
						variant="ghost"
						aria-label={`Move ${name} to the top level`}
						onClick={() => onChange(outdent(items, path))}
					>
						←
					</Button>
				)}
				<Button size="sm" variant="ghost" aria-label={`Remove ${name}`} onClick={() => onChange(remove(items, path))}>
					✕
				</Button>
			</li>
		);
	};

	return (
		<div className="grid gap-2">
			<ul className="grid gap-2" aria-label="Menu links">
				{items.flatMap((item, i) => [
					row(item.label, item.href, [i]),
					...item.children.map((child, j) => row(child.label, child.href, [i, j])),
				])}
			</ul>
			<Button size="sm" variant="secondary" onClick={() => onChange(add(items))}>
				+ Add link
			</Button>
		</div>
	);
}
