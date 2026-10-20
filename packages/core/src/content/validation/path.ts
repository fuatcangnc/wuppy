export class UnsafePathError extends Error {}

const SEGMENT = /^[a-z0-9][a-z0-9._-]*$/i;

/** Throws unless `slug` is a safe relative slug path (e.g. "blog/hello"). Returns it normalized. */
export function assertSafeSlug(slug: string): string {
	if (!slug || slug.includes("\0") || slug.includes("\\")) {
		throw new UnsafePathError(`Unsafe slug: ${JSON.stringify(slug)}`);
	}
	const parts = slug.split("/");
	if (!parts.every((p) => SEGMENT.test(p))) {
		throw new UnsafePathError(`Unsafe slug: ${JSON.stringify(slug)}`);
	}
	return parts.join("/");
}
