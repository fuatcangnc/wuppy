import { ACTING_ROLE_HEADER, ACTING_USER_HEADER } from "../security/api-tokens.ts";
import { assertSiteAddress, SiteError, type SiteNetwork } from "./connect.ts";

/** Big enough for a WordPress export (the largest remote upload), small enough to bound memory. */
export const MAX_PROXY_REQUEST_BYTES = 50 * 1024 * 1024;
export const MAX_PROXY_RESPONSE_BYTES = 100 * 1024 * 1024;

/** Remote surfaces a hub never reaches: sign-in, tokens, users, the hub contract itself, and the site's own AI (its bill). */
const DENIED = [
	"/api/auth",
	"/api/hub",
	"/api/tokens",
	"/api/sites",
	"/api/users",
	"/api/invitations",
	"/api/ai",
	"/api/mcp",
];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/**
 * Validates the raw (still percent-encoded) path after `/proxy`. Returns it when allowed, else null.
 * Encoded dots/slashes/backslashes and NULs are refused so a remote router cannot decode its way elsewhere.
 */
export function proxyPath(raw: string, method: string): string | null {
	if (!raw.startsWith("/") || /%(2e|2f|5c|00)/i.test(raw) || /\.\.|\/\/|\\/.test(raw)) return null;
	if ([...raw].some((ch) => ch.charCodeAt(0) < 0x20)) return null;
	const lower = raw.toLowerCase();
	if (under(lower, "/uploads")) return method === "GET" || method === "HEAD" ? raw : null;
	if (!under(lower, "/api") || lower === "/api") return null;
	return DENIED.some((p) => under(lower, p)) ? null : raw;
}

const REQUEST_HEADERS = ["accept", "content-type", "if-none-match", "if-match", "idempotency-key"];
const RESPONSE_HEADERS = ["content-type", "etag", "content-disposition", "last-modified", "idempotent-replayed"];

const pick = (from: Headers, names: readonly string[]) => {
	const out: Record<string, string> = {};
	for (const name of names) {
		const value = from.get(name);
		if (value !== null) out[name] = value;
	}
	return out;
};

/** Reads a body, throwing RangeError once it passes `max` bytes instead of buffering without limit. */
export async function readCapped(
	body: ReadableStream<Uint8Array> | null,
	max: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
	if (!body) return null;
	const chunks: Uint8Array[] = [];
	let size = 0;
	for await (const chunk of body) {
		size += chunk.byteLength;
		if (size > max) throw new RangeError("Body too large");
		chunks.push(chunk);
	}
	return Buffer.concat(chunks);
}

export interface ProxyInput {
	origin: string;
	token: string;
	/** Allowed path (see proxyPath) plus the original query string. */
	pathAndQuery: string;
	method: string;
	headers: Headers;
	body: Uint8Array<ArrayBuffer> | null;
	actingRole: string;
	actingEmail: string | null;
}

export interface ProxyResult {
	status: number;
	headers: Record<string, string>;
	body: Uint8Array<ArrayBuffer> | null;
}

/** One server-side request to the remote. The browser's cookies and credentials are never forwarded. */
export async function forward(input: ProxyInput, net: SiteNetwork): Promise<ProxyResult> {
	await assertSiteAddress(input.origin, net);
	let res: Response;
	try {
		res = await (net.fetch ?? fetch)(`${input.origin}${input.pathAndQuery}`, {
			method: input.method,
			headers: {
				...pick(input.headers, REQUEST_HEADERS),
				authorization: `Bearer ${input.token}`,
				"x-wuppy-request": "1",
				[ACTING_ROLE_HEADER]: input.actingRole,
				...(input.actingEmail ? { [ACTING_USER_HEADER]: input.actingEmail } : {}),
			},
			body: input.body,
			redirect: "error",
			signal: AbortSignal.timeout(30_000),
		});
	} catch {
		throw new SiteError("SITE_UNREACHABLE", "The site did not answer");
	}
	if (res.status === 401)
		throw new SiteError("SITE_AUTH_FAILED", "The site rejected the hub token (revoked or expired)");
	return {
		status: res.status,
		headers: pick(res.headers, RESPONSE_HEADERS),
		body: await readCapped(res.body, MAX_PROXY_RESPONSE_BYTES).catch(() => {
			throw new SiteError("SITE_UNREACHABLE", "The site's response is too large to forward");
		}),
	};
}
