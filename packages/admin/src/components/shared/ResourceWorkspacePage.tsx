import { FileText, Plus, Search, Trash2 } from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { $data, $dataErrors, loadData, saveData } from "../../stores/dashboard.ts";
import { Button, Checkbox, EmptyState, ErrorText, Input, Textarea, toast } from "../../ui/index.tsx";
import { WorkspaceLayout, WorkspacePanel, WorkspaceSidebar } from "../shared/WorkspaceLayout.tsx";

export interface ResourceField {
	key: string;
	label: string;
	type?: "text" | "textarea" | "number" | "checkbox" | "json" | "custom";
	/** For `type: "custom"`: renders the editor for this field's value. */
	render?: (value: unknown, onChange: (value: unknown) => void) => ReactNode;
}

export interface ResourceWorkspacePageProps<T extends Record<string, unknown>> {
	name: string;
	title: string;
	description?: string;
	itemLabel: string;
	template: T;
	fields: ResourceField[];
	columns: Array<{ key: keyof T & string; label: string }>;
	format?: (item: T) => string;
	deleteNote?: (item: T) => string | undefined;
	extraColumn?: { label: string; value: (item: T) => string };
	icon?: ReactNode;
	notice?: ReactNode;
}

function readField(item: Record<string, unknown>, key: string): unknown {
	return key.split(".").reduce<unknown>((value, part) => {
		if (value && typeof value === "object") return (value as Record<string, unknown>)[part];
		return undefined;
	}, item);
}

function writeField(item: Record<string, unknown>, key: string, value: unknown): Record<string, unknown> {
	const [head, ...rest] = key.split(".");
	if (!head) return item;
	if (rest.length === 0) return { ...item, [head]: value };
	return { ...item, [head]: writeField((item[head] as Record<string, unknown>) ?? {}, rest.join("."), value) };
}

const textOf = (value: unknown) =>
	typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "");

