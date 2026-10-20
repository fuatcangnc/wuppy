import { ROLES, type PendingInvitation, type Permission, type Role } from "@wuppy/auth";
import type { Manifest } from "@wuppy/plugin-types";
import { canRoute } from "@wuppy/plugin-types";
import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import { buildDashboard } from "../dashboard/index.ts";
import { dataDefaults, dataNames, dataSchemas, settingsSchema, type DataName } from "../data/schemas.ts";
import type { JsonStore } from "../data/store.ts";
import { exportContent, importContent } from "../transfer/index.ts";
import type { ContentService } from "../content/service.ts";
import type { AuditLog } from "../audit/index.ts";
import type { CommentService, CommentStatus } from "../comments/index.ts";
import { translationStatus } from "../i18n/index.ts";
import { MAX_UPLOAD_BYTES, type MediaService } from "../media/index.ts";
import type { RedirectService } from "../redirects/service.ts";
import { ApiError, onError } from "./errors.ts";

export interface User {
	id: string;
	permissions: readonly string[];
}

export interface AppOptions {
	service: ContentService;
	media: MediaService;
	json: JsonStore;
	comments: CommentService;
	redirects: RedirectService;
	userCount: () => number;
	/** Loaded plugin ids and load errors (fail-closed diagnostics). */
	plugins?: { loaded: string[]; errors: string[] };
	/** Loaded plugin manifests and route bridge. */
	pluginManifests?: Manifest[];
	pluginRequest?: (
		id: string,
		method: string,
		path: string,
		body?: string,
	) => Promise<{ status: number; headers?: Record<string, string>; body: string } | null>;
	/** API token store (Bearer authentication). */
	tokens?: import("../security/api-tokens.ts").ApiTokenService;
	/** Clear a user's TOTP secret and active sessions. Used by the user-management screen. */
	resetTwoFactor?: (userId: string) => { email: string; deleted: boolean } | null;
	/** Create an invitation and email the accept link. */
	inviteUser?: (input: {
		email: string;
		role: Role;
		invitedBy: string;
	}) => Promise<
		{ ok: true; email: string; role: Role; expiresAt: string } | { ok: false; code: "USER_EXISTS" | "EMAIL_FAILED" }
	>;
	listInvitations?: () => PendingInvitation[];
	revokeInvitation?: (id: string) => boolean;
	/** Apply the invited role to the signed-in user and consume the token. */
	acceptInvitation?: (input: { token: string; userId: string }) => { email: string; role: Role } | null;
	/** Configured locales, for the translation overview. */
	locales?: string[];
	audit?: AuditLog;
	/** Resolve the caller (session/token). Returning null means unauthenticated. */
	getUser: (req: Request) => Promise<User | null>;
}

type Env = { Variables: { user: User } };

export const CSRF_HEADER = "X-Wuppy-Request";
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

const csrf: MiddlewareHandler = async (c, next) => {
	if (!SAFE.has(c.req.method) && c.req.header(CSRF_HEADER) !== "1") {
		throw new ApiError(403, "CSRF", `Missing ${CSRF_HEADER} header`);
	}
	await next();
};

const hardenHeaders: MiddlewareHandler = async (c, next) => {
	c.header("Cache-Control", "no-store");
	c.header("X-Content-Type-Options", "nosniff");
	await next();
};

const documentSchema = z.object({
	data: z.record(z.string(), z.unknown()),
	body: z.string(),
	message: z.string().min(1).max(200).optional(),
});

const createDocumentSchema = documentSchema.extend({
	slug: z.string().min(1).max(500),
});

const invitationSchema = z.object({
	email: z.string().trim().email().max(200),
	role: z.string().refine((value) => (ROLES as readonly string[]).includes(value), "Invalid role"),
});

const acceptInvitationSchema = z.object({
	token: z.string().min(1).max(200),
});

const SHA = /^[0-9a-f]{7,40}$/i;

