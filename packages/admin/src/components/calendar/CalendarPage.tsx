import { useStore } from "@nanostores/react";
import { Link } from "@tanstack/react-router";
import { atom } from "nanostores";
import { useEffect } from "react";
import { apiData } from "../../lib/api.ts";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorText, PageHeader } from "../../ui/index.tsx";

interface CalendarItem {
	collection: string;
	slug: string;
	title: string;
	status: "draft" | "scheduled" | "published";
	at: string;
}

const $items = atom<CalendarItem[]>([]);
const $error = atom<string | null>(null);
const $month = atom(new Date().toISOString().slice(0, 7));

async function load(month: string): Promise<void> {
	const [y, m] = month.split("-").map(Number);
	const from = new Date(Date.UTC(y!, m! - 1, 1)).toISOString();
	const to = new Date(Date.UTC(y!, m!, 1)).toISOString();
	try {
		$error.set(null);
		$items.set(await apiData<CalendarItem[]>("GET", `/api/calendar?from=${from}&to=${to}`));
	} catch (e) {
		$error.set((e as Error).message);
	}
}

const tone = { draft: "warning", scheduled: "accent", published: "success" } as const;

export function CalendarPage() {
	const items = useStore($items);
	const error = useStore($error);
	const month = useStore($month);
	useEffect(() => void load(month), [month]);

	const [year, monthNumber] = month.split("-").map(Number);
	const first = new Date(Date.UTC(year!, monthNumber! - 1, 1));
	const days = new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();
	const offset = (first.getUTCDay() + 6) % 7;
	const cells = [
		...Array.from({ length: offset }, () => null),
		...Array.from({ length: days }, (_, i) => i + 1),
	];
	const byDay = new Map<number, CalendarItem[]>();
	for (const item of items) {
		const day = new Date(item.at).getUTCDate();
		byDay.set(day, [...(byDay.get(day) ?? []), item]);
	}

	const shift = (delta: number) => {
		const d = new Date(Date.UTC(year!, monthNumber! - 1 + delta, 1));
		$month.set(d.toISOString().slice(0, 7));
	};

	return (
		<div className="grid gap-4">
			<PageHeader
				title="Calendar"
				description="Scheduled and published entries by date."
				actions={
					<>
						<Button variant="secondary" onClick={() => shift(-1)}>
							←
						</Button>
						<Button variant="secondary" onClick={() => $month.set(new Date().toISOString().slice(0, 7))}>
							Today
						</Button>
						<Button variant="secondary" onClick={() => shift(1)}>
							→
						</Button>
					</>
				}
			/>
			<ErrorText>{error}</ErrorText>
			<Card>
				<CardHeader title={first.toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" })} />
				<div className="grid grid-cols-7 gap-px bg-border p-px text-xs">
					{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
						<div key={d} className="bg-card p-2 font-medium text-muted-foreground">
							{d}
						</div>
					))}
					{cells.map((day, i) => (
						<div key={i} className="min-h-24 bg-card p-1.5">
							{day && (
								<>
									<div className="mb-1 text-xs text-muted-foreground">{day}</div>
									<div className="grid gap-1">
										{(byDay.get(day) ?? []).map((item) => (
											<Link
												key={`${item.collection}:${item.slug}`}
												to="/e/$collection/$"
												params={{ collection: item.collection, _splat: item.slug }}
												className="block truncate rounded-ui border border-border px-1.5 py-1 text-xs hover:bg-secondary"
											>
												<Badge tone={tone[item.status]}>{item.status}</Badge>
												<span className="ms-1">{item.title}</span>
											</Link>
										))}
									</div>
								</>
							)}
						</div>
					))}
				</div>
			</Card>
			{items.length === 0 && <EmptyState title="Nothing scheduled" description="Entries with a date or publishAt appear here." />}
		</div>
	);
}
