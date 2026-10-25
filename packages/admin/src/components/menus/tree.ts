/** Two-level menu editing as pure functions. A path is `[i]` for a top-level item or `[i, j]` for a child. */

export interface MenuLink {
	label: string;
	href: string;
	/** Source hint shown as a badge in the editor. */
	kind?: string;
	/** Short text a theme can show under the label. */
	description?: string;
}
export interface MenuItem extends MenuLink {
	children: MenuLink[];
}
export type Path = [number] | [number, number];

/** The link without its children. */
const linkOf = ({ label, href, kind, description }: MenuLink): MenuLink => ({
	label,
	href,
	...(kind ? { kind } : {}),
	...(description ? { description } : {}),
});

const clone = (items: MenuItem[]): MenuItem[] =>
	items.map((i) => ({ ...i, children: i.children.map((c) => ({ ...c })) }));

export const linkAt = (items: MenuItem[], path: Path): MenuLink | undefined =>
	path.length === 1 ? items[path[0]] : items[path[0]]?.children[path[1]];

/** Removes the link at `path` and returns it with the remaining items. */
function take(items: MenuItem[], path: Path): { rest: MenuItem[]; link: MenuItem | MenuLink } | null {
	const rest = clone(items);
	if (path.length === 1) {
		const [link] = rest.splice(path[0], 1);
		return link ? { rest, link } : null;
	}
	const [link] = rest[path[0]]?.children.splice(path[1], 1) ?? [];
	return link ? { rest, link } : null;
}

export const add = (
	items: MenuItem[],
	link: MenuLink = { label: "New link", href: "/", kind: "custom" },
): MenuItem[] => [...clone(items), { ...link, children: [] }];

export function update(items: MenuItem[], path: Path, patch: Partial<MenuLink>): MenuItem[] {
	const next = clone(items);
	const target = path.length === 1 ? next[path[0]] : next[path[0]]?.children[path[1]];
	if (target) Object.assign(target, patch);
	return next;
}

export const remove = (items: MenuItem[], path: Path): MenuItem[] => take(items, path)?.rest ?? items;

/** Swaps the link with its neighbour in the same list; no-op at the ends. */
export function shift(items: MenuItem[], path: Path, by: -1 | 1): MenuItem[] {
	const next = clone(items);
	const list: MenuLink[] = path.length === 1 ? next : (next[path[0]]?.children ?? []);
	const at = path.length === 1 ? path[0] : path[1];
	const to = at + by;
	if (to < 0 || to >= list.length) return items;
	[list[at], list[to]] = [list[to]!, list[at]!];
	return next;
}

/** Makes a top-level link a child of the one above it. Refused when it has children itself (menus are two levels deep). */
export function indent(items: MenuItem[], path: Path): MenuItem[] {
	if (path.length !== 1 || path[0] === 0) return items;
	const item = items[path[0]];
	if (!item || item.children.length > 0) return items;
	const taken = take(items, path);
	if (!taken) return items;
	taken.rest[path[0] - 1]!.children.push({
		...linkOf(item),
	});
	return taken.rest;
}

/** Moves a child out to the top level, right after its parent. */
export function outdent(items: MenuItem[], path: Path): MenuItem[] {
	if (path.length !== 2) return items;
	const taken = take(items, path);
	if (!taken) return items;
	taken.rest.splice(path[0] + 1, 0, {
		...linkOf(taken.link),
		children: [],
	});
	return taken.rest;
}

/**
 * Drag and drop: puts the link at `from` before the link at `to` (same level), or at the end of the children when `to`
 * is a top-level link and `from` is a child of it. A top-level link with children cannot become a child.
 */
export function relocate(items: MenuItem[], from: Path, to: Path): MenuItem[] {
	if (from.length === to.length && from.every((n, i) => n === to[i])) return items;
	const source = linkAt(items, from);
	if (!source) return items;
	if (from.length === 1 && to.length === 2 && (source as MenuItem).children.length > 0) return items;
	const taken = take(items, from);
	if (!taken) return items;
	const rest = taken.rest;
	// Indexes after the removal: removing an earlier sibling shifts the target left.
	const sameList = from.length === to.length && (from.length === 1 || from[0] === to[0]);
	const fromAt = from.length === 1 ? from[0] : from[1];
	const toAt = to.length === 1 ? to[0] : to[1];
	const index = sameList && fromAt < toAt ? toAt - 1 : toAt;
	if (to.length === 1)
		rest.splice(index, 0, {
			...linkOf(taken.link),
			children: (taken.link as MenuItem).children ?? [],
		});
	else {
		const parent = from.length === 1 && from[0] < to[0] ? to[0] - 1 : to[0];
		rest[parent]?.children.splice(index, 0, {
			...linkOf(taken.link),
		});
	}
	return rest;
}
