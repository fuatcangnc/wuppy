import { describe, expect, it } from "vitest";
import { fixedViewport, liveBodyRoot } from "../src/components/visual-editor/Canvas.tsx";

const page = (body: string) => new DOMParser().parseFromString(`<html><body>${body}</body></html>`, "text/html");

describe("live body root", () => {
	it("replaces the marked entry body with an empty root inside the theme layout", () => {
		const d = page(
			`<header>H</header><main class="prose"><!--wuppy:body--><p>old</p><h2>x</h2><!--/wuppy:body--></main><footer>F</footer>`,
		);
		const root = liveBodyRoot(d);
		expect(root?.parentElement?.className).toBe("prose");
		expect(d.querySelector("main")?.textContent).toBe("");
		expect(d.querySelector("header")?.textContent).toBe("H");
		expect(d.querySelector("footer")?.textContent).toBe("F");
	});

	it("gives up when there is no marked body or the markers are not siblings", () => {
		expect(liveBodyRoot(page("<main><p>x</p></main>"))).toBeNull();
		const d = page("<div><!--wuppy:body--><section><p>x<!--/wuppy:body--></p></section></div><footer>F</footer>");
		expect(liveBodyRoot(d)).toBeNull();
		expect(d.querySelector("footer")?.textContent).toBe("F");
	});
});

describe("design-mode viewport height", () => {
	it("turns vh units into the fixed device height and leaves other values alone", () => {
		expect(fixedViewport("calc(100vh - 5rem)", 900)).toBe("calc(900px - 5rem)");
		expect(fixedViewport("50dvh", 900)).toBe("450px");
		expect(fixedViewport("100svh", 900)).toBe("900px");
		expect(fixedViewport("12px", 900)).toBeNull();
		expect(fixedViewport("var(--vh-x)", 900)).toBeNull();
	});
});
