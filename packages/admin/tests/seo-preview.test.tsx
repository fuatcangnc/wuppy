import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SeoPreview, seoPreview } from "../src/components/content/SeoPreview.tsx";
import { parsePriorities } from "../src/components/settings/SettingsPage.tsx";

const site = {
	siteName: "Example",
	siteUrl: "https://example.com",
	seo: { titleTemplate: "{title} | {site}", description: "", image: "" },
};

afterEach(() => vi.unstubAllGlobals());

describe("seoPreview", () => {
	it("applies the template, falls back to site defaults and builds the display URL", () => {
		const p = seoPreview(
			{ title: "Hello", path: "/posts/hello" },
			{ ...site, seo: { ...site.seo, description: "Default", image: "/d.png" } },
		);
		expect(p).toMatchObject({
			title: "Hello | Example",
			description: "Default",
			image: "/d.png",
			url: "example.com/posts/hello",
			warnings: [],
		});
	});
	it("prefers the entry's SEO fields and warns about length and missing pieces", () => {
		const p = seoPreview({ title: "T", seoTitle: "x".repeat(70), seoDescription: "y".repeat(200), path: "/a" }, site);
		expect(p.title.startsWith("xxx")).toBe(true);
		expect(p.warnings).toHaveLength(3); // title too long, description too long, no image
		expect(seoPreview({ title: "T", path: "/a" }, site).warnings[0]).toMatch(/No description/);
	});
	it("treats $ in titles literally", () => {
		expect(seoPreview({ title: "Save $& more", path: "/a" }, site).title).toBe("Save $& more | Example");
	});
});

describe("SeoPreview", () => {
	it("renders the search result and the warnings", async () => {
		vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ data: site })));
		render(<SeoPreview title="Hello" path="/posts/hello" />);
		expect(await screen.findByText("Hello | Example")).toBeInTheDocument();
		expect(screen.getByText("example.com/posts/hello")).toBeInTheDocument();
		expect(screen.getByText(/No description/)).toBeInTheDocument();
	});
});

describe("parsePriorities", () => {
	it("keeps valid 0..1 numbers only", () => {
		expect(parsePriorities("posts=0.8, pages = 0.5, bad=2, none=, x")).toEqual({ posts: 0.8, pages: 0.5 });
	});
});
