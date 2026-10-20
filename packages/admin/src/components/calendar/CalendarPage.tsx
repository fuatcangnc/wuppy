import { useStore } from "@nanostores/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiData } from "../../lib/api.ts";
import { slugifyTitle } from "../../lib/slug.ts";
import { $collections, loadCollections } from "../../stores/content.ts";
import { newEntry } from "../../stores/editor.ts";
import {
	Badge,
	Button,
	Card,
	CardHeader,
	EmptyState,
	ErrorText,
	Input,
	PageHeader,
	Select,
	toast,
} from "../../ui/index.tsx";
import { addDays, dayIn, daysBetween, shiftInstant, visibleDays } from "./dates.ts";

export interface CalendarItem {
	collection: string;
	slug: string;
	title: string;
	status: "draft" | "scheduled" | "published";
	at: string;
}

const today = () => new Date().toISOString().slice(0, 10);

const tone = { draft: "warning", scheduled: "accent", published: "success" } as const;
const edge = {
	draft: "border-s-amber-500",
	scheduled: "border-s-blue-500",
	published: "border-s-emerald-500",
} as const;

/** One day of slack on each side, so entries near midnight in the site's time zone are not cut off. */
const loadItems = (days: string[]) =>
	apiData<CalendarItem[]>(
		"GET",
		`/api/calendar?from=${new Date(`${addDays(days[0]!, -1)}T00:00:00Z`).toISOString()}&to=${new Date(`${addDays(days.at(-1)!, 2)}T00:00:00Z`).toISOString()}`,
	);

const label = (d: string) =>
	new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

