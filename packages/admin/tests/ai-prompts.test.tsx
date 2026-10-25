import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiPage } from "../src/components/ai/AiPage.tsx";

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
	useRouterState: () => "/ai",
}));

afterEach(() => vi.unstubAllGlobals());

describe("AI › Theme prompts", () => {
	it("copies a prompt together with the theme guide", async () => {
		vi.stubGlobal("fetch", async () =>
			Response.json({
				data: { guide: "# Guide", prompts: [{ id: "menus", label: "Connect the menus", prompt: "Use the menus." }] },
			}),
		);
		const writeText = vi.fn(async () => undefined);
		Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
		render(<AiPage />);
		fireEvent.click(screen.getByRole("button", { name: /Theme prompts/ }));
		fireEvent.click(await screen.findByRole("button", { name: "Copy prompt: Connect the menus" }));
		await waitFor(() => expect(writeText).toHaveBeenCalledWith("Use the menus.\n\n---\n\n# Guide"));
		fireEvent.click(screen.getByRole("button", { name: /Copy guide/ }));
		expect(writeText).toHaveBeenLastCalledWith("# Guide");
	});
});
