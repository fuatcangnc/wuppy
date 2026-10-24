import { describe, expect, it } from "vitest";
import { themeMarkup } from "../src/components/visual-editor/markdown.ts";

describe("blocks written into a theme file", () => {
	it("drops the editor's marks and keeps attributes and inline styles", () => {
		const html = themeMarkup({
			moduleId: "button",
			props: { text: "Go {now}", href: "/x", class: "btn" },
			styles: { color: "#fff" },
			children: [],
		});
		expect(html).toBe('<a href="/x" class="btn" style="color: #fff">Go &#123;now&#125;</a>');
	});
});
