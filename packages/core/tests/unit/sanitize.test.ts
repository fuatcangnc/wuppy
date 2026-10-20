import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "../../src/security/sanitize.ts";

describe("sanitizeHtml", () => {
	it("keeps basic formatting and safe links", () => {
		expect(sanitizeHtml('<p>Hi <strong>you</strong> <a href="https://a.com/x?y=1&z=2">link</a><br></p>')).toBe(
			'<p>Hi <strong>you</strong> <a href="https://a.com/x?y=1&amp;z=2" rel="noopener noreferrer">link</a><br></p>',
		);
		expect(sanitizeHtml('<a href="/about">a</a>')).toContain('href="/about"');
	});

	it.each([
		"<script>alert(1)</script>",
		'<img src=x onerror="alert(1)">',
		'<a href="javascript:alert(1)">x</a>',
		'<a href="JaVa\tScRiPt:alert(1)">x</a>',
		'<a href="&#106;avascript:alert(1)">x</a>',
		'<a href="&#x6A;avascript&colon;alert(1)">x</a>',
		'<a href=" javascript:alert(1)">x</a>',
		'<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>',
		'<a href="//evil.com">x</a>',
		'<p onclick="alert(1)">x</p>',
		"<svg/onload=alert(1)>",
		'<iframe src="https://evil.com"></iframe>',
		"<style>*{background:url(javascript:alert(1))}</style>",
		"<<script>script>alert(1)<</script>/script>",
		'<a href="x" onmouseover=alert(1)>x</a>',
	])("neutralises %s", (input) => {
		const out = sanitizeHtml(input);
		expect(out).not.toMatch(
			/<script|<img|<svg|<iframe|<style|javascript:|onerror|onclick|onload|onmouseover|data:|href="\/\//i,
		);
		// Anything left over must be inert text or an allowed tag with no attributes besides href.
		expect(out.replace(/<\/?(a|p)( href="[^"]*" rel="noopener noreferrer")?>/g, "")).not.toContain("<");
	});

	it("escapes stray angle brackets and quotes", () => {
		expect(sanitizeHtml('1 < 2 & "3" > 0')).toBe("1 &lt; 2 &amp; &quot;3&quot; &gt; 0");
	});
});
