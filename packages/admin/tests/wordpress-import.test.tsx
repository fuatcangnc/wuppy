import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WordpressImport, type JobState } from "../src/components/import/WordpressImport.tsx";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const base: JobState = {
	id: "j1",
	status: "ready",
	total: 3,
	cursor: 0,
	analysis: {
		posts: 2,
		pages: 1,
		drafts: 1,
		attachments: 0,
		images: 4,
		authors: 1,
		categories: 2,
		tags: 1,
		menus: 1,
		conflicts: ["posts/hello"],
		unusable: 1,
	},
	created: [],
	media: [],
	redirects: 0,
	skipped: [],
	errors: [],
};

const reply = (job: Partial<JobState>, status = 200) =>
	new Response(JSON.stringify({ data: { ...base, ...job } }), { status });

describe("WordpressImport", () => {
	it("analyzes, imports batch by batch until done, then can undo", async () => {
		const calls: string[] = [];
		let cursor = 0;
		vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
			calls.push(`${init.method} ${url}`);
			if (url.endsWith("/jobs")) return reply({}, 201);
			if (url.endsWith("/run")) {
				cursor = Math.min(cursor + 2, 3);
				return reply({
					cursor,
					status: cursor === 3 ? "done" : "running",
					created: Array(cursor).fill(1),
					skipped: ["posts/hello: already exists"],
				});
			}
			return reply({ status: "rolled-back", cursor: 3 });
		});
		vi.spyOn(window, "confirm").mockReturnValue(true);
		const file = Object.assign(new File(["x"], "wp.xml"), { text: async () => "<rss/>" });
		render(<WordpressImport file={file} />);
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: "Analyze file" }));
		expect(await screen.findByText("posts/hello")).toBeInTheDocument();
		expect(screen.getByText(/no title or slug/)).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Start import" }));
		await waitFor(() => expect(screen.getByLabelText("Import report")).toBeInTheDocument());
		expect(calls.filter((c) => c.endsWith("/run"))).toHaveLength(2);
		expect(screen.getByLabelText("Import progress")).toHaveAttribute("value", "3");

		await user.click(screen.getByRole("button", { name: "Undo import" }));
		await waitFor(() => expect(calls.at(-1)).toMatch(/rollback$/));
	});

	it("shows the server's reason when the file cannot be imported", async () => {
		vi.stubGlobal(
			"fetch",
			async () =>
				new Response(JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "No posts or pages found." } }), {
					status: 422,
				}),
		);
		render(<WordpressImport file={Object.assign(new File(["x"], "a.xml"), { text: async () => "<rss/>" })} />);
		await userEvent.setup().click(screen.getByRole("button", { name: "Analyze file" }));
		expect(await screen.findByText("No posts or pages found.")).toBeInTheDocument();
	});
});
