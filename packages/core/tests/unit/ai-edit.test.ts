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
		expect(out).toEqual({ reply: "Done", edits: [{ ref: "n:1", styles: { color: "red" } }] });
	});

	it("shows an answer without JSON as the reply", async () => {
		const out = await planEdits({ baseUrl: "x", models: ["m"], fetch: answer(" Which card? ") }, input);
		expect(out).toEqual({ reply: "Which card?", edits: [] });
	});
});
