/** Calendar date math on plain `YYYY-MM-DD` labels; time zones only matter when an instant becomes a label. */

const DAY = 86_400_000;
const utc = (label: string) => {
	const [y, m, d] = label.split("-").map(Number);
	return Date.UTC(y!, m! - 1, d!);
};
const label = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (day: string, n: number) => label(utc(day) + n * DAY);
export const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / DAY);

/** The day (`YYYY-MM-DD`) an instant falls on in `timeZone`; an unknown zone falls back to UTC. */
export function dayIn(iso: string, timeZone: string): string {
	try {
		return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
			new Date(iso),
		);
	} catch {
		return iso.slice(0, 10);
	}
}

/** Monday of the week containing `day`. */
export const weekStart = (day: string) => addDays(day, -((new Date(utc(day)).getUTCDay() + 6) % 7));

/** Days to show: the whole weeks covering the month (`month`) or the single week of `day` (`week`). Weeks start on Monday. */
export function visibleDays(view: "month" | "week", day: string): string[] {
	if (view === "week") return Array.from({ length: 7 }, (_, i) => addDays(weekStart(day), i));
	const first = `${day.slice(0, 7)}-01`;
	const next = new Date(utc(first));
	next.setUTCMonth(next.getUTCMonth() + 1);
	const last = addDays(label(next.getTime()), -1);
	const start = weekStart(first);
	return Array.from({ length: daysBetween(start, addDays(weekStart(last), 6)) + 1 }, (_, i) => addDays(start, i));
}

/** Moves an instant by whole days; the time of day is kept in UTC. */
export const shiftInstant = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * DAY).toISOString();
