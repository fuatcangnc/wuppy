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
	capabilities: z
		.object({
			content: z.object({ read: z.array(z.string()).default([]) }).default({ read: [] }),
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
		.default({ content: { read: [] }, network: [] }),
	limits: z
		.object({
			timeoutMs: z.number().int().min(50).max(30_000).default(2000),
			memoryMb: z.number().int().min(1).max(256).default(16),
		})
		.default({ timeoutMs: 2000, memoryMb: 16 }),
});

export type Manifest = z.output<typeof manifestSchema>;

/** Identity helper so plugin authors get types and autocomplete. */
export const definePlugin = <T extends Partial<Record<HookName, (event: never, ctx: never) => unknown>>>(plugin: T) =>
	plugin;

export const canReadContent = (m: Manifest, collection: string): boolean =>
	m.capabilities.content.read.includes(collection);

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
