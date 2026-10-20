import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TranslationTable } from "../src/components/content/TranslationTable.tsx";

describe("TranslationTable", () => {
	it("shows each key per locale and flags the missing ones", () => {
		render(
			<TranslationTable
				collection="posts"
				locales={["en", "tr"]}
				rows={[
					{ key: "hi", translations: { en: "en/hi", tr: "tr/hi" }, missing: [] },
					{ key: "solo", translations: { en: "en/solo" }, missing: ["tr"] },
				]}
				renderLink={(label, slug) => <a href={`/e/posts/${slug}`}>{label}</a>}
			/>,
		);
		expect(screen.getByRole("columnheader", { name: "tr" })).toBeInTheDocument();
		expect(screen.getAllByText("Missing")).toHaveLength(1);
		expect(screen.getByRole("link", { name: "Translate to tr" })).toHaveAttribute("href", "/e/posts/tr/solo");
		expect(screen.getAllByRole("link", { name: "Open" })).toHaveLength(3);
	});

	it("explains when no locales are configured", () => {
		render(<TranslationTable collection="posts" locales={[]} rows={[]} renderLink={(l) => <span>{l}</span>} />);
		expect(screen.getByText(/locales/i)).toBeInTheDocument();
	});
});
