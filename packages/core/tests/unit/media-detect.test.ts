import { describe, expect, it } from "vitest";
import { detectImage } from "../../src/media/index.ts";

const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

describe("detectImage", () => {
	it("recognises png, jpeg, gif and webp by magic bytes", () => {
		expect(detectImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.ext).toBe("png");
		expect(detectImage(bytes(0xff, 0xd8, 0xff, 0xe0))?.ext).toBe("jpg");
		expect(detectImage(new TextEncoder().encode("GIF89a......"))?.ext).toBe("gif");
		expect(detectImage(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))?.ext).toBe("webp");
	});
	it("rejects svg, html and arbitrary text (script-capable or unknown)", () => {
		expect(
			detectImage(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script>1</script></svg>")),
		).toBeNull();
		expect(detectImage(new TextEncoder().encode("<html><script>alert(1)</script>"))).toBeNull();
		expect(detectImage(new TextEncoder().encode("hello"))).toBeNull();
		expect(detectImage(new Uint8Array())).toBeNull();
	});
});
