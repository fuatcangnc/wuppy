import {
	FileText,
	Languages,
	Link as LinkIcon,
	Menu as MenuIcon,
	Newspaper,
	PanelBottom,
	PanelLeft,
	PanelTop,
	Plus,
	Save,
	Tag,
	Trash2,
} from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api, apiData } from "../../lib/api.ts";
import { slugifyTitle } from "../../lib/slug.ts";
import { $data, $dataErrors, loadData, saveData } from "../../stores/dashboard.ts";
import type { CollectionInfo, EntrySummary } from "../../stores/content.ts";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
	Button,
	Card,
	Checkbox,
	Dialog,
	EmptyState,
	ErrorText,
	Input,
	PageHeader,
	Select,
	Spinner,
	Tabs,
	toast,
} from "../../ui/index.tsx";
import { MenuItemsEditor } from "./MenuItemsEditor.tsx";
import type { MenuItem as EditorMenuItem } from "./tree.ts";

interface MenuLink {
	label: string;
	href: string;
	kind?: string;
}
interface MenuItem extends MenuLink {
	children: MenuLink[];
}
interface Menu {
	name: string;
	label: string;
	location: string;
	locale?: string;
	items: MenuItem[];
}

interface SourceItem {
	label: string;
	href: string;
	kind: string;
}
interface SourceGroup {
	id: string;
	label: string;
	icon: ReactNode;
	items: SourceItem[];
	empty?: string;
	custom?: boolean;
}

interface TaxonomyTerm {
	slug: string;
	name: string;
}
interface TaxonomyRow {
	name: string;
	label: string;
	terms: TaxonomyTerm[];
}

const LOCATIONS = [
	{ id: "header", label: "Header", icon: <PanelTop size={14} /> },
	{ id: "footer", label: "Footer", icon: <PanelBottom size={14} /> },
	{ id: "sidebar", label: "Sidebar", icon: <PanelLeft size={14} /> },
];
const LOCATION_LABEL = Object.fromEntries(LOCATIONS.map((location) => [location.id, location.label]));
const hrefFor = (collection: CollectionInfo, slug: string) => collection.route?.replace("{slug}", slug) ?? `/${slug}`;
const linksOf = (items: MenuItem[]): MenuLink[] => items.flatMap((item) => [item, ...item.children]);
const sourceKey = (group: SourceGroup, item: SourceItem) => `${group.id}:${item.href}`;

