import { z } from "zod";
import { ACTING_ROLE_HEADER } from "../security/api-tokens.ts";
import { assertPublicUrl, UnsafeUrlError } from "../security/ssrf.ts";
import type { SiteCheck } from "./store.ts";

/** Bumped when the hub ↔ site contract changes incompatibly. */
export const HUB_API_VERSION = 1;

export type SiteErrorCode =
	"INVALID_URL" | "UNSAFE_URL" | "SITE_UNREACHABLE" | "SITE_AUTH_FAILED" | "NOT_A_HUB_TOKEN" | "INCOMPATIBLE_SITE";

/** Messages are fixed strings: never the remote's body, never the token. */
export class SiteError extends Error {
	constructor(
		readonly code: SiteErrorCode,
		message: string,
	) {
		super(message);
	}
}

export type SiteFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface SiteNetwork {
	/** Allow http and private addresses (local development only). */
	allowPrivate: boolean;
	fetch?: SiteFetch;
}

/** The site's origin (`https://example.com`), or SiteError. Paths, queries and credentials are not accepted. */
export function normalizeSiteUrl(raw: string, allowPrivate: boolean): string {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		throw new SiteError("INVALID_URL", "Enter the site's full address, e.g. https://example.com");
	}
	if (url.protocol !== "https:" && !(allowPrivate && url.protocol === "http:"))
		throw new SiteError("INVALID_URL", "The site address must start with https://");
	if (url.username || url.password) throw new SiteError("INVALID_URL", "The address must not contain credentials");
	if ((url.pathname !== "/" && url.pathname !== "") || url.search || url.hash)
		throw new SiteError("INVALID_URL", "Use the site's root address without a path");
	return url.origin;
}

/** DNS can change after the site was added, so this runs before every request. */
export async function assertSiteAddress(origin: string, net: SiteNetwork): Promise<void> {
	if (net.allowPrivate) return;
	try {
		await assertPublicUrl(origin);
	} catch (e) {
		if (e instanceof UnsafeUrlError) throw new SiteError("UNSAFE_URL", "The site address points to a private network");
		throw new SiteError("SITE_UNREACHABLE", "The site address could not be resolved");
	}
}

const whoamiSchema = z.object({
	data: z.object({
		siteName: z.string().max(200),
		siteUrl: z.string().max(500),
		apiVersion: z.number().int(),
		permissions: z.array(z.string().max(60)).max(100),
		tokenExpiresAt: z.string().nullable(),
	}),
});

export type SiteInfo = z.infer<typeof whoamiSchema>["data"];

/** Asks the remote who this token is; the hub learns the token's ceiling (acting as admin). */
export async function whoami(origin: string, token: string, net: SiteNetwork): Promise<SiteInfo> {
	await assertSiteAddress(origin, net);
	let res: Response;
	try {
		res = await (net.fetch ?? fetch)(`${origin}/api/hub/whoami`, {
			headers: {
				authorization: `Bearer ${token}`,
				"x-wuppy-request": "1",
				[ACTING_ROLE_HEADER]: "admin",
				accept: "application/json",
			},
			redirect: "error",
			signal: AbortSignal.timeout(10_000),
		});
	} catch {
		throw new SiteError("SITE_UNREACHABLE", "The site did not answer");
	}
	if (res.status === 401) throw new SiteError("SITE_AUTH_FAILED", "The site rejected the token (revoked or expired)");
	if (res.status === 403) throw new SiteError("NOT_A_HUB_TOKEN", "This token was not created with “Connect to a hub”");
	if (res.status === 404)
		throw new SiteError("INCOMPATIBLE_SITE", "This address is not a Wuppy site that can be managed");
	if (!res.ok) throw new SiteError("SITE_UNREACHABLE", `The site answered with status ${res.status}`);
	const parsed = whoamiSchema.safeParse(await res.json().catch(() => null));
	if (!parsed.success) throw new SiteError("INCOMPATIBLE_SITE", "The site gave an unexpected answer");
	if (parsed.data.data.apiVersion !== HUB_API_VERSION)
		throw new SiteError("INCOMPATIBLE_SITE", "The site runs an incompatible Wuppy version");
	return parsed.data.data;
}

export const toCheck = (info: SiteInfo): SiteCheck => ({
	permissions: info.permissions,
	tokenExpiresAt: info.tokenExpiresAt,
});
