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

/** Only mutating calls need the CSRF header; sending it always is harmless and simpler. */
export async function api<T>(
	method: string,
	path: string,
	body?: unknown,
	extraHeaders: Record<string, string> = {},
): Promise<T> {
	const res = await fetch(path, {
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
