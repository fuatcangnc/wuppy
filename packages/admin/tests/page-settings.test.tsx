import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageSettings } from "../src/components/content/PageSettings.tsx";

afterEach(() => vi.unstubAllGlobals());

const site = {
	siteName: "Example",
	siteUrl: "https://example.com",
	seo: { titleTemplate: "{title} | {site}", description: "", image: "" },
};

function Harness({
	initial,
	onChange,
}: {
	initial: Record<string, unknown>;
	onChange: (name: string, value: unknown) => void;
}) {
	const [data, setData] = useState(initial);
	return (
		<PageSettings
			data={data}
			onChange={(name, value) => {
				onChange(name, value);
				setData((current) => ({ ...current, [name]: value }));
			}}
			path="/"
			kind="pages"
		/>
	);
}

describe("PageSettings", () => {
	it("edits the page title and generates a basic schema", async () => {
		vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ data: site })));
		const onChange = vi.fn();
		render(<Harness initial={{ title: "Home" }} onChange={onChange} />);
		const user = userEvent.setup();
		await user.clear(screen.getByLabelText("Page name"));
		await user.type(screen.getByLabelText("Page name"), "Welcome");
		expect(onChange).toHaveBeenLastCalledWith("title", "Welcome");
		await user.click(screen.getByRole("button", { name: "Schema markup" }));
		await user.click(screen.getByRole("button", { name: "Generate schema markup" }));
		expect(onChange).toHaveBeenLastCalledWith("schemaJson", expect.stringContaining('"@type": "WebPage"'));
	});

	it("edits Open Graph and custom code values", async () => {
		vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ data: site })));
		const onChange = vi.fn();
		render(
			<Harness
				initial={{ title: "Home", seoTitle: "SEO title", seoDescription: "SEO description" }}
				onChange={onChange}
			/>,
		);
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "Open Graph settings" }));
		expect(screen.getAllByRole("checkbox", { name: "Same as SEO title tag" })[0]).toBeChecked();
		await user.type(screen.getByLabelText("Open Graph title"), "Share title");
		expect(onChange).toHaveBeenLastCalledWith("ogTitle", "Share title");
		await user.click(screen.getByRole("button", { name: "Custom code" }));
		await user.type(screen.getByLabelText("Head code"), '<meta name="x">');
		expect(onChange).toHaveBeenLastCalledWith("customHead", '<meta name="x">');
	});
});