export function MenusPage() {
	const stored = useStore($data)["menus"] as Menu[] | undefined;
	const dataError = useStore($dataErrors)["menus"];
	const [menus, setMenus] = useState<Menu[]>([]);
	const [saved, setSaved] = useState<Menu[]>([]);
	const [activeIndex, setActiveIndex] = useState(-1);
	const [picker, setPicker] = useState("");
	const [view, setView] = useState<"edit" | "locations">("edit");
	const [loading, setLoading] = useState(true);
	const [dirty, setDirty] = useState(false);
	const [sourceGroups, setSourceGroups] = useState<SourceGroup[]>([]);
	const [sourceLoading, setSourceLoading] = useState(true);
	const [sourceError, setSourceError] = useState<string | null>(null);
	const [openGroup, setOpenGroup] = useState<string | undefined>("pages");
	const [checked, setChecked] = useState<Set<string>>(() => new Set());
	const [custom, setCustom] = useState({ label: "", href: "" });
	const [customError, setCustomError] = useState<string | null>(null);
	const [createOpen, setCreateOpen] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);
	const [keyEdited, setKeyEdited] = useState(false);
	const [form, setForm] = useState({ label: "", name: "", location: "header", locale: "" });

	useEffect(() => {
		void loadData<Menu[]>("menus")
			.catch(() => undefined)
			.finally(() => setLoading(false));
	}, []);

	useEffect(() => {
		if (!Array.isArray(stored)) return;
		setMenus(stored);
		setSaved(stored);
		setActiveIndex((current) => (stored.length === 0 ? -1 : Math.min(Math.max(current, 0), stored.length - 1)));
	}, [stored]);

	useEffect(() => {
		if (activeIndex >= 0) setPicker(String(activeIndex));
		else setPicker("");
	}, [activeIndex, menus.length]);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const [collections, taxonomies] = await Promise.all([
					apiData<CollectionInfo[]>("GET", "/api/collections"),
					apiData<TaxonomyRow[]>("GET", "/api/data/taxonomies").catch(() => []),
				]);
				const groups: SourceGroup[] = [];
				for (const name of ["pages", "posts"] as const) {
					const collection = collections.find((item) => item.name === name);
					if (!collection) continue;
					let entries: EntrySummary[] = [];
					try {
						const result = await api<{ data: EntrySummary[] }>("GET", `/api/content/${name}?limit=200&sort=title`);
						entries = result.data;
					} catch {
						// Content read access can be narrower than menus: manage; keep the group empty.
					}
					groups.push({
						id: name,
						label: name === "pages" ? "Pages" : "Posts",
						icon: name === "pages" ? <FileText size={15} /> : <Newspaper size={15} />,
						items: entries.map((entry) => ({
							label: String(entry.data.title ?? entry.slug),
							href: hrefFor(collection, entry.slug),
							kind: name === "pages" ? "page" : "post",
						})),
						empty: `No ${name} available.`,
					});
				}
				groups.push({
					id: "language",
					label: "Language Switcher",
					icon: <Languages size={15} />,
					items: [],
					empty: "The theme renders language links automatically.",
				});
				groups.push({
					id: "custom",
					label: "Custom Links",
					icon: <LinkIcon size={15} />,
					items: [],
					custom: true,
				});
				groups.push({
					id: "categories",
					label: "Categories",
					icon: <Tag size={15} />,
					items: taxonomies.flatMap((taxonomy) =>
						taxonomy.terms.map((term) => ({
							label: term.name,
							href: `/${taxonomy.name}/${term.slug}`,
							kind: "category",
						})),
					),
					empty: "No taxonomy terms yet.",
				});
				if (!cancelled) {
					setSourceGroups(groups);
					setOpenGroup(groups[0]?.id);
				}
			} catch (error) {
				if (!cancelled) setSourceError((error as Error).message);
			} finally {
				if (!cancelled) setSourceLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const active = activeIndex >= 0 ? menus[activeIndex] : undefined;
	const activeItems = active?.items ?? [];
	const sourceKeys = useMemo(() => new Set(linksOf(activeItems).map((link) => link.href)), [activeItems]);

	const updateActive = (patch: Partial<Menu>) => {
		if (activeIndex < 0) return;
		setMenus((all) => all.map((menu, index) => (index === activeIndex ? { ...menu, ...patch } : menu)));
		setDirty(true);
	};

	const saveMenus = async (next = menus) => {
		try {
			const result = await saveData<Menu[]>("menus", next);
			setMenus(result);
			setSaved(result);
			setDirty(false);
			toast("Menus saved");
			return true;
		} catch (error) {
			toast((error as Error).message, "error");
			return false;
		}
	};

	const switchMenu = (next: number) => {
		if (next === activeIndex || next < 0 || next >= menus.length) return;
		if (dirty && !confirm("Discard unsaved menu changes?")) {
			setPicker(String(activeIndex));
			return;
		}
		setMenus(saved);
		setDirty(false);
		setActiveIndex(next);
		setPicker(String(next));
	};

	const assignLocation = (index: number | null, location: string) => {
		setMenus((all) =>
			all.map((menu, at) => {
				if (index !== null && at === index) return { ...menu, location };
				if (index === null ? menu.location === location : menu.location === location && at !== index)
					return { ...menu, location: "" };
				return menu;
			}),
		);
		setDirty(true);
	};

	const toggleChecked = (key: string) =>
		setChecked((current) => {
			const next = new Set(current);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});

	const addGroup = (group: SourceGroup) => {
		const additions = group.items.filter((item) => checked.has(sourceKey(group, item)));
		if (additions.length === 0) return;
		const existing = new Set(linksOf(activeItems).map((link) => link.href));
		const nextItems: MenuItem[] = [
			...activeItems,
			...additions
				.filter((item) => !existing.has(item.href))
				.map((item) => ({ label: item.label, href: item.href, kind: item.kind, children: [] })),
		];
		updateActive({ items: nextItems });
		setChecked((current) => {
			const next = new Set(current);
			for (const item of additions) next.delete(sourceKey(group, item));
			return next;
		});
	};

	const addCustom = () => {
		const label = custom.label.trim();
		const href = custom.href.trim();
		if (!label) {
			setCustomError("Enter a label.");
			return;
		}
		if (!((href.startsWith("/") && !href.startsWith("//")) || /^https?:\/\//i.test(href))) {
			setCustomError("Use a /path or an http(s) URL.");
			return;
		}
		setCustomError(null);
		updateActive({ items: [...activeItems, { label, href, kind: "custom", children: [] }] });
		setCustom({ label: "", href: "" });
	};

	const openCreate = () => {
		setForm({ label: "", name: "", location: "header", locale: "" });
		setKeyEdited(false);
		setCreateError(null);
		setCreateOpen(true);
	};

	const changeCreateLabel = (label: string) => {
		setForm((current) => ({ ...current, label, ...(keyEdited ? {} : { name: slugifyTitle(label) }) }));
		setCreateError(null);
	};

	const createMenu = async () => {
		const name = form.name.trim();
		const label = form.label.trim();
		const locale = form.locale.trim();
		if (!label) return setCreateError("Enter a menu name.");
		if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) return setCreateError("Key: lowercase letters, numbers and hyphens only.");
		if (menus.some((menu) => menu.name === name && (menu.locale ?? "") === locale))
			return setCreateError("A menu with this key and language already exists.");
		const next = [...menus, { name, label, location: form.location, ...(locale ? { locale } : {}), items: [] }];
		if (!(await saveMenus(next))) return;
		setActiveIndex(next.length - 1);
		setCreateOpen(false);
	};

	const deleteMenu = async () => {
		if (!active || !confirm(`Delete the "${active.label}" menu?`)) return;
		const next = menus.filter((_, index) => index !== activeIndex);
		if (!(await saveMenus(next))) return;
		setActiveIndex(Math.max(0, Math.min(activeIndex, next.length - 1)));
	};

	return (
		<div className="grid gap-4">
			<PageHeader
				title="Menus"
				description="Navigation groups rendered by the site theme. A language variant replaces the menu of the same key."
			/>
			<ErrorText>{dataError ?? sourceError}</ErrorText>
			<Tabs
				value={view}
				onChange={setView}
				items={[
					{ value: "edit", label: "Edit Menus" },
					{ value: "locations", label: "Manage Locations" },
				]}
			/>

			{loading && menus.length === 0 ? (
				<Spinner />
			) : menus.length === 0 ? (
				<EmptyState
					title="No menus yet"
					description="Create a menu, add links and assign it to a theme location."
					action={
						<Button onClick={openCreate}>
							<Plus size={14} /> Create a menu
						</Button>
					}
				/>
			) : view === "locations" ? (
				<Card>
					<div className="border-b border-border px-5 py-4">
						<h2 className="font-semibold">Manage locations</h2>
						<p className="text-sm text-muted-foreground">Choose which menu the theme renders in each location.</p>
					</div>
					<div className="grid gap-4 p-5 text-sm">
						{LOCATIONS.map((location) => {
							const assigned = menus.findIndex((menu) => menu.location === location.id);
							return (
								<div key={location.id} className="grid items-center gap-2 sm:grid-cols-[180px_1fr]">
									<span className="inline-flex items-center gap-2 text-muted-foreground">
										{location.icon} {location.label}
									</span>
									<Select
										aria-label={`Menu for ${location.label}`}
										value={assigned >= 0 ? String(assigned) : ""}
										onChange={(event) =>
											assignLocation(event.target.value === "" ? null : Number(event.target.value), location.id)
										}
									>
										<option value="">Not assigned</option>
										{menus.map((menu, index) => (
											<option key={`${menu.name}:${index}`} value={index}>
												{menu.label} ({menu.name}
												{menu.locale ? ` · ${menu.locale}` : ""})
											</option>
										))}
									</Select>
								</div>
							);
						})}
					</div>
					<div className="flex justify-end border-t border-border px-5 py-4">
						<Button onClick={() => void saveMenus()} disabled={!dirty}>
							<Save size={14} /> Save locations
						</Button>
					</div>
				</Card>
			) : (
				<>
					<div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4 text-sm">
						<span className="inline-flex items-center gap-2 text-muted-foreground">
							<MenuIcon size={15} /> Select a menu to edit
						</span>
						<Select
							aria-label="Select menu"
							className="w-full sm:w-64"
							value={picker}
							onChange={(event) => setPicker(event.target.value)}
						>
							{menus.map((menu, index) => (
								<option key={`${menu.name}:${index}`} value={index}>
									{menu.label} ({menu.name}
									{menu.locale ? ` · ${menu.locale}` : ""})
								</option>
							))}
						</Select>
						<Button variant="secondary" onClick={() => switchMenu(Number(picker))}>
							Select
						</Button>
						<span className="text-muted-foreground">
							or{" "}
							<button
								type="button"
								className="inline-flex items-center gap-1 text-primary hover:underline"
								onClick={openCreate}
							>
								<Plus size={14} /> create a new menu
							</button>
						</span>
					</div>

					<div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
						<section className="grid content-start gap-3">
							<h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Add menu items</h2>
							<div className="overflow-hidden rounded-2xl border border-border bg-card">
								{sourceLoading ? (
									<div className="p-4">
										<Spinner />
									</div>
								) : (
									<Accordion
										type="single"
										collapsible
										value={openGroup}
										onValueChange={(value) => setOpenGroup(value || undefined)}
									>
										{sourceGroups.map((group) => {
											const selected = group.items.filter((item) => checked.has(sourceKey(group, item))).length;
											return (
												<AccordionItem key={group.id} value={group.id}>
													<AccordionTrigger>
														<span className="inline-flex items-center gap-2">
															{group.icon} {group.label}
														</span>
													</AccordionTrigger>
													<AccordionContent>
														{group.custom ? (
															<div className="grid gap-2">
																<Input
																	aria-label="Custom link label"
																	placeholder="Label"
																	value={custom.label}
																	onChange={(event) => setCustom({ ...custom, label: event.target.value })}
																/>
																<Input
																	aria-label="Custom link URL"
																	placeholder="/path or https://…"
																	value={custom.href}
																	onChange={(event) => setCustom({ ...custom, href: event.target.value })}
																/>
																<Button size="sm" variant="secondary" onClick={addCustom}>
																	<Plus size={14} /> Add to menu
																</Button>
																{customError && <p className="text-xs text-destructive">{customError}</p>}
															</div>
														) : (
															<>
																{group.items.length > 0 ? (
																	<div className="grid max-h-64 gap-1 overflow-auto pe-1">
																		{group.items.map((item) => {
																			const key = sourceKey(group, item);
																			const exists = sourceKeys.has(item.href);
																			return (
																				<label
																					key={key}
																					className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/60"
																				>
																					<Checkbox
																						aria-label={`Add ${item.label}`}
																						checked={checked.has(key)}
																						disabled={exists}
																						onChange={() => toggleChecked(key)}
																					/>
																					<span className={exists ? "text-muted-foreground" : ""}>{item.label}</span>
																				</label>
																			);
																		})}
																	</div>
																) : (
																	<p className="text-sm text-muted-foreground">{group.empty ?? "No items."}</p>
																)}
																<Button
																	size="sm"
																	variant="secondary"
																	className="mt-3 w-full"
																	disabled={selected === 0}
																	onClick={() => addGroup(group)}
																>
																	<Plus size={14} /> Add to menu{selected > 0 ? ` (${selected})` : ""}
																</Button>
															</>
														)}
													</AccordionContent>
												</AccordionItem>
											);
										})}
									</Accordion>
								)}
							</div>
						</section>

						<section className="grid min-w-0 gap-3">
							<h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Menu structure</h2>
							{active ? (
								<div className="overflow-hidden rounded-2xl border border-border bg-card">
									<div className="flex flex-wrap items-center gap-3 border-b border-border p-5">
										<label htmlFor="menu-name" className="text-sm text-muted-foreground">
											Name
										</label>
										<Input
											id="menu-name"
											className="max-w-xs"
											value={active.label}
											onChange={(event) => updateActive({ label: event.target.value })}
										/>
										<span className="text-xs text-muted-foreground">
											Key: <code>{active.name}</code>
										</span>
									</div>
									<div className="p-5">
										<p className="mb-4 text-sm text-muted-foreground">
											Drag items into your preferred order. Open the arrow for link and nesting options.
										</p>
										<MenuItemsEditor
											items={activeItems as EditorMenuItem[]}
											onChange={(items) => updateActive({ items: items as MenuItem[] })}
										/>
									</div>
									<div className="grid items-center gap-3 border-t border-border p-5 text-sm sm:grid-cols-[180px_1fr]">
										<span className="text-muted-foreground">Display location</span>
										<Select
											aria-label="Display location"
											value={active.location}
											onChange={(event) => assignLocation(activeIndex, event.target.value)}
										>
											<option value="">Not assigned</option>
											{LOCATIONS.map((location) => (
												<option key={location.id} value={location.id}>
													{location.label}
												</option>
											))}
										</Select>
									</div>
									<div className="flex flex-wrap items-center justify-between gap-2 rounded-b-2xl bg-muted/35 px-5 py-4">
										<Button onClick={() => void saveMenus()} disabled={!dirty}>
											<Save size={14} /> Save menu
										</Button>
										<Button variant="ghost" className="text-destructive" onClick={() => void deleteMenu()}>
											<Trash2 size={14} /> Delete menu
										</Button>
									</div>
								</div>
							) : (
								<EmptyState title="Select a menu" description="Choose a menu above or create a new one." />
							)}
						</section>
					</div>
				</>
			)}

			{active && (
				<p className="text-xs text-muted-foreground">
					Location: {LOCATION_LABEL[active.location] ?? "Not assigned"}
					{active.locale ? ` · Language: ${active.locale}` : ""}
				</p>
			)}

			<Dialog
				open={createOpen}
				title="Create a menu"
				onClose={() => setCreateOpen(false)}
				footer={
					<>
						<Button variant="ghost" onClick={() => setCreateOpen(false)}>
							Cancel
						</Button>
						<Button onClick={() => void createMenu()}>
							<Plus size={14} /> Create menu
						</Button>
					</>
				}
			>
				<Input label="Menu name" value={form.label} onChange={(event) => changeCreateLabel(event.target.value)} />
				<Input
					label="Key"
					value={form.name}
					onChange={(event) => {
						setKeyEdited(true);
						setForm({ ...form, name: event.target.value });
						setCreateError(null);
					}}
					hint="Lowercase letters, numbers and hyphens. Generated from the name until you edit it."
				/>
				<Select
					label="Location"
					value={form.location}
					onChange={(event) => setForm({ ...form, location: event.target.value })}
				>
					{LOCATIONS.map((location) => (
						<option key={location.id} value={location.id}>
							{location.label}
						</option>
					))}
				</Select>
				<Input
					label="Language (optional)"
					value={form.locale}
					onChange={(event) => setForm({ ...form, locale: event.target.value })}
					hint="A language variant replaces the menu with the same key for that language."
				/>
				<ErrorText>{createError}</ErrorText>
			</Dialog>
		</div>
	);
}
