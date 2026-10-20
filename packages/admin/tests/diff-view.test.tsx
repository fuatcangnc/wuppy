import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DiffView } from "../src/components/git/DiffView.tsx";

const diff = [
	"diff --git a/x.md b/x.md",
	"--- a/x.md",
	"+++ b/x.md",
	"@@ -1,2 +1,2 @@",
	" same",
	"-old line",
	"+new line",
].join("\n");

describe("DiffView", () => {
	it("marks added and removed lines for assistive tech, not by color alone", () => {
		render(<DiffView text={diff} />);
		expect(screen.getByText("new line").closest("li")).toHaveAttribute("data-kind", "add");
		expect(screen.getByText("old line").closest("li")).toHaveAttribute("data-kind", "del");
		expect(screen.getByText("new line").closest("li")).toHaveTextContent("Added: new line");
		expect(screen.getByText("old line").closest("li")).toHaveTextContent("Removed: old line");
	});

	it("renders text as text, never as HTML", () => {
		render(<DiffView text={"+<img src=x onerror=alert(1)>"} />);
		expect(document.querySelector("img")).toBeNull();
		expect(screen.getByText(/<img src=x/)).toBeInTheDocument();
	});

	it("says so when there is no change", () => {
		render(<DiffView text="" />);
		expect(screen.getByText("No changes")).toBeInTheDocument();
	});
});