const need =
	(perm: Permission): MiddlewareHandler<Env> =>
	async (c, next) => {
		if (!c.get("user").permissions.includes(perm)) throw new ApiError(403, "FORBIDDEN", "Not allowed");
		await next();
	};

const sha = (value: string) => {
	if (!SHA.test(value)) throw new ApiError(400, "BAD_REQUEST", "Invalid sha");
	return value;
};

const readPermissions: Record<DataName, Permission> = {
	settings: "site:settings",
	menus: "menus:manage",
	widgets: "widgets:manage",
	sections: "sections:manage",
	taxonomies: "taxonomies:manage",
	bylines: "bylines:manage",
	"byline-schema": "bylines:manage",
	themes: "themes:manage",
	"content-types": "content-types:manage",
	webhooks: "site:settings",
};

const isDataName = (value: string): value is DataName => (dataNames as string[]).includes(value);

const commentStatus = z.enum(["pending", "approved", "spam", "trash"]);

const publicCommentSchema = z.object({
	author: z.string().trim().min(1).max(100),
	email: z.string().trim().email().max(200).optional().or(z.literal("")),
	body: z.string().trim().min(1).max(5000),
	/** Honeypot: a real browser leaves this empty. */
	website: z.string().max(0).optional().or(z.literal("")),
});

const wordpressImportSchema = z.object({
	xml: z.string().min(1),
	collection: z.string().min(1),
});

function xmlTag(block: string, name: string): string {
	const match = new RegExp(
		`<${name}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${name}>|<${name}[^>]*>([\\s\\S]*?)</${name}>`,
	).exec(block);
	return match ? (match[1] ?? match[2] ?? "").trim() : "";
}

const commentAttempts = new Map<string, { count: number; reset: number }>();

function allowComment(ip: string): boolean {
	const now = Date.now();
	const entry = commentAttempts.get(ip);
	if (!entry || entry.reset <= now) {
		commentAttempts.set(ip, { count: 1, reset: now + 60_000 });
		return true;
	}
	if (entry.count >= 5) return false;
	entry.count++;
	return true;
}

