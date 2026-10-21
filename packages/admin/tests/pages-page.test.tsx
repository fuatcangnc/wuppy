import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PagesPage } from "../src/components/content/pages/PagesPage.tsx";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, params }: { children: ReactNode; params?: Record<string, string | undefined> }) => (
		<a href={`/e/${params?.["collection"] ?? "pages"}/${params?.["_splat"] ?? ""}`}>{children}</a>
	),
	useNavigate: () => navigate,
}));

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	navigate.mockReset();
});

const page = (slug: string, over: object = {}) => ({
	slug,
	data: { title: slug === "about" ? "About" : slug, author: "ada" },
	body: "",
	modified: "2026-05-01T00:00:00Z",
	status: "published",
	...over,
});

const pages = [
	page("about"),
	page("checkout"),
	page("checkout/thanks", { status: "draft", data: { title: "Thanks", author: "ada" } }),
];

const server = () => {
	const urls: string[] = [];
	vi.stubGlobal("fetch", async (url: string) => {
		urls.push(url);
		if (url.startsWith("/api/content/pages?")) {
			const params = new URL(url, "http://x").searchParams;
			if (params.get("limit") === "1") {
				const status = params.get("status");
				const total = status ? pages.filter((entry) => entry.status === status).length : pages.length;
				return new Response(JSON.stringify({ data: [], total, nextCursor: null }));
			}
			const status = params.get("status");
			const rows = status ? pages.filter((entry) => entry.status === status) : pages;
			return new Response(JSON.stringify({ data: rows, total: rows.length, nextCursor: null }));
		}
		if (url === "/api/content/pages/taken") return new Response(JSON.stringify({ data: page("taken") }));
		if (url.startsWith("/api/content/pages/"))
			return new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "x" } }), { status: 404 });
		if (url === "/api/data/bylines") return new Response(JSON.stringify({ data: [{ slug: "ada", name: "Ada" }] }));
		if (url === "/api/i18n/pages") return new Response(JSON.stringify({ locales: ["en", "tr"] }));
		if (url === "/api/comments/entries")
			return new Response(JSON.stringify({ data: [{ collection: "pages", slug: "about", pending: 1, approved: 2 }] }));
		if (url === "/api/preview-link/pages/about")
			return new Response(JSON.stringify({ data: { url: "/about?wuppy-preview=test" } }));
		if (url === "/api/collections")
			return new Response(
				JSON.stringify({
					data: [
						{
							name: "pages",
							dir: "content/pages",
							format: "md",
							route: "/{slug}",
							fields: { title: "string" },
						},
					],
				}),
			);
		return new Response(JSON.stringify({ data: {} }));
	});
	return urls;
};

const listCalls = (urls: string[]) =>
	urls
		.filter((url) => url.startsWith("/api/content/pages?"))
		.map((url) => new URL(url, "http://x").searchParams)
		.filter((params) => params.get("limit") !== "1");

describe("PagesPage", () => {
	it("shows the split list, opens a page preview and keeps status/author/URL details", async () => {
		const urls = server();
		render(<PagesPage />);
		expect(await screen.findByRole("button", { name: "Open About" })).toBeInTheDocument();
		expect(screen.getByText("Page Preview")).toBeInTheDocument();
		expect(screen.getByText("3 items")).toBeInTheDocument();
		expect(screen.getByText("1 child")).toBeInTheDocument();

		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "Open About" }));
		expect(await screen.findByRole("heading", { name: "About" })).toBeInTheDocument();
		const detail = screen.getByTestId("page-detail");
		expect(within(detail).getByRole("link", { name: /http:\/\/localhost:3000\/about/ })).toBeInTheDocument();
		expect(within(detail).getAllByText("Ada")).toHaveLength(2);
		expect(within(detail).getByText("3")).toBeInTheDocument();
		expect(await screen.findByTitle("Preview of About")).toBeInTheDocument();
		await waitFor(() => expect(urls).toContain("/api/preview-link/pages/about"));
	});

	it("filters drafts from the tabs and asks the server for the matching page", async () => {
		const urls = server();
		render(<PagesPage />);
		await screen.findByRole("button", { name: "Open About" });
		await userEvent.setup().click(screen.getByRole("button", { name: /Drafts/ }));
		await waitFor(() => expect(listCalls(urls).some((params) => params.get("status") === "draft")).toBe(true));
		expect(await screen.findByRole("button", { name: "Open Thanks" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Open About" })).toBeNull();
	});

	it("switches to the table view, selects rows and exposes column settings", async () => {
		server();
		render(<PagesPage />);
		await screen.findByRole("button", { name: "Open About" });
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "Switch to table view" }));

		expect(await screen.findByTestId("pages-table")).toBeInTheDocument();
		expect(screen.getByRole("columnheader", { name: "Title" })).toBeInTheDocument();
		expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
		expect(screen.getByRole("columnheader", { name: "Comments" })).toBeInTheDocument();

		await user.click(screen.getByRole("checkbox", { name: "Select About" }));
		expect(screen.getByText("1 item selected")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Clear selection" }));
		expect(screen.queryByText("1 item selected")).toBeNull();

		await user.click(screen.getByRole("button", { name: "Actions for About" }));
		expect(await screen.findByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "Duplicate" })).toBeInTheDocument();
		await user.keyboard("{Escape}");

		await user.click(screen.getByRole("button", { name: "Settings" }));
		const dialog = screen.getByRole("dialog", { name: "Page settings" });
		expect(within(dialog).getByLabelText("Per page")).toBeInTheDocument();
		expect(within(dialog).getByLabelText("Order by")).toBeInTheDocument();
		expect(within(dialog).getByLabelText("Comments")).toBeInTheDocument();
	});

	it("resets the table columns from settings", async () => {
		server();
		render(<PagesPage />);
		await screen.findByRole("button", { name: "Open About" });
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "Switch to table view" }));
		await screen.findByTestId("pages-table");
		await user.click(screen.getByRole("button", { name: "Settings" }));
		const dialog = screen.getByRole("dialog", { name: "Page settings" });
		await user.click(within(dialog).getByLabelText("Comments"));
		expect(screen.queryByRole("columnheader", { name: "Comments" })).toBeNull();
	});

	it("creates a page from the dialog and opens its editor", async () => {
		server();
		render(<PagesPage />);
		await screen.findByRole("button", { name: "Open About" });
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "Create page" }));
		const dialog = screen.getByRole("dialog", { name: "New page" });
		fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "Contact" } });
		expect(within(dialog).getByLabelText("Slug")).toHaveValue("contact");
		await user.click(within(dialog).getByRole("button", { name: "Create" }));
		await waitFor(() =>
			expect(navigate).toHaveBeenCalledWith({
				to: "/e/$collection/$",
				params: { collection: "pages", _splat: "contact" },
			}),
		);
	});
});
