import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntriesPage, listQuery } from "../src/components/content/EntriesPage.tsx";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, params }: { children: ReactNode; params?: { _splat?: string } }) => (
		<a href={`/e/${params?.["_splat"]}`}>{children}</a>
	),
	useNavigate: () => navigate,
	useParams: () => ({ collection: "posts" }),
}));

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	navigate.mockReset();
});

const entry = (slug: string, over: object = {}) => ({
	slug,
	data: { title: `Title ${slug}`, author: "ada" },
	body: "",
	modified: "2026-05-01T00:00:00Z",
	status: "published",
	...over,
});

function server(pages: Record<string, unknown>) {
	const urls: string[] = [];
	vi.stubGlobal("fetch", async (url: string) => {
		urls.push(url);
		if (url.startsWith("/api/content/posts?")) {
			const cursor = new URL(url, "http://x").searchParams.get("cursor") ?? "";
			return new Response(JSON.stringify(pages[cursor]));
		}
		if (url.includes("/api/content/posts/taken")) return new Response(JSON.stringify({ data: entry("taken") }));
		if (url.includes("/api/content/posts/"))
			return new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "x" } }), { status: 404 });
		if (url.endsWith("/api/data/bylines"))
			return new Response(JSON.stringify({ data: [{ slug: "ada", name: "Ada" }] }));
		if (url.startsWith("/api/i18n/")) return new Response(JSON.stringify({ data: [], locales: ["en", "tr"] }));
		if (url === "/api/collections")
			return new Response(
				JSON.stringify({ data: [{ name: "posts", dir: "content/posts", format: "md", fields: { title: "string" } }] }),
			);
		return new Response(JSON.stringify({ data: [] }));
	});
	return urls;
}
const listCalls = (urls: string[]) =>
	urls.filter((u) => u.startsWith("/api/content/posts?")).map((u) => new URL(u, "http://x").searchParams);

describe("listQuery", () => {
	it("sends only the filters that are set and widens the end date to the whole day", () => {
		const q = new URLSearchParams(
			listQuery(
				{ q: " hi ", status: "", sort: "title", author: "ada", lang: "", from: "2026-05-01", to: "2026-05-02" },
				"c1",
			),
		);
		expect(Object.fromEntries(q)).toEqual({
			limit: "50",
			sort: "title",
			q: "hi",
			author: "ada",
			from: "2026-05-01T00:00:00.000Z",
			to: "2026-05-03T00:00:00.000Z",
			cursor: "c1",
		});
	});
});

describe("EntriesPage", () => {
	it("lists entries with author, language and status, and asks the server to filter", async () => {
		const urls = server({ "": { data: [entry("en/a", { status: "scheduled" })], total: 1, nextCursor: null } });
		render(<EntriesPage />);
		expect(await screen.findByText("Title en/a")).toBeInTheDocument();
		expect(screen.getByText("scheduled")).toBeInTheDocument();
		expect(screen.getByText("ada")).toBeInTheDocument();

		await userEvent.setup().selectOptions(await screen.findByLabelText("Status"), "draft");
		await waitFor(() => expect(listCalls(urls).some((p) => p.get("status") === "draft")).toBe(true));
		fireEvent.change(screen.getByLabelText("Search"), { target: { value: "apple" } });
		await waitFor(() => expect(listCalls(urls).some((p) => p.get("q") === "apple")).toBe(true));
		await userEvent.setup().selectOptions(screen.getByLabelText("Language"), "tr");
		await waitFor(() => expect(listCalls(urls).some((p) => p.get("lang") === "tr")).toBe(true));
	});

	it("loads the next page with the cursor and appends it", async () => {
		const urls = server({
			"": { data: [entry("a")], total: 2, nextCursor: "a" },
			a: { data: [entry("b")], total: 2, nextCursor: null },
		});
		render(<EntriesPage />);
		await screen.findByText("Title a");
		await userEvent.setup().click(screen.getByRole("button", { name: /Load more/ }));
		expect(await screen.findByText("Title b")).toBeInTheDocument();
		expect(screen.getByText("Title a")).toBeInTheDocument();
		expect(listCalls(urls).at(-1)?.get("cursor")).toBe("a");
		expect(screen.queryByRole("button", { name: /Load more/ })).toBeNull();
	});

	it("refuses to create over a slug that exists, even when it is not on the loaded page", async () => {
		server({ "": { data: [entry("a")], total: 120, nextCursor: "a" } });
		render(<EntriesPage />);
		await screen.findByText("Title a");
		const user = userEvent.setup();
		await user.type(screen.getByLabelText("New entry slug"), "taken");
		await user.click(screen.getByRole("button", { name: "Create" }));
		expect(await screen.findByText("An entry with this slug already exists.")).toBeInTheDocument();
		expect(navigate).not.toHaveBeenCalled();

		await user.clear(screen.getByLabelText("New entry slug"));
		await user.type(screen.getByLabelText("New entry slug"), "fresh");
		await user.click(screen.getByRole("button", { name: "Create" }));
		await waitFor(() =>
			expect(navigate).toHaveBeenCalledWith({
				to: "/e/$collection/$",
				params: { collection: "posts", _splat: "fresh" },
			}),
		);
	});

	it("says when filters match nothing", async () => {
		server({ "": { data: [], total: 0, nextCursor: null } });
		render(<EntriesPage />);
		expect(await screen.findByText("No posts yet")).toBeInTheDocument();
		await userEvent.setup().selectOptions(screen.getByLabelText("Status"), "draft");
		expect(await screen.findByText("No matches")).toBeInTheDocument();
	});
});