export function createApp({
	service,
	media,
	json,
	comments,
	redirects,
	userCount,
	plugins = { loaded: [], errors: [] },
	pluginManifests = [],
	pluginRequest,
	tokens,
	resetTwoFactor,
	inviteUser,
	listInvitations,
	revokeInvitation,
	acceptInvitation,
	locales = [],
	audit,
	getUser,
}: AppOptions) {
	const auth: MiddlewareHandler<Env> = async (c, next) => {
		const user = await getUser(c.req.raw);
		if (!user) throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
		c.set("user", user);
		await next();
	};

	const app = new Hono<Env>().onError(onError);

	// Public, unauthenticated surfaces. Registered before the auth middleware.
	app.get("/api/public/comments/:collection/:slug{.+}", async (c) => {
		const settings = settingsSchema.parse(await json.read("settings", dataDefaults.settings));
		if (!settings.comments.enabled) return c.json({ data: [] });
		return c.json({ data: comments.forEntry(c.req.param("collection"), c.req.param("slug")) });
	});
	app.post("/api/public/comments/:collection/:slug{.+}", csrf, async (c) => {
		const settings = settingsSchema.parse(await json.read("settings", dataDefaults.settings));
		if (!settings.comments.enabled) throw new ApiError(403, "COMMENTS_CLOSED", "Comments are closed");
		const body = publicCommentSchema.parse(await c.req.json().catch(() => undefined));
		if (body.website) throw new ApiError(422, "SPAM", "Comment rejected");
		const ip = c.req.header("x-wuppy-client-ip") ?? "unknown";
		if (!allowComment(ip)) throw new ApiError(429, "RATE_LIMITED", "Too many comments");
		const comment = comments.create({
			collection: c.req.param("collection"),
			slug: c.req.param("slug"),
			author: body.author,
			email: body.email || undefined,
			body: body.body,
			ip,
			moderated: settings.comments.moderated,
		});
		return c.json({ data: { id: comment.id, status: comment.status } }, 201);
	});
	app.all("/api/plugins/:id/*", csrf, async (c) => {
		const id = c.req.param("id");
		const manifest = pluginManifests.find((item) => item.id === id);
		if (!manifest || !pluginRequest) throw new ApiError(404, "NOT_FOUND", "Plugin not found");
		const path = c.req.path.slice(`/api/plugins/${id}`.length) || "/";
		if (!canRoute(manifest, c.req.method, path)) throw new ApiError(404, "NOT_FOUND", "Plugin route not declared");
		const body = ["GET", "HEAD"].includes(c.req.method) ? undefined : await c.req.text();
		const result = await pluginRequest(id, c.req.method, path, body);
		if (!result) throw new ApiError(404, "NOT_FOUND", "Plugin not loaded");
		const headers: Record<string, string> = {
			"content-type": "application/json; charset=utf-8",
			"x-content-type-options": "nosniff",
		};
		if (result.headers?.["content-type"]) headers["content-type"] = result.headers["content-type"];
		return new Response(result.body, { status: result.status, headers });
	});

	return app
		.use("/api/*", hardenHeaders, csrf, auth)
		.get("/api/collections", need("content:read"), (c) => c.json({ data: service.collections }))
		.get("/api/dashboard", need("content:read"), async (c) =>
			c.json({ data: await buildDashboard(service, media, userCount) }),
		)
		.get("/api/plugins", need("plugins:manage"), (c) => c.json({ data: { ...plugins, manifests: pluginManifests } }))
		.get("/api/tokens", need("users:manage"), (c) => c.json({ data: tokens?.list() ?? [] }))
		.post("/api/tokens", need("users:manage"), async (c) => {
			if (!tokens) throw new ApiError(500, "NOT_CONFIGURED", "Token store unavailable");
			const body = (await c.req.json().catch(() => undefined)) as
				{ name?: string; userId?: string; permissions?: string[]; expiresAt?: string } | undefined;
			const name = z.string().trim().min(1).max(80).parse(body?.name);
			const permissions = z
				.array(z.string())
				.max(100)
				.parse(body?.permissions ?? c.get("user").permissions);
			const created = tokens.create({
				name,
				userId: body?.userId ?? c.get("user").id,
				permissions,
				expiresAt: body?.expiresAt ?? null,
			});
			return c.json({ data: created }, 201);
		})
		.delete("/api/tokens/:id", need("users:manage"), (c) => {
			if (!tokens?.revoke(c.req.param("id"))) throw new ApiError(404, "NOT_FOUND", "Token not found");
			return c.json({ data: { ok: true } });
		})
		.post("/api/users/:id/reset-two-factor", need("users:manage"), (c) => {
			const userId = c.req.param("id");
			if (userId === c.get("user").id) {
				throw new ApiError(400, "SELF", "Use Account security to reset your own two-factor authentication");
			}
			if (!resetTwoFactor) throw new ApiError(500, "NOT_CONFIGURED", "User security store unavailable");
			const result = resetTwoFactor(userId);
			if (!result) throw new ApiError(404, "NOT_FOUND", "User not found");
			if (!result.deleted) throw new ApiError(400, "NOT_ENABLED", "Two-factor authentication is not enabled");
			audit?.record({
				type: "user.reset_2fa",
				ok: true,
				actor: c.get("user").id,
				email: result.email,
				at: new Date().toISOString(),
			});
			return c.json({ data: { ok: true } });
		})
		.get("/api/invitations", need("users:manage"), (c) => c.json({ data: listInvitations?.() ?? [] }))
		.post("/api/invitations", need("users:manage"), async (c) => {
			if (!inviteUser) throw new ApiError(500, "NOT_CONFIGURED", "Invitation store unavailable");
			const body = invitationSchema.parse(await c.req.json().catch(() => undefined));
			const result = await inviteUser({
				email: body.email,
				role: body.role as Role,
				invitedBy: c.get("user").id,
			});
			if (!result.ok) {
				if (result.code === "USER_EXISTS") {
					throw new ApiError(409, "USER_EXISTS", "A user with this email already exists");
				}
				throw new ApiError(502, "EMAIL_FAILED", "The invitation could not be emailed");
			}
			audit?.record({
				type: "user.invite",
				ok: true,
				actor: c.get("user").id,
				email: result.email,
				at: new Date().toISOString(),
			});
			return c.json({ data: { email: result.email, role: result.role, expiresAt: result.expiresAt } }, 201);
		})
		.delete("/api/invitations/:id", need("users:manage"), (c) => {
			if (!revokeInvitation?.(c.req.param("id"))) {
				throw new ApiError(404, "NOT_FOUND", "Invitation not found");
			}
			return c.json({ data: { ok: true } });
		})
		.post("/api/invitations/accept", async (c) => {
			if (!acceptInvitation) throw new ApiError(500, "NOT_CONFIGURED", "Invitation store unavailable");
			const body = acceptInvitationSchema.parse(await c.req.json().catch(() => undefined));
			const result = acceptInvitation({ token: body.token, userId: c.get("user").id });
			if (!result) throw new ApiError(400, "INVALID_INVITATION", "Invitation is invalid or expired");
			audit?.record({
				type: "user.invite_accept",
				ok: true,
				actor: c.get("user").id,
				email: result.email,
				at: new Date().toISOString(),
			});
			return c.json({ data: { ok: true, role: result.role } });
		})
		.get("/api/calendar", need("content:read"), async (c) => {
			const from = c.req.query("from");
			const to = c.req.query("to");
			const start = from ? new Date(from).getTime() : 0;
			const end = to ? new Date(to).getTime() : Number.MAX_SAFE_INTEGER;
			const items = [];
			for (const collection of service.collections) {
				for (const entry of await service.listEntries(collection.name)) {
					const raw = entry.data.publishAt ?? entry.data.date;
					if (!raw) continue;
					const at = new Date(String(raw)).getTime();
					if (!Number.isFinite(at) || at < start || at > end) continue;
					items.push({
						collection: collection.name,
						slug: entry.slug,
						title: typeof entry.data.title === "string" ? entry.data.title : entry.slug,
						status: entry.data.draft === true ? (at > Date.now() ? "scheduled" : "draft") : "published",
						at: new Date(at).toISOString(),
					});
				}
			}
			return c.json({ data: items.toSorted((a, b) => a.at.localeCompare(b.at)) });
		})
		.get("/api/search", need("content:read"), async (c) => {
			const q = (c.req.query("q") ?? "").trim().toLowerCase();
			if (q.length < 2) return c.json({ data: [] });
			const hits = [];
			for (const collection of service.collections) {
				for (const entry of await service.listEntries(collection.name)) {
					const title = typeof entry.data.title === "string" ? entry.data.title : entry.slug;
					if (!`${title}\n${entry.body}`.toLowerCase().includes(q)) continue;
					hits.push({
						collection: collection.name,
						slug: entry.slug,
						title,
						excerpt: entry.body.replace(/\s+/g, " ").slice(0, 160),
					});
					if (hits.length >= 50) break;
				}
			}
			return c.json({ data: hits });
		})
		.get("/api/content/:collection", need("content:read"), async (c) =>
			c.json({ data: await service.listEntries(c.req.param("collection")) }),
		)
		.get("/api/content/:collection/:slug{.+}", need("content:read"), async (c) => {
			const entry = await service.get(c.req.param("collection"), c.req.param("slug"));
			if (!entry) throw new ApiError(404, "NOT_FOUND", "Entry not found");
			return c.json({ data: entry });
		})
		.post("/api/content/:collection", need("content:write"), async (c) => {
			const { slug, message, ...doc } = createDocumentSchema.parse(await c.req.json().catch(() => undefined));
			if (!c.get("user").permissions.includes("content:publish") && doc.data.draft !== true) {
				throw new ApiError(403, "FORBIDDEN", "Authors can only save drafts");
			}
			await service.create(c.req.param("collection"), slug, doc, message);
			return c.json({ data: { ok: true, slug } }, 201);
		})
		.put("/api/content/:collection/:slug{.+}", need("content:write"), async (c) => {
			const { message, ...doc } = documentSchema.parse(await c.req.json().catch(() => undefined));
			if (!c.get("user").permissions.includes("content:publish")) {
				const existing = await service.get(c.req.param("collection"), c.req.param("slug"));
				if ((existing && existing.data.draft !== true) || doc.data.draft !== true) {
					throw new ApiError(403, "FORBIDDEN", "Authors can only save drafts");
				}
			}
			await service.put(c.req.param("collection"), c.req.param("slug"), doc, message);
			return c.json({ data: { ok: true } });
		})
		.delete("/api/content/:collection/:slug{.+}", need("content:delete"), async (c) => {
			await service.trash(c.req.param("collection"), c.req.param("slug"));
			return c.json({ data: { ok: true } });
		})
		.post("/api/content/:collection/:slug{.+}/duplicate", need("content:write"), async (c) => {
			const collection = c.req.param("collection");
			const slug = c.req.param("slug");
			const entry = await service.get(collection, slug);
			if (!entry) throw new ApiError(404, "NOT_FOUND", "Entry not found");
			let copy = `${slug}-copy`;
			let index = 2;
			while (await service.get(collection, copy)) copy = `${slug}-copy-${index++}`;
			await service.put(
				collection,
				copy,
				{ data: { ...entry.data, title: `${String(entry.data.title ?? slug)} (copy)`, draft: true }, body: entry.body },
				`content: duplicate ${collection}/${slug}`,
			);
			return c.json({ data: { slug: copy } }, 201);
		})
		.get("/api/trash", need("content:read"), async (c) => c.json({ data: await service.listTrash() }))
		.post("/api/trash/restore", need("content:delete"), async (c) => {
			const body = (await c.req.json().catch(() => undefined)) as { collection?: string; slug?: string } | undefined;
			const collection = z.string().min(1).parse(body?.collection);
			const slug = z.string().min(1).parse(body?.slug);
			if (!(await service.restore(collection, slug))) throw new ApiError(404, "NOT_FOUND", "Trashed entry not found");
			return c.json({ data: { ok: true } });
		})
		.delete("/api/trash", need("content:delete"), async (c) => {
			const collection = z.string().min(1).parse(c.req.query("collection"));
			const slug = z.string().min(1).parse(c.req.query("slug"));
			if (!(await service.deleteTrash(collection, slug)))
				throw new ApiError(404, "NOT_FOUND", "Trashed entry not found");
			return c.json({ data: { ok: true } });
		})
		.get("/api/data/:name", need("content:read"), async (c) => {
			const name = c.req.param("name");
			if (!isDataName(name)) throw new ApiError(404, "NOT_FOUND", "Unknown data file");
			if (!c.get("user").permissions.includes(readPermissions[name]) && name !== "settings") {
				throw new ApiError(403, "FORBIDDEN", "Not allowed");
			}
			const value = await json.read(name, dataDefaults[name]);
			return c.json({ data: dataSchemas[name].parse(value) });
		})
		.put("/api/data/:name", need("content:write"), async (c) => {
			const name = c.req.param("name");
			if (!isDataName(name)) throw new ApiError(404, "NOT_FOUND", "Unknown data file");
			if (!c.get("user").permissions.includes(readPermissions[name]))
				throw new ApiError(403, "FORBIDDEN", "Not allowed");
			const payload = (await c.req.json().catch(() => undefined)) as { data?: unknown } | undefined;
			const parsed = dataSchemas[name].parse(payload?.data);
			await json.write(name, parsed, `${name}: update`);
			return c.json({ data: parsed });
		})
		.get("/api/i18n/:collection", need("content:read"), async (c) =>
			c.json({ data: translationStatus(await service.list(c.req.param("collection")), locales), locales }),
		)
		.get("/api/comments", need("comments:read"), (c) => {
			const status = c.req.query("status");
			const parsed = status === "all" || !status ? "all" : commentStatus.parse(status);
			return c.json({ data: comments.list(parsed, Number(c.req.query("limit")) || 100), counts: comments.counts() });
		})
		.get("/api/comments/counts", need("comments:read"), (c) => c.json({ data: comments.counts() }))
		.patch("/api/comments/:id", need("comments:moderate"), async (c) => {
			const body = (await c.req.json().catch(() => undefined)) as { status?: string } | undefined;
			const status = commentStatus.parse(body?.status) as CommentStatus;
			if (!comments.setStatus(c.req.param("id"), status)) throw new ApiError(404, "NOT_FOUND", "Comment not found");
			return c.json({ data: { ok: true } });
		})
		.post("/api/comments/bulk", need("comments:moderate"), async (c) => {
			const body = (await c.req.json().catch(() => undefined)) as { ids?: string[]; status?: string } | undefined;
			const status = commentStatus.parse(body?.status) as CommentStatus;
			const ids = z.array(z.string()).parse(body?.ids);
			return c.json({ data: { changed: comments.bulk(ids, status) } });
		})
		.delete("/api/comments/:id", need("comments:moderate"), (c) => {
			if (!comments.delete(c.req.param("id"))) throw new ApiError(404, "NOT_FOUND", "Comment not found");
			return c.json({ data: { ok: true } });
		})
		.get("/api/redirects", need("menus:manage"), async (c) => c.json({ data: await redirects.list() }))
		.put("/api/redirects", need("menus:manage"), async (c) => {
			const body = (await c.req.json().catch(() => undefined)) as { data?: unknown } | undefined;
			await redirects.save(body?.data as Parameters<RedirectService["save"]>[0]);
			return c.json({ data: await redirects.list() });
		})
		.get("/api/redirects/404", need("menus:manage"), (c) => c.json({ data: redirects.list404() }))
		.delete("/api/redirects/404", need("menus:manage"), (c) => {
			redirects.clear404(c.req.query("path"));
			return c.json({ data: { ok: true } });
		})
		.get("/api/export", need("site:transfer"), async (c) =>
			c.json(await exportContent(service), 200, { "content-disposition": 'attachment; filename="wuppy-content.json"' }),
		)
		.post("/api/import", need("site:transfer"), async (c) => {
			if (Number(c.req.header("content-length")) > MAX_IMPORT_BYTES)
				throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Bundle too large");
			let bundle: unknown;
			try {
				bundle = await c.req.json();
			} catch {
				throw new ApiError(422, "VALIDATION_ERROR", "Body must be JSON");
			}
			try {
				return c.json({ data: await importContent(service, bundle) });
			} catch (e) {
				throw new ApiError(422, "VALIDATION_ERROR", (e as Error).message);
			}
		})
		.post("/api/import/wordpress", need("import:run"), async (c) => {
			const body = wordpressImportSchema.parse(await c.req.json().catch(() => undefined));
			const items = [...body.xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 500);
			let imported = 0;
			const errors: string[] = [];
			for (const [, block] of items) {
				const slug =
					xmlTag(block!, "wp:post_name") ||
					xmlTag(block!, "title")
						.toLowerCase()
						.replace(/[^a-z0-9]+/g, "-")
						.replace(/^-|-$/g, "");
				const title = xmlTag(block!, "title");
				const bodyHtml = xmlTag(block!, "content:encoded");
				if (!slug || !title) continue;
				try {
					await service.put(
						body.collection,
						slug,
						{
							data: {
								title,
								date: xmlTag(block!, "wp:post_date") || new Date().toISOString(),
								draft: xmlTag(block!, "wp:status") !== "publish",
							},
							body: bodyHtml
								.replace(/<[^>]+>/g, "")
								.replace(/\n{3,}/g, "\n\n")
								.trim(),
						},
						`import: ${slug}`,
					);
					imported++;
				} catch (e) {
					errors.push(`${slug}: ${(e as Error).message}`);
				}
			}
			return c.json({ data: { imported, skipped: items.length - imported, errors } });
		})
		.get("/api/audit", need("audit:read"), (c) =>
			c.json({ data: audit?.list(Number(c.req.query("limit")) || 100) ?? [] }),
		)
		.get("/api/media", need("content:read"), async (c) => c.json({ data: await media.list() }))
		.get("/api/media/folders", need("content:read"), async (c) => c.json({ data: await media.folders() }))
		.get("/api/media/usage", need("content:read"), async (c) => {
			const url = c.req.query("url");
			if (!url) throw new ApiError(422, "VALIDATION_ERROR", "Missing url");
			const usedIn = [];
			for (const collection of service.collections) {
				for (const entry of await service.listEntries(collection.name)) {
					if (`${JSON.stringify(entry.data)}\n${entry.body}`.includes(url)) {
						usedIn.push({
							collection: collection.name,
							slug: entry.slug,
							title: typeof entry.data.title === "string" ? entry.data.title : entry.slug,
						});
					}
				}
			}
			return c.json({ data: usedIn });
		})
		.put("/api/media/folders", need("media:write"), async (c) => {
			const body = (await c.req.json().catch(() => undefined)) as { folders?: string[] } | undefined;
			const folders = z
				.array(
					z
						.string()
						.trim()
						.min(1)
						.max(80)
						.regex(/^[^/\\]+$/),
				)
				.max(100)
				.parse(body?.folders);
			await media.saveFolders(folders);
			return c.json({ data: folders });
		})
		.patch("/api/media/meta", need("media:write"), async (c) => {
			const url = c.req.query("url");
			if (!url) throw new ApiError(422, "VALIDATION_ERROR", "Missing url");
			const body = (await c.req.json().catch(() => undefined)) as Record<string, unknown> | undefined;
			const patch = z
				.object({
					alt: z.string().max(500).optional(),
					title: z.string().max(500).optional(),
					caption: z.string().max(2000).optional(),
					folder: z.string().max(80).optional(),
					focalX: z.number().min(0).max(100).optional(),
					focalY: z.number().min(0).max(100).optional(),
				})
				.parse(body ?? {});
			return c.json({ data: await media.update(url, patch) });
		})
		.post("/api/media", need("media:write"), async (c) => {
			if (Number(c.req.header("content-length")) > MAX_UPLOAD_BYTES + 64 * 1024) {
				throw new ApiError(413, "PAYLOAD_TOO_LARGE", "File too large");
			}
			const form = await c.req.parseBody();
			const file = form["file"];
			if (!(file instanceof File)) throw new ApiError(422, "VALIDATION_ERROR", "Expected a multipart `file` field");
			const alt = typeof form["alt"] === "string" ? form["alt"] : undefined;
			const folder = typeof form["folder"] === "string" ? form["folder"] : undefined;
			return c.json({ data: await media.upload(new Uint8Array(await file.arrayBuffer()), { alt, folder }) });
		})
		.delete("/api/media", need("media:delete"), async (c) => {
			const url = c.req.query("url");
			if (!url) throw new ApiError(422, "VALIDATION_ERROR", "Missing url");
			await media.delete(url);
			return c.json({ data: { ok: true } });
		})
		.get("/api/history/:collection/:slug{.+}", need("git:read"), async (c) =>
			c.json({ data: await service.history(c.req.param("collection"), c.req.param("slug")) }),
		)
		.get("/api/commits/:sha/diff", need("git:read"), async (c) =>
			c.json({ data: await service.diff(sha(c.req.param("sha"))) }),
		)
		.post("/api/commits/:sha/revert", need("git:revert"), async (c) =>
			c.json({ data: { sha: await service.revert(sha(c.req.param("sha"))) } }),
		);
}

export type AppType = ReturnType<typeof createApp>;