export function ResourceWorkspacePage<T extends Record<string, unknown>>({
	name,
	title,
	description,
	itemLabel,
	template,
	fields,
	columns,
	format,
	deleteNote,
	extraColumn,
	icon,
	notice,
}: ResourceWorkspacePageProps<T>) {
	const stored = useStore($data)[name] as T[] | undefined;
	const error = useStore($dataErrors)[name];
	const [items, setItems] = useState<T[]>([]);
	const [selected, setSelected] = useState<number | null>(null);
	const [editing, setEditing] = useState<T | null>(null);
	const [creating, setCreating] = useState(false);
	const [query, setQuery] = useState("");
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		void loadData<T[]>(name).catch(() => undefined);
	}, [name]);
	useEffect(() => {
		if (Array.isArray(stored)) setItems(stored);
	}, [stored]);

	const dirty =
		editing !== null && (creating || selected === null || JSON.stringify(editing) !== JSON.stringify(items[selected]));
	const titleFor = (item: T) => format?.(item) || textOf(readField(item, columns[0]?.key ?? "")) || `New ${itemLabel}`;
	const editingTitle = editing ? titleFor(editing) : title;
	const filtered = useMemo(
		() =>
			items
				.map((item, index) => ({ item, index }))
				.filter(({ item }) => !query.trim() || JSON.stringify(item).toLowerCase().includes(query.trim().toLowerCase())),
		[items, query],
	);

	const save = async (next: T[], nextIndex: number | null) => {
		setSaving(true);
		try {
			const saved = await saveData(name, next);
			setItems(saved);
			toast(`${title} saved`);
			if (nextIndex !== null && saved[nextIndex]) {
				setSelected(nextIndex);
				setEditing(structuredClone(saved[nextIndex]!));
				setCreating(false);
			} else {
				setSelected(null);
				setEditing(null);
				setCreating(false);
			}
		} catch (failure) {
			toast((failure as Error).message, "error");
		} finally {
			setSaving(false);
		}
	};

	const choose = (index: number) => {
		if (dirty && !confirm("Discard unsaved changes?")) return;
		setSelected(index);
		setEditing(structuredClone(items[index]!));
		setCreating(false);
	};
	const startNew = () => {
		if (dirty && !confirm("Discard unsaved changes?")) return;
		setSelected(null);
		setEditing(structuredClone(template));
		setCreating(true);
	};
	const saveEditing = () => {
		if (!editing) return;
		const next = creating ? [...items, editing] : items.map((item, index) => (index === selected ? editing : item));
		void save(next, creating ? items.length : selected);
	};
	const removeEditing = () => {
		if (selected === null) return;
		const item = items[selected];
		if (!item) return;
		if (!confirm([`Delete this ${itemLabel}?`, deleteNote?.(item)].filter(Boolean).join("\n\n"))) return;
		void save(
			items.filter((_, index) => index !== selected),
			null,
		);
	};

	const list = (
		<WorkspaceSidebar>
			<div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
				<div className="grid gap-0.5">
					<h1 className="text-base font-semibold">{title}</h1>
					<p className="text-[11px] text-muted-foreground">{description}</p>
				</div>
				<Button
					variant="secondary"
					size="icon-sm"
					style={{ borderRadius: "200px" }}
					className="border-border bg-white text-[#101011] shadow-sm hover:bg-zinc-200!"
					aria-label={`Create ${itemLabel}`}
					title={`Create ${itemLabel}`}
					onClick={startNew}
				>
					<Plus size="1em" />
				</Button>
			</div>
			{notice && <div className="border-b border-border p-3">{notice}</div>}
			<div className="border-b border-border">
				<div className="relative">
					<Search
						size="1em"
						className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-muted-foreground"
					/>
					<Input
						aria-label={`Search ${title.toLowerCase()}`}
						className="h-12 rounded-none border-transparent bg-transparent pr-4 pl-11 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder={`Search ${title.toLowerCase()}...`}
					/>
				</div>
			</div>
			<div className="flex items-center justify-between border-b border-border px-3 py-2 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
				<span>
					{filtered.length} {filtered.length === 1 ? "item" : "items"}
				</span>
				{selected !== null && (
					<span>
						{selected + 1} / {items.length}
					</span>
				)}
			</div>
			<div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
				{filtered.length === 0 ? (
					<EmptyState
						title={items.length === 0 ? `No ${itemLabel} yet` : "No matches"}
						description={items.length === 0 ? `Create the first ${itemLabel}.` : "Try a different search."}
						action={<Button onClick={startNew}>+ New {itemLabel}</Button>}
					/>
				) : (
					<div className="grid gap-1">
						{filtered.map(({ item, index }) => (
							<button
								key={index}
								type="button"
								aria-label={`Open ${titleFor(item)}`}
								aria-current={selected === index ? "true" : undefined}
								onClick={() => choose(index)}
								className={`flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors ${
									selected === index
										? "border-primary/60 bg-tab text-foreground"
										: "border-transparent text-muted-foreground hover:bg-muted/60"
								}`}
							>
								<span className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
									{icon ?? <FileText size="1em" />}
								</span>
								<span className="min-w-0 flex-1">
									<span className="block truncate text-sm font-medium text-foreground">{titleFor(item)}</span>
									<span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
										<span className="truncate">{textOf(readField(item, columns[1]?.key ?? "")) || itemLabel}</span>
										{extraColumn && (
											<>
												<span aria-hidden="true">·</span>
												<span className="shrink-0">{extraColumn.value(item)}</span>
											</>
										)}
									</span>
								</span>
							</button>
						))}
					</div>
				)}
			</div>
			<ErrorText>{error}</ErrorText>
		</WorkspaceSidebar>
	);

	const detail = editing ? (
		<>
			<header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
				<div className="grid min-w-0 gap-1">
					<h2 className="truncate text-xl font-semibold">{editingTitle}</h2>
					<p className="text-xs text-muted-foreground">
						{creating ? `New ${itemLabel}` : `${title} / ${itemLabel}`}
						{extraColumn ? ` · ${extraColumn.value(editing)}` : ""}
					</p>
				</div>
				<div className="flex items-center gap-1">
					{saving && (
						<span className="text-xs text-muted-foreground" role="status">
							Saving…
						</span>
					)}
					{!creating && (
						<Button variant="ghost" size="sm" className="text-destructive" onClick={removeEditing}>
							<Trash2 size={14} /> Delete
						</Button>
					)}
					<Button size="sm" disabled={!dirty || saving} onClick={saveEditing}>
						Save
					</Button>
				</div>
			</header>
			<div className="custom-scrollbar min-h-0 overflow-y-auto">
				<div className="grid gap-4 p-5">
					{fields.map((field) => {
						const value = readField(editing, field.key);
						if (field.type === "custom" && field.render) {
							return (
								<div key={field.key} className="grid gap-1.5">
									<span className="text-sm font-medium">{field.label}</span>
									{field.render(value, (next) => setEditing(writeField(editing, field.key, next) as T))}
								</div>
							);
						}
						if (field.type === "checkbox") {
							return (
								<Checkbox
									key={field.key}
									label={field.label}
									checked={value === true}
									onChange={(event) => setEditing(writeField(editing, field.key, event.target.checked) as T)}
								/>
							);
						}
						if (field.type === "json" || field.type === "textarea") {
							return (
								<Textarea
									key={field.key}
									label={field.label}
									value={
										field.type === "json"
											? JSON.stringify(value ?? (field.key.endsWith("s") ? [] : {}), null, 2)
											: String(value ?? "")
									}
									onChange={(event) => {
										if (field.type === "json") {
											try {
												setEditing(writeField(editing, field.key, JSON.parse(event.target.value)) as T);
											} catch {
												/* keep the last valid value while typing */
											}
										} else {
											setEditing(writeField(editing, field.key, event.target.value) as T);
										}
									}}
								/>
							);
						}
						return (
							<Input
								key={field.key}
								label={field.label}
								type={field.type === "number" ? "number" : "text"}
								value={value === undefined || value === null ? "" : String(value)}
								onChange={(event) =>
									setEditing(
										writeField(
											editing,
											field.key,
											field.type === "number" ? Number(event.target.value) : event.target.value,
										) as T,
									)
								}
							/>
						);
					})}
				</div>
			</div>
		</>
	) : (
		<div className="grid min-h-[520px] place-items-center p-6">
			<div className="grid max-w-sm justify-items-center gap-2 text-center">
				<span className="grid size-16 place-items-center rounded-full bg-secondary text-muted-foreground">
					{icon ?? <FileText size={24} />}
				</span>
				<p className="font-medium">{title}</p>
				<p className="text-sm text-muted-foreground">Select a {itemLabel} from the list to edit it.</p>
				<Button variant="secondary" size="sm" onClick={startNew}>
					<Plus size={14} /> New {itemLabel}
				</Button>
			</div>
		</div>
	);

	return (
		<WorkspaceLayout sidebarWidth={340}>
			{list}
			<WorkspacePanel className="grid-rows-[auto_minmax(0,1fr)]">{detail}</WorkspacePanel>
		</WorkspaceLayout>
	);
}
