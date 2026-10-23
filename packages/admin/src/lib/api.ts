export class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
		readonly details?: unknown,
	) {
		super(message);
	}
}

export const ACTIVE_SITE_KEY = "wuppy.activeSite";
const readActiveSite = () => {
	try {
		return localStorage.getItem(ACTIVE_SITE_KEY) || "local";
	} catch {
		return "local";
	}
};
let activeSite = readActiveSite();

/** Which site API calls go to. The hub re-checks access on every request; this is only routing. */
export const apiSite = () => activeSite;
export function setApiSite(id: string) {
	activeSite = id;
	try {
		localStorage.setItem(ACTIVE_SITE_KEY, id);
	} catch {
		// private mode: the choice just doesn't survive a reload
	}
}

const HUB_ONLY = /^\/api\/(auth|setup|sites|ai|mcp)(\/|\?|$)/;
/** `/api/...` and `/uploads/...` of the active managed site go through the hub's proxy; sign-in and the site list stay local. */
export function apiUrl(path: string): string {
	if (activeSite === "local" || HUB_ONLY.test(path)) return path;
	if (!path.startsWith("/api/") && !path.startsWith("/uploads/")) return path;
	return `/api/sites/${encodeURIComponent(activeSite)}/proxy${path}`;
}

/** Only mutating calls need the CSRF header; sending it always is harmless and simpler. */
export async function api<T>(
	method: string,
	path: string,
	body?: unknown,
	extraHeaders: Record<string, string> = {},
): Promise<T> {
	const res = await fetch(apiUrl(path), {
		method,
		credentials: "same-origin",
		// FormData sets its own multipart boundary header.
		headers: {
			"X-Wuppy-Request": "1",
			...extraHeaders,
			...(body === undefined || body instanceof FormData ? {} : { "Content-Type": "application/json" }),
		},
		body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
	});
	const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
	if (!res.ok) {
		const e = (json?.error ?? json) as { code?: string; message?: string; details?: unknown } | null;
		throw new ApiError(res.status, e?.code ?? "UNKNOWN", e?.message ?? res.statusText, e?.details);
	}
	return json as T;
}

export const apiData = async <T>(method: string, path: string, body?: unknown): Promise<T> =>
	(await api<{ data: T }>(method, path, body)).data;

/** Content slugs contain `/`; encode each segment, keep the separators. */
export const slugPath = (slug: string) => slug.split("/").map(encodeURIComponent).join("/");
