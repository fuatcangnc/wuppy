import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarPage } from "../src/components/calendar/CalendarPage.tsx";
import { addDays, dayIn, daysBetween, shiftInstant, visibleDays, weekStart } from "../src/components/calendar/dates.ts";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		params,
		...rest
	}: { children: ReactNode; params?: { _splat?: string } } & Record<string, unknown>) => (
		<a
			href={`/e/${params?.["_splat"]}`}
			draggable={rest.draggable as boolean}
			onDragStart={rest.onDragStart as never}
			onDragEnd={rest.onDragEnd as never}
		>
			{children}
		</a>
	),
	useNavigate: () => navigate,
}));

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("date helpers", () => {
	it("does calendar arithmetic on labels", () => {
		expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
		expect(daysBetween("2026-05-10", "2026-05-13")).toBe(3);
		expect(weekStart("2026-05-13")).toBe("2026-05-11"); // Wednesday -> Monday
		expect(weekStart("2026-05-17")).toBe("2026-05-11"); // Sunday belongs to the week before
		expect(shiftInstant("2026-05-10T09:30:00.000Z", 2)).toBe("2026-05-12T09:30:00.000Z");
	});
	it("shows whole weeks for a month and seven days for a week", () => {
		const month = visibleDays("month", "2026-05-13");
		expect(month[0]).toBe("2026-04-27");
		expect(month.at(-1)).toBe("2026-05-31");
		expect(month.length % 7).toBe(0);
		expect(visibleDays("week", "2026-05-13")).toHaveLength(7);
	});
	it("puts an instant on the right day for the time zone", () => {
		expect(dayIn("2026-05-10T23:30:00.000Z", "UTC")).toBe("2026-05-10");
		expect(dayIn("2026-05-10T23:30:00.000Z", "Europe/Istanbul")).toBe("2026-05-11");
		expect(dayIn("2026-05-10T23:30:00.000Z", "Not/AZone")).toBe("2026-05-10");
	});
});

const setup = (items: unknown[], timezone = "UTC") => {
	const calls: Array<{ method: string; url: string; body?: unknown }> = [];
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-05-13T12:00:00Z"));
	vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
		const method = init.method ?? "GET";
		calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
		const data = url.startsWith("/api/calendar")
			? items
			: url.includes("settings")
				? { timezone }
				: url.includes("collections")
					? [{ name: "posts", dir: "p", format: "md", fields: { title: "string", date: "date" } }]
					: [];
		return new Response(JSON.stringify({ data }));
	});
	return calls;
};

const item = (over: object = {}) => ({
	collection: "posts",
	slug: "hello",
	title: "Hello",
	status: "published",
	at: "2026-05-10T09:00:00.000Z",
	...over,
});

describe("CalendarPage", () => {
	it("shows entries on their day in the site's time zone with a status badge", async () => {
		setup([item({ at: "2026-05-10T23:30:00.000Z", status: "scheduled" })], "Europe/Istanbul");
		render(<CalendarPage />);
		const cell = (await screen.findByRole("button", { name: /May 11, 2026, 1 entries/ })).closest(
			'[role="gridcell"]',
		) as HTMLElement;
		expect(within(cell).getByText("Hello")).toBeInTheDocument();
		expect(within(cell).getByText("scheduled")).toBeInTheDocument();
	});

	it("switches to a week view and shows an empty state", async () => {
		setup([]);
		render(<CalendarPage />);
		expect(await screen.findByText("Nothing this month")).toBeInTheDocument();
		await userEvent.setup().click(screen.getByRole("button", { name: "Week" }));
		expect(await screen.findByText("Nothing this week")).toBeInTheDocument();
		expect(screen.getAllByRole("gridcell")).toHaveLength(7);
	});

	it("moves an entry by dropping it on another day", async () => {
		const calls = setup([item()]);
		render(<CalendarPage />);
		const link = await screen.findByText("Hello");
		const target = screen.getByRole("button", { name: /May 12, 2026/ }).closest('[role="gridcell"]') as HTMLElement;
		fireEvent.dragStart(link.closest("a")!);
		fireEvent.dragOver(target);
		fireEvent.drop(target);
		await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
		const patch = calls.find((c) => c.method === "PATCH")!;
		expect(patch.url).toBe("/api/calendar/posts/hello");
		expect(patch.body).toEqual({ at: "2026-05-12T09:00:00.000Z" });
	});

	it("offers a keyboard way to move an entry and to create one on the selected day", async () => {
		const calls = setup([item()]);
		render(<CalendarPage />);
		const user = userEvent.setup();
		await user.click(await screen.findByRole("button", { name: /May 10, 2026, 1 entries/ }));
		fireEvent.change(screen.getByLabelText("Move entries here to"), { target: { value: "2026-05-14" } });
		await user.click(screen.getByRole("button", { name: /Move “Hello” to 2026-05-14/ }));
		await waitFor(() =>
			expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ at: "2026-05-14T09:00:00.000Z" }),
		);

		await user.type(screen.getByLabelText("Title"), "Fresh post");
		await user.click(screen.getByRole("button", { name: "Create" }));
		expect(navigate).toHaveBeenCalledWith({
			to: "/e/$collection/$",
			params: { collection: "posts", _splat: "fresh-post" },
		});
	});
});
