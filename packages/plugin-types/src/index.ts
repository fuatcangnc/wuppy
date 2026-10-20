import { createHash } from "node:crypto";
import { z } from "zod";

export const HOOKS = ["onContentUpdated", "onContentDeleted", "onMediaUploaded"] as const;
export type HookName = (typeof HOOKS)[number];

const host = z.string().regex(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i, "Exact hostname only (no wildcard, scheme or port)");

export const manifestSchema = z.object({
	id: z.string().regex(/^[a-z][a-z0-9-]*$/),
	version: z.string().regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/),
	name: z.string().optional(),
	description: z.string().max(500).optional(),
	author: z.string().max(200).optional(),
	homepage: z.string().url().optional(),
	hooks: z.array(z.enum(HOOKS)).default([]),
	/** HTTP endpoints the host may forward to `plugin.fetch(request, ctx)`. */
	routes: z
		.array(
			z.object({
				path: z.string().startsWith("/"),
				methods: z.array(z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"])).default(["GET"]),
				description: z.string().max(200).optional(),
			}),
		)
		.default([]),
	/** Pages shown in the admin: each `path` must be a declared GET route returning `{ html }` or text. */
	adminPages: z
		.array(z.object({ path: z.string().startsWith("/"), label: z.string().min(1).max(40) }))
		.max(5)
		.default([]),
	/** Fields of the plugin's settings form; values reach the plugin as `ctx.settings`. */
	settings: z
		.array(
			z.object({
				key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
				label: z.string().min(1).max(80),
				type: z.enum(["string", "boolean", "number"]).default("string"),
				default: z.union([z.string(), z.boolean(), z.number()]).optional(),
				help: z.string().max(200).optional(),
			}),
		)
		.max(30)
		.default([]),
	capabilities: z
		.object({
			content: z
				.object({
					read: z.array(z.string()).default([]),
					/** Collections the plugin may create or overwrite entries in. */
					write: z.array(z.string()).default([]),
				})
				.default({ read: [], write: [] }),
			/** Secret names the plugin may read via `ctx.secret(name)`; values come from `WUPPY_PLUGIN_<ID>_<NAME>`. */
			secrets: z.array(z.string().regex(/^[A-Z][A-Z0-9_]*$/)).default([]),
			/** May send email through the site's configured sender (rate limited). */
			email: z.boolean().default(false),
			network: z
				.array(
					z.object({
						host,
						methods: z.array(z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"])).default(["GET"]),
						paths: z.array(z.string().startsWith("/")).default(["/"]),
					}),
				)
				.default([]),
		})
		.default({ content: { read: [], write: [] }, network: [], secrets: [], email: false }),
	limits: z
		.object({
			timeoutMs: z.number().int().min(50).max(30_000).default(2000),
			memoryMb: z.number().int().min(1).max(256).default(16),
			/** Hook and route calls per minute; beyond it calls are dropped (hooks) or answered 429 (routes). */
			callsPerMinute: z.number().int().min(1).max(6000).default(120),
		})
		.default({ timeoutMs: 2000, memoryMb: 16, callsPerMinute: 120 }),
});

export type Manifest = z.output<typeof manifestSchema>;

/** Identity helper so plugin authors get types and autocomplete. */
export const definePlugin = <T extends Partial<Record<HookName, (event: never, ctx: never) => unknown>>>(plugin: T) =>
	plugin;

export const canReadContent = (m: Manifest, collection: string): boolean =>
	m.capabilities.content.read.includes(collection);

export const canWriteContent = (m: Manifest, collection: string): boolean =>
	m.capabilities.content.write.includes(collection);

export const canReadSecret = (m: Manifest, name: string): boolean => m.capabilities.secrets.includes(name);

/** Plugin settings with the manifest's defaults filled in and wrong types dropped. */
export function resolveSettings(
	m: Manifest,
	stored: Record<string, unknown> = {},
): Record<string, string | boolean | number> {
	const out: Record<string, string | boolean | number> = {};
	for (const field of m.settings) {
		const value = stored[field.key];
		if (typeof value === field.type) out[field.key] = value as string | boolean | number;
		else if (field.default !== undefined && typeof field.default === field.type) out[field.key] = field.default;
	}
	return out;
}

const canonical = (value: unknown): string =>
	Array.isArray(value)
		? `[${value.map(canonical).join(",")}]`
		: value && typeof value === "object"
			? `{${Object.keys(value)
					.toSorted()
					.map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
					.join(",")}}`
			: JSON.stringify(value);

/**
 * What the site owner approves: the parsed capabilities. Capabilities added after the first release are left out while
 * they are empty, so a plugin approved before they existed keeps its hash; a plugin that now uses them gets a new one.
 */
export function capabilityHash(manifest: unknown): string {
	const { content, network, secrets, email } = manifestSchema.parse(manifest).capabilities;
	const caps: Record<string, unknown> = { content: { read: content.read }, network };
	if (content.write.length) (caps.content as Record<string, unknown>).write = content.write;
	if (secrets.length) caps.secrets = secrets;
	if (email) caps.email = true;
	return createHash("sha256").update(canonical(caps)).digest("hex");
}

export function canRoute(m: Manifest, method: string, path: string): boolean {
	return m.routes.some(
		(route) =>
			route.methods.includes(method.toUpperCase() as never) &&
			(path === route.path || path.startsWith(route.path.endsWith("/") ? route.path : `${route.path}/`)),
	);
}

export function canFetch(m: Manifest, rawUrl: string, method: string): boolean {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return false;
	}
	if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
	// Reject encoded or dot-segment tricks before prefix matching: the path must already be canonical.
	if (/%2e|%2f|%5c|\/\.\.?(\/|$)/i.test(rawUrl.slice(rawUrl.indexOf(url.host) + url.host.length))) return false;
	return m.capabilities.network.some(
		(rule) =>
			rule.host.toLowerCase() === url.hostname &&
			rule.methods.includes(method.toUpperCase() as never) &&
			rule.paths.some((p) => url.pathname.startsWith(p)),
	);
}
