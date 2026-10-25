import type { Context } from "hono";
import { ZodError } from "zod";
import {
	ContentExistsError,
	DisallowedContentError,
	UniqueFieldError,
	UnknownCollectionError,
} from "../content/service.ts";
import { MediaTooLargeError, UnsupportedMediaError } from "../media/index.ts";
import { redact } from "../security/redact.ts";
import { UnsafePathError } from "../content/validation/path.ts";
import { PluginHookError, PluginRejectedError } from "../plugins/errors.ts";

export class ApiError extends Error {
	constructor(
		readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429 | 500 | 502,
		readonly code: string,
		message: string,
		readonly details?: unknown,
	) {
		super(message);
	}
}

export const fail = (c: Context, status: ApiError["status"] | 500, code: string, message: string, details?: unknown) =>
	c.json({ error: { code, message, ...(details === undefined ? {} : { details }) } }, status);

/** One error shape for the whole API; unknown errors never leak internals. */
export function onError(err: Error, c: Context) {
	if (err instanceof ApiError) return fail(c, err.status, err.code, err.message, err.details);
	if (err instanceof ZodError) {
		// Name the fields, so a save that fails says which one to fix.
		const fields = [...new Set(err.issues.map((i) => i.path.join(".")).filter(Boolean))].join(", ");
		return fail(c, 422, "VALIDATION_ERROR", fields ? `Invalid input: ${fields}` : "Invalid input", err.issues);
	}
	if (err instanceof UniqueFieldError)
		return fail(c, 422, "VALIDATION_ERROR", `Invalid input: ${err.field}`, [
			{ code: "custom", path: [err.field], message: err.message, input: err.value },
		]);
	if (err instanceof ContentExistsError) return fail(c, 409, "SLUG_TAKEN", err.message);
	if (err instanceof DisallowedContentError) return fail(c, 422, "DISALLOWED_CONTENT", err.message, err.found);
	if (err instanceof UnsafePathError) return fail(c, 400, "BAD_REQUEST", "Invalid slug");
	if (err instanceof MediaTooLargeError) return fail(c, 413, "PAYLOAD_TOO_LARGE", err.message);
	if (err instanceof UnsupportedMediaError) return fail(c, 415, "UNSUPPORTED_MEDIA", err.message);
	if (err instanceof UnknownCollectionError) return fail(c, 404, "NOT_FOUND", "Unknown collection");
	if (err instanceof PluginRejectedError)
		return fail(c, 422, "REJECTED_BY_PLUGIN", err.message, { plugin: err.plugin, reason: err.reason });
	if (err instanceof PluginHookError) return fail(c, 502, "PLUGIN_ERROR", err.message, { plugin: err.plugin });
	console.error(redact(String(err.stack ?? err)));
	return fail(c, 500, "INTERNAL", "Internal server error");
}
