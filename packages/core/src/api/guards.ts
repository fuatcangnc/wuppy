import type { MiddlewareHandler } from "hono";
import { ApiError } from "./errors.ts";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Per-user fixed window on write requests. In-memory: one process, resets on restart.
 * shortcut: not shared across instances, move to the database when running more than one.
 */
export function writeRateLimit(
	max = 120,
	windowMs = 60_000,
): MiddlewareHandler<{ Variables: { user: { id: string } } }> {
	const hits = new Map<string, { count: number; reset: number }>();
	return async (c, next) => {
		if (SAFE.has(c.req.method)) return next();
		const now = Date.now();
		const id = c.get("user").id;
		const hit = hits.get(id);
		if (!hit || hit.reset <= now) hits.set(id, { count: 1, reset: now + windowMs });
		else if (++hit.count > max) throw new ApiError(429, "RATE_LIMITED", "Too many requests");
		await next();
	};
}

/** Replays the stored response when a POST repeats the same `Idempotency-Key` (per user and path) within `ttlMs`. */
export function idempotency(ttlMs = 10 * 60_000): MiddlewareHandler<{ Variables: { user: { id: string } } }> {
	const seen = new Map<string, { expires: number; status: number; body: string }>();
	return async (c, next) => {
		const key = c.req.header("Idempotency-Key");
		if (c.req.method !== "POST" || !key) return next();
		const id = `${c.get("user").id}\n${c.req.path}\n${key}`;
		const now = Date.now();
		for (const [k, v] of seen) if (v.expires <= now) seen.delete(k);
		const hit = seen.get(id);
		if (hit) {
			c.header("Idempotent-Replayed", "true");
			return c.newResponse(hit.body, hit.status as 200, { "content-type": "application/json; charset=utf-8" });
		}
		await next();
		if (c.res.status < 500)
			seen.set(id, { expires: now + ttlMs, status: c.res.status, body: await c.res.clone().text() });
	};
}
