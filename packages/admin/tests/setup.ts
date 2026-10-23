import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Radix Select calls the Pointer Events capture API, which jsdom does not implement.
if (!Element.prototype.hasPointerCapture) {
	Element.prototype.hasPointerCapture = () => false;
	Element.prototype.setPointerCapture = () => undefined;
	Element.prototype.releasePointerCapture = () => undefined;
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => undefined;

// Node 25+ has its own `localStorage` global (undefined without --localstorage-file) that hides jsdom's.
if (!globalThis.localStorage) {
	const items = new Map<string, string>();
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: {
			getItem: (k: string) => items.get(k) ?? null,
			setItem: (k: string, v: string) => void items.set(k, String(v)),
			removeItem: (k: string) => void items.delete(k),
			clear: () => items.clear(),
			key: (i: number) => [...items.keys()][i] ?? null,
			get length() {
				return items.size;
			},
		} satisfies Storage,
	});
}

afterEach(cleanup);
