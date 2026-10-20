import { useStore } from "@nanostores/react";
import { useEffect, useState } from "react";
import { $data, $dataErrors, loadData, saveData } from "../../stores/dashboard.ts";
import {
	Button,
	Card,
	Checkbox,
	Dialog,
	EmptyState,
	ErrorText,
	Input,
	PageHeader,
	Table,
	Td,
	Textarea,
	Th,
	toast,
} from "../../ui/index.tsx";

export interface ResourceField {
	key: string;
	label: string;
	type?: "text" | "textarea" | "number" | "checkbox" | "json";
}

export interface ResourcePageProps<T extends Record<string, unknown>> {
	name: string;
	title: string;
	description?: string;
	itemLabel: string;
	template: T;
	fields: ResourceField[];
	columns: Array<{ key: keyof T & string; label: string }>;
	/** Optional custom summary for nested JSON values. */
	format?: (item: T) => string;
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

export function ResourcePage<T extends Record<string, unknown>>({
	name,
	title,
	description,
	itemLabel,
	template,
	fields,
	columns,
	format,
}: ResourcePageProps<T>) {
	const stored = useStore($data)[name] as T[] | undefined;
	const error = useStore($dataErrors)[name];
	const [items, setItems] = useState<T[]>([]);
	const [editing, setEditing] = useState<T | null>(null);
	const [index, setIndex] = useState<number | null>(null);
	const [open, setOpen] = useState(false);

	useEffect(() => {
		void loadData<T[]>(name).catch(() => undefined);
	}, [name]);
	useEffect(() => {
		if (Array.isArray(stored)) setItems(stored);
	}, [stored]);

	const save = async (next: T[]) => {
		try {
			setItems(await saveData(name, next));
			toast(`${title} saved`);
		} catch (e) {
			toast((e as Error).message, "error");
		}
	};

	const startNew = () => {
		setEditing(structuredClone(template));
		setIndex(null);
		setOpen(true);
	};
	const startEdit = (item: T, i: number) => {
		setEditing(structuredClone(item));
		setIndex(i);
		setOpen(true);
	};

	return (
		<div className="grid gap-4">
			<PageHeader
				title={title}
				description={description}
				actions={<Button onClick={startNew}>+ New {itemLabel}</Button>}
			/>
			<ErrorText>{error}</ErrorText>
			<Card>
				{items.length === 0 ? (
					<div className="p-4">
						<EmptyState title={`No ${itemLabel} yet`} action={<Button onClick={startNew}>+ New {itemLabel}</Button>} />
					</div>
				) : (
					<Table>
						<thead>
							<tr>
								{columns.map((c) => (
									<Th key={c.key}>{c.label}</Th>
								))}
								<Th />
							</tr>
						</thead>
						<tbody>
							{items.map((item, i) => (
								<tr key={i} className="hover:bg-secondary">
									{columns.map((c) => (
										<Td key={c.key}>
											{format && c.key === columns[0]?.key
												? format(item)
												: typeof readField(item, c.key) === "object"
													? JSON.stringify(readField(item, c.key))
													: String(readField(item, c.key) ?? "")}
										</Td>
									))}
									<Td className="whitespace-nowrap text-end">
										<Button size="sm" variant="ghost" onClick={() => startEdit(item, i)}>
											Edit
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => {
												if (confirm(`Delete this ${itemLabel}?`))
													void save(items.filter((_, itemIndex) => itemIndex !== i));
											}}
										>
											Delete
										</Button>
									</Td>
								</tr>
							))}
						</tbody>
					</Table>
				)}
			</Card>

			<Dialog
				open={open}
				title={index === null ? `New ${itemLabel}` : `Edit ${itemLabel}`}
				onClose={() => setOpen(false)}
				footer={
					<>
						<Button variant="ghost" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button
							disabled={!editing}
							onClick={() => {
								if (!editing) return;
								const next = index === null ? [...items, editing] : items.map((x, i) => (i === index ? editing : x));
								void save(next).then(() => setOpen(false));
							}}
						>
							Save
						</Button>
					</>
				}
			>
				{editing && (
					<div className="grid gap-3">
						{fields.map((field) => {
							const value = readField(editing, field.key);
							if (field.type === "checkbox") {
								return (
									<Checkbox
										key={field.key}
										label={field.label}
										checked={value === true}
										onChange={(e) => setEditing(writeField(editing, field.key, e.target.checked) as T)}
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
										onChange={(e) => {
											if (field.type === "json") {
												try {
													setEditing(writeField(editing, field.key, JSON.parse(e.target.value)) as T);
												} catch {
													/* keep the last valid value while typing */
												}
											} else {
												setEditing(writeField(editing, field.key, e.target.value) as T);
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
									onChange={(e) =>
										setEditing(
											writeField(
												editing,
												field.key,
												field.type === "number" ? Number(e.target.value) : e.target.value,
											) as T,
										)
									}
								/>
							);
						})}
					</div>
				)}
			</Dialog>
		</div>
	);
}
