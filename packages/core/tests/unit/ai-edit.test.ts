import { describe, expect, it } from "vitest";
import { planEdits } from "../../src/ai/edit.ts";

const answer = (content: string) =>
	(async () => Response.json({ choices: [{ message: { role: "assistant", content } }] })) as unknown as typeof fetch;

const input = {
	model: "m",
	prompt: "make it red",
	history: [],
	elements: [{ ref: "n:1", kind: "block" as const, tag: "h1", text: "Hi" }],
};

describe("visual editor AI edits", () => {
	it("reads the edits from the model's JSON and drops unknown elements", async () => {
		const out = await planEdits(
			{
				baseUrl: "x",
				models: ["m"],
				fetch: answer(
					'```json\n{"reply":"Done","edits":[{"ref":"n:1","styles":{"color":"red"}},{"ref":"n:9","text":"x"}]}\n```',
				),
			},
			input,
		);
		expect(out).toEqual({
			reply: "Done",
			edits: [{ ref: "n:1", styles: { color: "red" } }],
			insertions: [],
		});
	});

	it("adds a new section when no element is picked", async () => {
		const out = await planEdits(
			{
				baseUrl: "x",
				models: ["m"],
				fetch: answer(
					JSON.stringify({
						reply: "Added an about section",
						edits: [],
						insertions: [{ html: '<section class="py-20 px-5"><h2>About</h2></section>' }],
					}),
				),
			},
			{
				model: "m",
				prompt: "add an about section",
				history: [],
				elements: [],
				page: { title: "Home", sections: [{ tag: "section", classes: "py-20 px-5" }] },
			},
		);
		expect(out).toEqual({
			reply: "Added an about section",
			edits: [],
			insertions: [{ html: '<section class="py-20 px-5"><h2>About</h2></section>' }],
		});
	});

	it("passes an uploaded design system to the model", async () => {
		let sent: { messages?: Array<{ content?: string }> } = {};
		const capture = (async (_url: string, init: RequestInit) => {
			sent = JSON.parse(String(init.body)) as typeof sent;
			return Response.json({
				choices: [{ message: { role: "assistant", content: '{"reply":"ok","edits":[],"insertions":[]}' } }],
			});
		}) as unknown as typeof fetch;
		await planEdits(
			{ baseUrl: "x", models: ["m"], fetch: capture },
			{ ...input, designSystem: "# Design system\nUse the container-page class and Space Grotesk." },
		);
		expect(sent.messages?.[0]?.content).toContain("Uploaded design system (authoritative)");
		expect(sent.messages?.[0]?.content).toContain("container-page");
	});

	it("shows an answer without JSON as the reply", async () => {
		const out = await planEdits({ baseUrl: "x", models: ["m"], fetch: answer(" Which card? ") }, input);
		expect(out).toEqual({ reply: "Which card?", edits: [], insertions: [] });
	});
});
