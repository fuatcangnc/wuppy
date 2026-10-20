import { createEditor } from "lexical";
import { $getRoot } from "lexical";
import { describe, expect, it } from "vitest";
import { componentSnippet, imageSnippet, insertSnippet, tableSnippet } from "../src/components/editor/snippets.ts";

describe("snippets", () => {
	it("builds an image with alt and caption, stripping characters that break the syntax", () => {
		expect(imageSnippet("/a.png", "A [cat]\nsleeping", 'Say "hi"')).toBe("![A cat sleeping](/a.png \"Say 'hi'\")");
		expect(imageSnippet("/a.png", "")).toBe("![](/a.png)");
	});
	it("builds a table skeleton", () => {
		expect(tableSnippet(2, 1).split("\n")).toEqual(["| Column 1 | Column 2 |", "| --- | --- |", "|   |   |"]);
	});
	it("only accepts component-like names", () => {
		expect(componentSnippet("Callout")).toBe("<Callout>\nContent\n</Callout>");
		expect(() => componentSnippet("x onload=1")).toThrow();
	});
	it("inserts a multi-line paragraph at the end of an empty document", () => {
		const editor = createEditor({
			onError: (e) => {
				throw e;
			},
		});
		insertSnippet(editor, "a\nb");
		editor.read(() => expect($getRoot().getTextContent()).toBe("a\nb"));
	});
});
