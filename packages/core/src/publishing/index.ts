import { createHmac, timingSafeEqual } from "node:crypto";

/** Draft/schedule rule shared by the sitemap, the starter site and anything else that lists public content. */
export function isPublished(data: Record<string, unknown>, now: Date = new Date()): boolean {
	if (data.draft === true) return false;
	const at = data.publishAt;
	if (at === undefined || at === null || at === "") return true;
	const t = (at instanceof Date ? at : new Date(String(at))).getTime();
	return Number.isFinite(t) && t <= now.getTime();
}

export type EntryStatus = "draft" | "scheduled" | "published";

/**
 * What an editor sees for an entry: a future `publishAt` means scheduled (whether or not `draft` is set),
 * otherwise `draft: true` is a draft, otherwise it is live.
 */
export function entryStatus(data: Record<string, unknown>, now: Date = new Date()): EntryStatus {
	const at = data.publishAt;
	const t =
		at === undefined || at === null || at === "" ? NaN : (at instanceof Date ? at : new Date(String(at))).getTime();
	if (Number.isFinite(t) && t > now.getTime()) return "scheduled";
	return data.draft === true ? "draft" : "published";
}

/** Preview links let someone without an account see one unpublished entry until `expires`. */
const previewMac = (secret: string, collection: string, slug: string, expires: number) =>
	createHmac("sha256", secret).update(`preview\n${collection}\n${slug}\n${expires}`).digest("base64url");

export function signPreview(
	secret: string,
	collection: string,
	slug: string,
	ttlMs = 24 * 3_600_000,
	now = Date.now(),
) {
	const expires = now + ttlMs;
	return { token: `${expires}.${previewMac(secret, collection, slug, expires)}`, expires: new Date(expires) };
}

/** True only for an unexpired token minted for exactly this collection and slug. */
export function verifyPreview(
	secret: string,
	collection: string,
	slug: string,
	token: string | null | undefined,
	now = Date.now(),
): boolean {
	const [exp = "", mac = ""] = (token ?? "").split(".");
	const expires = Number(exp);
	if (!secret || !Number.isFinite(expires) || expires < now) return false;
	const want = Buffer.from(previewMac(secret, collection, slug, expires));
	const got = Buffer.from(mac);
	return want.length === got.length && timingSafeEqual(want, got);
}