export function CalendarPage() {
	const [items, setItems] = useState<CalendarItem[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [view, setView] = useState<"month" | "week">("month");
	const [anchor, setAnchor] = useState(today);
	const collections = useStore($collections);
	const navigate = useNavigate();
	const [timeZone, setTimeZone] = useState("UTC");
	const [selected, setSelected] = useState<string | null>(null);
	const [dragging, setDragging] = useState<CalendarItem | null>(null);
	const [moveTo, setMoveTo] = useState("");
	const [newTitle, setNewTitle] = useState("");
	const [newCollection, setNewCollection] = useState("");

	const days = visibleDays(view, anchor);
	const load = () =>
		loadItems(days).then(
			(rows) => (setItems(rows), setError(null)),
			(e: Error) => setError(e.message),
		);
	useEffect(() => void load(), [view, anchor]);
	useEffect(() => {
		void loadCollections();
		void apiData<{ timezone?: string }>("GET", "/api/data/settings")
			.then((s) => setTimeZone(s.timezone || "UTC"))
			.catch(() => undefined);
	}, []);

	const byDay = new Map<string, CalendarItem[]>();
	for (const item of items) {
		const key = dayIn(item.at, timeZone);
		byDay.set(key, [...(byDay.get(key) ?? []), item]);
	}
	const visible = days.flatMap((d) => byDay.get(d) ?? []);
	const heading = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(
		new Date(`${view === "week" ? days[0] : anchor.slice(0, 7) + "-01"}T00:00:00Z`),
	);
	const weekdays = days
		.slice(0, 7)
		.map((d) =>
			new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`)),
		);

	const shift = (delta: number) => {
		if (view === "week") return setAnchor(addDays(anchor, delta * 7));
		const d = new Date(`${anchor.slice(0, 7)}-01T00:00:00Z`);
		d.setUTCMonth(d.getUTCMonth() + delta);
		setAnchor(d.toISOString().slice(0, 10));
	};

	const moveItem = async (item: CalendarItem, to: string) => {
		const delta = daysBetween(dayIn(item.at, timeZone), to);
		if (delta === 0) return;
		try {
			await apiData(
				"PATCH",
				`/api/calendar/${item.collection}/${item.slug.split("/").map(encodeURIComponent).join("/")}`,
				{
					at: shiftInstant(item.at, delta),
				},
			);
			toast(`Moved "${item.title}" to ${to}`);
			await load();
		} catch (e) {
			toast((e as Error).message, "error");
		}
	};

	const createOn = (day: string) => {
		const collection = newCollection || collections[0]?.name;
		const slug = slugifyTitle(newTitle);
		if (!collection || !slug) return toast("Pick a collection and enter a title", "error");
		const hasDate = collections.find((c) => c.name === collection)?.fields.date !== undefined;
		newEntry(collection, slug, { title: newTitle.trim(), ...(hasDate ? { date: `${day}T09:00:00.000Z` } : {}) });
		void navigate({ to: "/e/$collection/$", params: { collection, _splat: slug } });
	};

	const dayItems = selected ? (byDay.get(selected) ?? []) : [];

	return (
		<div className="grid gap-4">
			<PageHeader
				title="Calendar"
				description={`Scheduled and published entries by date (${timeZone}).`}
				actions={
					<>
						<Button variant={view === "month" ? "default" : "secondary"} onClick={() => setView("month")}>
							Month
						</Button>
						<Button variant={view === "week" ? "default" : "secondary"} onClick={() => setView("week")}>
							Week
						</Button>
						<Button variant="secondary" aria-label="Previous" onClick={() => shift(-1)}>
							←
						</Button>
						<Button variant="secondary" onClick={() => setAnchor(today())}>
							Today
						</Button>
						<Button variant="secondary" aria-label="Next" onClick={() => shift(1)}>
							→
						</Button>
					</>
				}
			/>
			<ErrorText>{error}</ErrorText>
			<Card>
				<CardHeader title={heading} />
				<div role="grid" aria-label={heading} className="grid grid-cols-7 gap-px bg-border p-px text-xs">
					{weekdays.map((d) => (
						<div key={d} role="columnheader" className="bg-card p-2 font-medium text-muted-foreground">
							{d}
						</div>
					))}
					{days.map((day) => {
						const list = byDay.get(day) ?? [];
						const outside = view === "month" && day.slice(0, 7) !== anchor.slice(0, 7);
						return (
							<div
								key={day}
								role="gridcell"
								aria-selected={selected === day}
								className={`min-h-24 bg-card p-1.5 ${outside ? "opacity-50" : ""} ${dragging ? "outline-dashed outline-1 outline-border" : ""}`}
								onDragOver={(e) => dragging && e.preventDefault()}
								onDrop={(e) => {
									e.preventDefault();
									if (dragging) void moveItem(dragging, day);
									setDragging(null);
								}}
							>
								<button
									type="button"
									aria-label={`${label(day)}, ${list.length} entries`}
									className="mb-1 rounded px-1 text-xs text-muted-foreground hover:bg-secondary focus-visible:outline"
									onClick={() => {
										setSelected(day);
										setMoveTo(day);
									}}
								>
									{Number(day.slice(8))}
								</button>
								<div className="grid gap-1">
									{list.map((item) => (
										<Link
											key={`${item.collection}:${item.slug}`}
											to="/e/$collection/$"
											params={{ collection: item.collection, _splat: item.slug }}
											draggable
											onDragStart={() => setDragging(item)}
											onDragEnd={() => setDragging(null)}
											className={`block truncate rounded-ui border border-s-4 border-border px-1.5 py-1 text-xs hover:bg-secondary ${edge[item.status]}`}
										>
											<Badge tone={tone[item.status]}>{item.status}</Badge>
											<span className="ms-1">{item.title}</span>
										</Link>
									))}
								</div>
							</div>
						);
					})}
				</div>
			</Card>
			{visible.length === 0 && (
				<EmptyState
					title={view === "week" ? "Nothing this week" : "Nothing this month"}
					description="Entries with a date or publishAt appear here."
				/>
			)}
			{selected && (
				<Card>
					<CardHeader title={label(selected)} description={`${dayItems.length} entries`} />
					<div className="grid gap-3 p-4 text-sm">
						{dayItems.map((item) => (
							<div key={`${item.collection}:${item.slug}`} className="flex flex-wrap items-center gap-2">
								<Badge tone={tone[item.status]}>{item.status}</Badge>
								<Link
									to="/e/$collection/$"
									params={{ collection: item.collection, _splat: item.slug }}
									className="underline"
								>
									{item.title}
								</Link>
								<span className="text-muted-foreground">{item.collection}</span>
							</div>
						))}
						{dayItems.length > 0 && (
							<div className="flex items-end gap-2">
								<Input
									label="Move entries here to"
									type="date"
									value={moveTo}
									onChange={(e) => setMoveTo(e.target.value)}
								/>
								<span className="text-xs text-muted-foreground">Pick an entry below, then a date.</span>
							</div>
						)}
						{dayItems.map((item) => (
							<Button
								key={`move:${item.collection}:${item.slug}`}
								size="sm"
								variant="ghost"
								disabled={!moveTo || moveTo === selected}
								onClick={() => void moveItem(item, moveTo)}
							>
								Move “{item.title}” to {moveTo || "…"}
							</Button>
						))}
						<div className="flex flex-wrap items-end gap-2 border-t pt-3">
							<Select
								label="New entry in"
								value={newCollection || collections[0]?.name || ""}
								onChange={(e) => setNewCollection(e.target.value)}
							>
								{collections.map((c) => (
									<option key={c.name} value={c.name}>
										{c.name}
									</option>
								))}
							</Select>
							<Input label="Title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
							<Button onClick={() => createOn(selected)}>Create</Button>
						</div>
					</div>
				</Card>
			)}
		</div>
	);
}
