import { PERMISSIONS, permissionsFor, ROLES, type PendingInvitation, type Permission, type Role } from "@wuppy/auth";
import { canRoute } from "@wuppy/plugin-types";
import type { PluginManager } from "../plugins/manager.ts";
import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import { buildDashboard } from "../dashboard/index.ts";
import {
	dataDefaults,
	dataNames,
	dataSchemas,
	settingsSchema,
	type Byline,
	type DataName,
	type Taxonomy,
} from "../data/schemas.ts";
import type { JsonStore } from "../data/store.ts";
import { EditLocks } from "../content/locks.ts";
import { AutosaveStore } from "../content/autosave.ts";
import { diffFields } from "../content/field-diff.ts";
import { signPreview } from "../publishing/index.ts";
import type { BackupService } from "../transfer/backups.ts";
import { exportContent, importContent } from "../transfer/index.ts";
import type { ContentService } from "../content/service.ts";
import type { AuditLog } from "../audit/index.ts";
import type { CommentService, CommentStatus } from "../comments/index.ts";
import { DEFAULT_TEMPLATES, EMAIL_VARIABLES } from "../email/templates.ts";
import type { EmailSender } from "../email/index.ts";
import { parseRedirectsCsv, redirectsSchema, redirectsToCsv } from "../redirects/index.ts";
import { translationStatus } from "../i18n/index.ts";
import { MAX_UPLOAD_BYTES, type MediaService } from "../media/index.ts";
import type { RedirectService } from "../redirects/service.ts";
import { ApiError, onError } from "./errors.ts";
import { buildOpenApi } from "./openapi.ts";
import { SearchIndex } from "../search/index.ts";
import { idempotency, writeRateLimit } from "./guards.ts";
import { redact } from "../security/redact.ts";
import { etagOf, queryEntries } from "./list.ts";
import { schemaImpact } from "../content-types/impact.ts";
import { validateBylines } from "../bylines/index.ts";
import { entryStatus } from "../publishing/index.ts";
import { importOptionsSchema, type ImportJobs } from "../import/job.ts";
import { collectionSchema, fieldKind } from "../content-types/index.ts";
import { retagEntries, termCounts } from "../taxonomies/index.ts";

export interface User {
	id: string;
	/** Shown to colleagues (e.g. who holds an edit lock). */
	name?: string;
	permissions: readonly string[];
}

export interface AppOptions {
	service: ContentService;
	media: MediaService;
	json: JsonStore;
	comments: CommentService;
	redirects: RedirectService;
	userCount: () => number;
	/** Runtime plugin management and the route bridge. */
	pluginManager?: PluginManager;
	/** WordPress imports; without it the import endpoints answer NOT_ENABLED. */
	imports?: ImportJobs;
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
	backups?: BackupService;
	/** Unsaved-work recovery copies. */
	autosave?: AutosaveStore;
	/** Sends comment notifications. Failures are logged, never shown to the commenter. */
	sendEmail?: EmailSender;
	/** Signs preview links; without it preview links are unavailable. */
	previewSecret?: string;
	/** Resolve the caller (session/token). Returning null means unauthenticated. */
	getUser: (req: Request) => Promise<User | null>;
}

type Env = { Variables: { user: User } };

export const CSRF_HEADER = "X-Wuppy-Request";
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const MAX_WXR_BYTES = 50 * 1024 * 1024;
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

/** `a` or `a/b/c`: up to three levels, no empty or dot segments. */
const folderName = z
	.string()
	.trim()
	.max(120)
	.regex(/^[^/\\.][^/\\]*(\/[^/\\.][^/\\]*){0,2}$/);

const redirectKey = (r: { match: string; from: string }) => `${r.match}\n${r.from}`;

const SECRET_MASK = "********";
type WebhookRow = { url: string; secret?: string | undefined; events?: string[] };
const maskSecrets = (rows: WebhookRow[]) => rows.map((h) => (h.secret ? { ...h, secret: SECRET_MASK } : h));

const isDataName = (value: string): value is DataName => (dataNames as string[]).includes(value);

const commentStatus = z.enum(["pending", "approved", "spam", "trash"]);

const publicCommentSchema = z.object({
	author: z.string().trim().min(1).max(100),
	email: z.string().trim().email().max(200).optional().or(z.literal("")),
	body: z.string().trim().min(1).max(5000),
	/** Honeypot: a real browser leaves this empty. */
	website: z.string().max(0).optional().or(z.literal("")),
});

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
	pluginManager,
	imports,
	tokens,
	resetTwoFactor,
	inviteUser,
	listInvitations,
	revokeInvitation,
	acceptInvitation,
	locales = [],
	audit,
	backups,
	autosave,
	sendEmail,
	previewSecret,
	getUser,
}: AppOptions) {
	const record = (c: { get: (k: "user") => User }, type: string, extra: { email?: string } = {}) =>
		audit?.record({ type, ok: true, actor: c.get("user").id, at: new Date().toISOString(), ...extra });

	/** Every text the site is built from: entries plus the site data files (menus, bylines, settings…). */
	const entryTexts = async () => {
		const out: { collection: string; slug: string; title: string; text: string }[] = [];
		for (const collection of service.collections) {
			for (const entry of await service.listEntries(collection.name)) {
				out.push({
					collection: collection.name,
					slug: entry.slug,
					title: typeof entry.data.title === "string" ? entry.data.title : entry.slug,
					text: `${JSON.stringify(entry.data)}\n${entry.body}`,
				});
			}
		}
		return out;
	};
	const mediaUsage = async (url: string) =>
		(await entryTexts()).filter((e) => e.text.includes(url)).map(({ text: _text, ...rest }) => rest);
	const mediaUrlsForEntry = async (collection: string, slug: string) => {
		const entry = (await entryTexts()).find((item) => item.collection === collection && item.slug === slug);
		if (!entry) return null;
		return (await media.list()).filter((item) => entry.text.includes(item.url)).map((item) => item.url);
	};
	const orphans = async () => {
		const texts = (await entryTexts()).map((e) => e.text);
		for (const name of dataNames) texts.push(JSON.stringify(await json.read(name, null)));
		const haystack = texts.join("\n");
		return (await media.list()).filter((m) => !haystack.includes(m.url));
	};
	const auth: MiddlewareHandler<Env> = async (c, next) => {
		const user = await getUser(c.req.raw);
		if (!user) throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
		c.set("user", user);
		await next();
	};

	const searchIndex = new SearchIndex(service);
	const locks = new EditLocks();
	const app = new Hono<Env>().onError(onError);

	// Public, unauthenticated surfaces. Registered before the auth middleware.
	app.get("/api/public/comments/:collection/:slug{.+}", async (c) => {
		const settings = settingsSchema.parse(await json.read("settings", dataDefaults.settings));
		if (!settings.comments.enabled) return c.json({ data: [] });
		// Public view: never expose commenters' email addresses.
		return c.json({
			data: comments
				.forEntry(c.req.param("collection"), c.req.param("slug"))
				.map(({ id, author, body, createdAt, parentId, staff }) => ({ id, author, body, createdAt, parentId, staff })),
		});
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
		if (settings.comments.notifyEmail && sendEmail) {
			void sendEmail({
				to: settings.comments.notifyEmail,
				subject: `New comment on ${comment.collection}/${comment.slug}`,
				text: `${comment.author} wrote${comment.status === "pending" ? " (awaiting moderation)" : ""}:\n\n${comment.body}`,
			}).catch((e: Error) => console.error(redact(`comment notification failed: ${e.message}`)));
		}
		return c.json({ data: { id: comment.id, status: comment.status } }, 201);
	});
	app.all("/api/plugins/:id/*", csrf, async (c) => {
		const id = c.req.param("id");
		const manifest = pluginManager?.manifest(id);
		if (!manifest || !pluginManager) throw new ApiError(404, "NOT_FOUND", "Plugin not found");
		const path = c.req.path.slice(`/api/plugins/${id}`.length) || "/";
		if (!canRoute(manifest, c.req.method, path)) throw new ApiError(404, "NOT_FOUND", "Plugin route not declared");
		const body = ["GET", "HEAD"].includes(c.req.method) ? undefined : await c.req.text();
		const result = await pluginManager.request(id, c.req.method, path, body);
		if (!result) throw new ApiError(404, "NOT_FOUND", "Plugin not loaded");
		const headers: Record<string, string> = {
			"content-type": "application/json; charset=utf-8",
			"x-content-type-options": "nosniff",
		};
		if (result.headers?.["content-type"]) headers["content-type"] = result.headers["content-type"];
		return new Response(result.body, { status: result.status, headers });
	});

	return app
		.use("/api/*", hardenHeaders, csrf, auth, writeRateLimit(), idempotency())
		.get("/api/editor/components", need("content:read"), (c) => c.json({ data: service.allowedComponents }))
		.get("/api/collections", need("content:read"), (c) => c.json({ data: service.collections }))
		.get("/api/dashboard", need("content:read"), async (c) =>
			c.json({ data: await buildDashboard(service, media, userCount) }),
		)
		.get("/api/plugins", need("plugins:manage"), (c) => {
			const rows = pluginManager?.statuses() ?? [];
			return c.json({
				data: {
					plugins: rows,
					loaded: rows.filter((r) => r.state === "active" || r.state === "disabled").map((r) => r.id),
					errors: rows.flatMap((r) => (r.error ? [r.error] : [])),
					manifests: rows.flatMap((r) => (r.manifest ? [r.manifest] : [])),
				},
			});
		})
		.post("/api/plugin-admin/approve", need("plugins:manage"), async (c) => {
			const body = z
				.object({ dir: z.string().min(1).max(200), hash: z.string().length(64) })
				.parse(await c.req.json().catch(() => undefined));
			if (!(await pluginManager?.approve(body.dir, body.hash))) {
				throw new ApiError(409, "CONFLICT", "That plugin changed or is not waiting for approval; review it again");
			}
			record(c, "plugin.approve");
			return c.json({ data: { ok: true } });
		})
		.put("/api/plugin-admin/:id/enabled", need("plugins:manage"), async (c) => {
			const { enabled } = z.object({ enabled: z.boolean() }).parse(await c.req.json().catch(() => undefined));
			if (!(await pluginManager?.setEnabled(c.req.param("id"), enabled)))
				throw new ApiError(404, "NOT_FOUND", "Plugin not loaded");
			record(c, enabled ? "plugin.enable" : "plugin.disable");
			return c.json({ data: { ok: true } });
		})
		.get("/api/plugin-admin/:id/settings", need("plugins:manage"), (c) => {
			const found = pluginManager?.settingsOf(c.req.param("id"));
			if (!found) throw new ApiError(404, "NOT_FOUND", "Plugin not loaded");
			return c.json({ data: found });
		})
		.put("/api/plugin-admin/:id/settings", need("plugins:manage"), async (c) => {
			const body = (await c.req.json().catch(() => undefined)) as { values?: unknown } | undefined;
			const values = z.record(z.string(), z.unknown()).parse(body?.values);
			if (!pluginManager?.manifest(c.req.param("id"))) throw new ApiError(404, "NOT_FOUND", "Plugin not loaded");
			record(c, "plugin.settings");
			return c.json({ data: { values: await pluginManager.saveSettings(c.req.param("id"), values) } });
		})
		.get("/api/plugin-admin/:id/page/:index", need("plugins:manage"), async (c) => {
			const page = await pluginManager?.adminPage(c.req.param("id"), Number(c.req.param("index")));
			if (!page) throw new ApiError(404, "NOT_FOUND", "No such plugin page");
			return c.json({ data: page });
		})
		.delete("/api/plugin-admin", need("plugins:manage"), async (c) => {
			const dir = z.string().min(1).parse(c.req.query("dir"));
			if (!(await pluginManager?.remove(dir))) {
				throw new ApiError(
					409,
					"CONFLICT",
					"Only plugins installed from a registry can be removed here; others are listed in wuppy.config",
				);
			}
			record(c, "plugin.remove");
			return c.json({ data: { ok: true } });
		})
		.get("/api/registry", need("plugins:manage"), async (c) =>
			c.json({ data: (await pluginManager?.search(c.req.query("q") ?? "")) ?? { results: [], errors: [] } }),
		)
		.post("/api/registry/install", need("plugins:manage"), async (c) => {
			const body = z
				.object({ registry: z.string().min(1).max(60), id: z.string().min(1).max(60) })
				.parse(await c.req.json().catch(() => undefined));
			try {
				const result = await pluginManager?.install(body.registry, body.id);
				record(c, "plugin.install");
				return c.json({ data: result }, 201);
			} catch (e) {
				throw new ApiError(422, "VALIDATION_ERROR", redact((e as Error).message));
			}
		})
		.get("/api/roles", need("users:manage"), (c) =>
			c.json({
				data: { permissions: PERMISSIONS, roles: ROLES.map((name) => ({ name, permissions: permissionsFor(name) })) },
			}),
		)
		.get("/api/tokens", need("users:manage"), (c) => c.json({ data: tokens?.list() ?? [] }))
		.post("/api/tokens", need("users:manage"), async (c) => {
			if (!tokens) throw new ApiError(500, "NOT_CONFIGURED", "Token store unavailable");
			const body = z
				.object({
					name: z.string().trim().min(1).max(80),
					permissions: z.array(z.string()).max(100).optional(),
					expiresAt: z.iso
						.datetime()
						.refine((v) => new Date(v).getTime() > Date.now(), "Expiry must be in the future")
						.optional(),
				})
				.parse(await c.req.json().catch(() => undefined));
			const own = c.get("user").permissions;
			const permissions = body.permissions ?? [...own];
			// A token can narrow its owner's access, never widen it.
			if (permissions.some((p) => !own.includes(p as Permission)))
				throw new ApiError(403, "FORBIDDEN", "A token cannot have permissions its owner lacks");
			const created = tokens.create({
				name: body.name,
				userId: c.get("user").id,
				permissions,
				expiresAt: body.expiresAt ?? null,
			});
			record(c, "token.create");
			return c.json({ data: created }, 201);
		})
		.delete("/api/tokens/:id", need("users:manage"), (c) => {
			if (!tokens?.revoke(c.req.param("id"))) throw new ApiError(404, "NOT_FOUND", "Token not found");
			record(c, "token.revoke");
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
			const { allowedDomains } = settingsSchema.parse(await json.read("settings", dataDefaults.settings)).security;
			if (allowedDomains.length && !allowedDomains.includes(body.email.split("@").pop()!.toLowerCase())) {
				throw new ApiError(422, "DOMAIN_NOT_ALLOWED", `Invitations are limited to: ${allowedDomains.join(", ")}`);
			}
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
					const field = entry.data.publishAt ? "publishAt" : "date";
					const raw = entry.data[field];
					if (!raw) continue;
					const at = new Date(String(raw)).getTime();
					if (!Number.isFinite(at) || at < start || at > end) continue;
					items.push({
						collection: collection.name,
						slug: entry.slug,
						title: typeof entry.data.title === "string" ? entry.data.title : entry.slug,
						status: entryStatus(entry.data),
						field,
						at: new Date(at).toISOString(),
					});
				}
			}
			return c.json({ data: items.toSorted((a, b) => a.at.localeCompare(b.at)) });
		})
		.patch("/api/calendar/:collection/:slug{.+}", need("content:write"), async (c) => {
			const { collection, slug } = c.req.param();
			const { at } = z.object({ at: z.iso.datetime() }).parse(await c.req.json().catch(() => undefined));
			const entry = await service.get(collection, slug);
			if (!entry) throw new ApiError(404, "NOT_FOUND", "Entry not found");
			const field = entry.data.publishAt ? "publishAt" : "date";
			// A date-only value stays date-only.
			const value =
				typeof entry.data[field] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.data[field]) ? at.slice(0, 10) : at;
			await service.put(
				collection,
				slug,
				{ data: { ...entry.data, [field]: value }, body: entry.body },
				`calendar: move ${collection}/${slug}`,
			);
			record(c, "content.reschedule");
			return c.json({ data: { field, at: value } });
		})
		.get("/api/search", need("content:read"), async (c) => {
			const { q = "", collection, status } = c.req.query();
			return c.json({ data: await searchIndex.search({ q, collection, status }) });
		})
		.get("/api/content/:collection", need("content:read"), async (c) => {
			const { rows, ...page } = queryEntries(await service.listEntries(c.req.param("collection")), c.req.query());
			return c.json({ data: rows.map((row) => ({ ...row, status: entryStatus(row.data) })), ...page });
		})
		.get("/api/content/:collection/:slug{.+}", need("content:read"), async (c) => {
			const entry = await service.get(c.req.param("collection"), c.req.param("slug"));
			if (!entry) throw new ApiError(404, "NOT_FOUND", "Entry not found");
			const etag = etagOf(entry);
			c.header("ETag", etag);
			if (c.req.header("If-None-Match") === etag) return c.body(null, 304);
			return c.json({ data: entry, etag });
		})
		.post("/api/content/:collection", need("content:write"), async (c) => {
			const { slug, message, ...doc } = createDocumentSchema.parse(await c.req.json().catch(() => undefined));
			if (!c.get("user").permissions.includes("content:publish") && doc.data.draft !== true) {
				throw new ApiError(403, "FORBIDDEN", "Authors can only save drafts");
			}
			await service.create(c.req.param("collection"), slug, doc, message);
			await autosave?.delete(c.req.param("collection"), slug);
			const created = await service.get(c.req.param("collection"), slug);
			return c.json({ data: { ok: true, slug, ...(created ? { etag: etagOf(created) } : {}) } }, 201);
		})
		.put("/api/content/:collection/:slug{.+}", need("content:write"), async (c) => {
			const { message, ...doc } = documentSchema.parse(await c.req.json().catch(() => undefined));
			if (!c.get("user").permissions.includes("content:publish")) {
				const existing = await service.get(c.req.param("collection"), c.req.param("slug"));
				if ((existing && existing.data.draft !== true) || doc.data.draft !== true) {
					throw new ApiError(403, "FORBIDDEN", "Authors can only save drafts");
				}
			}
			const expected = c.req.header("If-Match");
			if (expected) {
				const current = await service.get(c.req.param("collection"), c.req.param("slug"));
				if (current && etagOf(current) !== expected) {
					throw new ApiError(409, "CONFLICT", "Someone else changed this entry", { current });
				}
			}
			await service.put(c.req.param("collection"), c.req.param("slug"), doc, message);
			await autosave?.delete(c.req.param("collection"), c.req.param("slug")); // a real save supersedes the recovery copy
			const saved = await service.get(c.req.param("collection"), c.req.param("slug"));
			return c.json({ data: { ok: true, ...(saved ? { etag: etagOf(saved) } : {}) } });
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
			const value = dataSchemas[name].parse(await json.read(name, dataDefaults[name]));
			return c.json({ data: name === "webhooks" ? maskSecrets(value as WebhookRow[]) : value });
		})
		.put("/api/data/:name", need("content:write"), async (c) => {
			const name = c.req.param("name");
			if (!isDataName(name)) throw new ApiError(404, "NOT_FOUND", "Unknown data file");
			if (!c.get("user").permissions.includes(readPermissions[name]))
				throw new ApiError(403, "FORBIDDEN", "Not allowed");
			const payload = (await c.req.json().catch(() => undefined)) as { data?: unknown } | undefined;
			let parsed = dataSchemas[name].parse(payload?.data);
			if (name === "webhooks") {
				// The client only ever saw the mask; a masked secret means "keep the stored one".
				const stored = (await json.read<WebhookRow[]>("webhooks", [])) ?? [];
				parsed = (parsed as WebhookRow[]).map((h) =>
					h.secret === SECRET_MASK ? { ...h, secret: stored.find((s) => s.url === h.url)?.secret } : h,
				) as typeof parsed;
			}
			if (name === "bylines") {
				const issues = validateBylines(
					parsed as Byline[],
					dataSchemas["byline-schema"].parse(await json.read("byline-schema", [])),
				);
				if (issues.length)
					throw new ApiError(422, "VALIDATION_ERROR", issues.map((i) => `${i.slug}: ${i.message}`).join("; "));
			}
			await json.write(name, parsed, `${name}: update`);
			record(c, `${name}.update`);
			return c.json({ data: name === "webhooks" ? maskSecrets(parsed as WebhookRow[]) : parsed });
		})
		.post("/api/content-types/impact", need("content-types:manage"), async (c) => {
			const candidate = collectionSchema.parse(await c.req.json().catch(() => undefined));
			return c.json({ data: await schemaImpact(service, candidate) });
		})
		.get("/api/bylines/issues", need("bylines:manage"), async (c) => {
			const [bylines, fields] = await Promise.all([json.read("bylines", []), json.read("byline-schema", [])]);
			return c.json({
				data: validateBylines(dataSchemas.bylines.parse(bylines), dataSchemas["byline-schema"].parse(fields)),
			});
		})
		.get("/api/sections/usage", need("sections:manage"), async (c) => {
			const usage: Record<string, { collection: string; slug: string }[]> = {};
			for (const collection of service.collections) {
				const fields = Object.entries(collection.fields).filter(([, f]) => fieldKind(f) === "section");
				if (fields.length === 0) continue;
				for (const entry of await service.listEntries(collection.name)) {
					const used = new Set(
						fields.flatMap(([name]) => [entry.data[name]].flat().filter((v) => typeof v === "string")),
					);
					for (const section of used)
						(usage[section as string] ??= []).push({ collection: collection.name, slug: entry.slug });
				}
			}
			return c.json({ data: usage });
		})
		.get("/api/taxonomies/counts", need("taxonomies:manage"), async (c) => {
			const list = dataSchemas.taxonomies.parse(await json.read("taxonomies", []));
			return c.json({ data: await termCounts(service, list) });
		})
		.post("/api/taxonomies/:name/terms/:slug/merge", need("taxonomies:manage"), async (c) => {
			const { name, slug } = c.req.param();
			const { into } = z.object({ into: z.string().min(1) }).parse(await c.req.json().catch(() => ({})));
			const list = dataSchemas.taxonomies.parse(await json.read("taxonomies", []));
			const taxonomy = list.find((t) => t.name === name);
			if (!taxonomy?.terms.some((t) => t.slug === slug)) throw new ApiError(404, "NOT_FOUND", "Term not found");
			if (into === slug || !taxonomy.terms.some((t) => t.slug === into))
				throw new ApiError(400, "BAD_REQUEST", "Pick a different existing term");
			const changed = await retagEntries(service, name, slug, into, `taxonomies: merge ${name}/${slug} into ${into}`);
			// Children of the merged term move up to the target.
			const terms = taxonomy.terms
				.filter((t) => t.slug !== slug)
				.map((t) => (t.parent === slug ? { ...t, parent: into === t.slug ? undefined : into } : t));
			await json.write(
				"taxonomies",
				list.map((t) => (t.name === name ? { ...t, terms } : t)),
				`taxonomies: merge ${name}/${slug}`,
			);
			record(c, "taxonomies.merge");
			return c.json({ data: { changed } });
		})
		.post("/api/taxonomies/:name/terms/:slug/rename", need("taxonomies:manage"), async (c) => {
			const { name, slug } = c.req.param();
			const { to } = z
				.object({ to: z.string().regex(/^[a-z0-9][a-z0-9-]*$/) })
				.parse(await c.req.json().catch(() => ({})));
			const list = dataSchemas.taxonomies.parse(await json.read("taxonomies", []));
			const taxonomy = list.find((t) => t.name === name);
			if (!taxonomy?.terms.some((t) => t.slug === slug)) throw new ApiError(404, "NOT_FOUND", "Term not found");
			if (taxonomy.terms.some((t) => t.slug === to)) throw new ApiError(409, "CONFLICT", "That slug is taken");
			const changed = await retagEntries(service, name, slug, to, `taxonomies: rename ${name}/${slug} to ${to}`);
			const terms = taxonomy.terms.map((t) => ({
				...t,
				slug: t.slug === slug ? to : t.slug,
				parent: t.parent === slug ? to : t.parent,
			}));
			await json.write(
				"taxonomies",
				list.map((t): Taxonomy => (t.name === name ? { ...t, terms } : t)),
				`taxonomies: rename ${name}/${slug}`,
			);
			record(c, "taxonomies.rename");
			return c.json({ data: { changed } });
		})
		.get("/api/i18n/:collection", need("content:read"), async (c) => {
			const entries = await service.listEntries(c.req.param("collection"));
			const modified = Object.fromEntries(entries.map((e) => [e.slug, e.modified]));
			return c.json({ data: translationStatus(Object.keys(modified), locales, modified), locales });
		})
		.get("/api/comments", need("comments:read"), (c) => {
			const status = c.req.query("status");
			const parsed = status === "all" || !status ? "all" : commentStatus.parse(status);
			const counts = comments.counts();
			return c.json({
				data: comments.list(
					parsed,
					Math.min(Number(c.req.query("limit")) || 100, 500),
					Number(c.req.query("offset")) || 0,
				),
				counts,
				total: counts[parsed],
			});
		})
		.get("/api/comments/entries", need("comments:read"), (c) => c.json({ data: comments.countsByEntry() }))
		.post("/api/comments/:id/reply", need("comments:moderate"), async (c) => {
			const parent = comments.get(c.req.param("id"));
			if (!parent) throw new ApiError(404, "NOT_FOUND", "Comment not found");
			const { body } = z
				.object({ body: z.string().trim().min(1).max(5000) })
				.parse(await c.req.json().catch(() => undefined));
			const reply = comments.reply(parent, c.get("user").name ?? "Staff", body);
			if (parent.email && sendEmail) {
				void sendEmail({
					to: parent.email,
					subject: `${reply.author} replied to your comment on ${parent.collection}/${parent.slug}`,
					text: `${reply.author} replied:\n\n${reply.body}`,
				}).catch((e: Error) => console.error(redact(`reply notification failed: ${e.message}`)));
			}
			record(c, "comment.reply");
			return c.json({ data: reply }, 201);
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
		.get("/api/redirects/export", need("menus:manage"), async (c) => {
			const rules = await redirects.list();
			if (c.req.query("format") === "csv") {
				return c.body(redirectsToCsv(rules), 200, {
					"content-type": "text/csv; charset=utf-8",
					"content-disposition": 'attachment; filename="redirects.csv"',
				});
			}
			return c.json({ data: rules });
		})
		.post("/api/redirects/import", need("menus:manage"), async (c) => {
			const body = z
				.object({
					format: z.enum(["csv", "json"]),
					text: z.string().max(1024 * 1024),
					mode: z.enum(["merge", "replace"]).default("merge"),
				})
				.parse(await c.req.json().catch(() => undefined));
			let incoming;
			try {
				incoming = body.format === "csv" ? parseRedirectsCsv(body.text) : redirectsSchema.parse(JSON.parse(body.text));
			} catch (e) {
				throw new ApiError(422, "VALIDATION_ERROR", (e as Error).message);
			}
			const current = body.mode === "replace" ? [] : await redirects.listStored();
			const merged = [...current.filter((r) => !incoming.some((n) => redirectKey(n) === redirectKey(r))), ...incoming];
			await redirects.save(merged);
			record(c, "redirects.import");
			return c.json({ data: { imported: incoming.length, total: merged.length } });
		})
		.get("/api/redirects/404", need("menus:manage"), (c) => c.json({ data: redirects.list404() }))
		.delete("/api/redirects/404", need("menus:manage"), (c) => {
			redirects.clear404(c.req.query("path"));
			return c.json({ data: { ok: true } });
		})
		.get("/api/backups", need("site:transfer"), async (c) => c.json({ data: (await backups?.list()) ?? [] }))
		.post("/api/backups", need("site:transfer"), async (c) => {
			if (!backups) throw new ApiError(500, "NOT_CONFIGURED", "Backups unavailable");
			const created = await backups.create();
			record(c, "backup.create");
			return c.json({ data: created }, 201);
		})
		.get("/api/backups/:name", need("site:transfer"), async (c) => {
			const text = await backups?.read(c.req.param("name"));
			if (text == null) throw new ApiError(404, "NOT_FOUND", "Backup not found");
			return c.body(text, 200, {
				"content-type": "application/json; charset=utf-8",
				"content-disposition": `attachment; filename="${c.req.param("name")}"`,
			});
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
		.post("/api/import/wordpress/jobs", need("import:run"), async (c) => {
			if (!imports) throw new ApiError(400, "NOT_ENABLED", "Imports are not enabled");
			if (Number(c.req.header("content-length")) > MAX_WXR_BYTES)
				throw new ApiError(413, "PAYLOAD_TOO_LARGE", "The export file is larger than 50 MB");
			const body = z
				.object({ xml: z.string().min(1).max(MAX_WXR_BYTES) })
				.extend(importOptionsSchema.shape)
				.parse(await c.req.json().catch(() => undefined));
			const { xml, ...options } = body;
			try {
				return c.json({ data: await imports.create(xml, importOptionsSchema.parse(options)) }, 201);
			} catch (e) {
				throw new ApiError(422, "VALIDATION_ERROR", (e as Error).message);
			}
		})
		.get("/api/import/wordpress/jobs/:id", need("import:run"), async (c) => {
			const job = await imports?.get(c.req.param("id")).catch(() => null);
			if (!job) throw new ApiError(404, "NOT_FOUND", "Import not found");
			return c.json({ data: job });
		})
		.post("/api/import/wordpress/jobs/:id/run", need("import:run"), async (c) => {
			const { batch } = z
				.object({ batch: z.number().int().min(1).max(100).optional() })
				.parse(await c.req.json().catch(() => ({})));
			try {
				const job = await imports?.step(c.req.param("id"), batch);
				if (!job) throw new ApiError(404, "NOT_FOUND", "Import not found");
				if (job.status === "done") record(c, "import.wordpress");
				return c.json({ data: job });
			} catch (e) {
				if (e instanceof ApiError) throw e;
				throw new ApiError(404, "NOT_FOUND", (e as Error).message);
			}
		})
		.post("/api/import/wordpress/jobs/:id/rollback", need("import:run"), async (c) => {
			try {
				const job = await imports?.rollback(c.req.param("id"));
				if (!job) throw new ApiError(404, "NOT_FOUND", "Import not found");
				record(c, "import.rollback");
				return c.json({ data: job });
			} catch (e) {
				if (e instanceof ApiError) throw e;
				throw new ApiError(404, "NOT_FOUND", (e as Error).message);
			}
		})
		.get("/api/audit", need("audit:read"), (c) =>
			c.json({ data: audit?.list(Number(c.req.query("limit")) || 100) ?? [] }),
		)
		.get("/api/email/templates", need("site:settings"), (c) =>
			c.json({ data: { defaults: DEFAULT_TEMPLATES, variables: EMAIL_VARIABLES } }),
		)
		.post("/api/email/test", need("site:settings"), async (c) => {
			if (!sendEmail) throw new ApiError(500, "NOT_CONFIGURED", "Email is not configured");
			const { to } = z
				.object({ to: z.string().trim().email().max(200) })
				.parse(await c.req.json().catch(() => undefined));
			try {
				await sendEmail({ to, subject: "Wuppy test email", text: "If you can read this, outgoing email works." });
			} catch (e) {
				throw new ApiError(502, "EMAIL_FAILED", redact((e as Error).message));
			}
			record(c, "email.test");
			return c.json({ data: { ok: true } });
		})
		.get("/api/media", need("content:read"), async (c) => c.json({ data: await media.list() }))
		.get("/api/media/folders", need("content:read"), async (c) => c.json({ data: await media.folders() }))
		.get("/api/media/usage", need("content:read"), async (c) => {
			const url = c.req.query("url");
			if (!url) throw new ApiError(422, "VALIDATION_ERROR", "Missing url");
			return c.json({ data: await mediaUsage(url) });
		})
		.get("/api/media/usage/entry", need("content:read"), async (c) => {
			const collection = c.req.query("collection");
			const slug = c.req.query("slug");
			if (!collection || !slug) throw new ApiError(422, "VALIDATION_ERROR", "Missing collection or slug");
			const urls = await mediaUrlsForEntry(collection, slug);
			if (!urls) throw new ApiError(404, "NOT_FOUND", "Entry not found");
			return c.json({ data: { urls } });
		})
		.get("/api/media/orphans", need("content:read"), async (c) => c.json({ data: await orphans() }))
		.delete("/api/media/orphans", need("media:delete"), async (c) => {
			const found = await orphans();
			for (const item of found) await media.delete(item.url);
			record(c, "media.orphans_deleted");
			return c.json({ data: { deleted: found.length } });
		})
		.put("/api/media/replace", need("media:write"), async (c) => {
			const url = c.req.query("url");
			if (!url) throw new ApiError(422, "VALIDATION_ERROR", "Missing url");
			const file = (await c.req.parseBody())["file"];
			if (!(file instanceof File)) throw new ApiError(422, "VALIDATION_ERROR", "Expected a multipart `file` field");
			await media.replace(url, new Uint8Array(await file.arrayBuffer()));
			return c.json({ data: { ok: true } });
		})
		.post("/api/media/folders/rename", need("media:write"), async (c) => {
			const body = z.object({ from: folderName, to: folderName }).parse(await c.req.json().catch(() => undefined));
			await media.renameFolder(body.from, body.to);
			return c.json({ data: { ok: true } });
		})
		.delete("/api/media/folders", need("media:delete"), async (c) => {
			await media.deleteFolder(folderName.parse(c.req.query("name")));
			return c.json({ data: { ok: true } });
		})
		.put("/api/media/folders", need("media:write"), async (c) => {
			const body = (await c.req.json().catch(() => undefined)) as { folders?: string[] } | undefined;
			const folders = z.array(folderName).max(100).parse(body?.folders);
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
					folder: folderName.or(z.literal("")).optional(),
					credit: z.string().max(500).optional(),
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
			const text = (key: string) => (typeof form[key] === "string" && form[key] ? form[key] : undefined);
			const meta = z
				.object({
					alt: z.string().max(500).optional(),
					title: z.string().max(500).optional(),
					caption: z.string().max(2000).optional(),
					folder: folderName.optional(),
				})
				.parse({ alt: text("alt"), title: text("title"), caption: text("caption"), folder: text("folder") });
			return c.json({ data: await media.upload(new Uint8Array(await file.arrayBuffer()), meta) });
		})
		.delete("/api/media", need("media:delete"), async (c) => {
			const url = c.req.query("url");
			if (!url) throw new ApiError(422, "VALIDATION_ERROR", "Missing url");
			const usedIn = await mediaUsage(url);
			if (usedIn.length && c.req.query("force") !== "1") {
				throw new ApiError(409, "IN_USE", `Used by ${usedIn.length} ${usedIn.length === 1 ? "entry" : "entries"}`, {
					usedIn,
				});
			}
			await media.delete(url);
			return c.json({ data: { ok: true } });
		})
		.get("/api/revisions/:collection/:sha/:slug{.+}", need("git:read"), async (c) => {
			const [collection, slug] = [c.req.param("collection"), c.req.param("slug")];
			const revision = await service.revision(collection, slug, sha(c.req.param("sha")));
			if (!revision) throw new ApiError(404, "NOT_FOUND", "That version does not exist");
			const current = (await service.get(collection, slug)) ?? { data: {}, body: "" };
			return c.json({ data: { revision, changes: diffFields(revision, current) } });
		})
		.get("/api/autosave/:collection/:slug{.+}", need("content:write"), async (c) => {
			if (!autosave) throw new ApiError(500, "NOT_CONFIGURED", "Autosave unavailable");
			return c.json({ data: await autosave.get(c.req.param("collection"), c.req.param("slug")) });
		})
		.put("/api/autosave/:collection/:slug{.+}", need("content:write"), async (c) => {
			if (!autosave) throw new ApiError(500, "NOT_CONFIGURED", "Autosave unavailable");
			const collection = c.req.param("collection");
			if (!service.collections.some((x) => x.name === collection))
				throw new ApiError(404, "NOT_FOUND", "Unknown collection");
			const { message: _message, ...doc } = documentSchema.parse(await c.req.json().catch(() => undefined));
			return c.json({ data: await autosave.put(collection, c.req.param("slug"), doc, c.get("user").id) });
		})
		.delete("/api/autosave/:collection/:slug{.+}", need("content:write"), async (c) => {
			await autosave?.delete(c.req.param("collection"), c.req.param("slug"));
			return c.json({ data: { ok: true } });
		})
		.get("/api/locks/:collection/:slug{.+}", need("content:write"), (c) => {
			const lock = locks.get(c.req.param("collection"), c.req.param("slug"));
			return c.json({ data: lock && lock.userId !== c.get("user").id ? lock : null });
		})
		.put("/api/locks/:collection/:slug{.+}", need("content:write"), (c) => {
			const taken = locks.acquire(
				c.req.param("collection"),
				c.req.param("slug"),
				c.get("user").id,
				c.req.query("force") === "1",
				c.get("user").name,
			);
			return c.json({ data: taken.ok ? null : taken.heldBy });
		})
		.delete("/api/locks/:collection/:slug{.+}", need("content:write"), (c) => {
			locks.release(c.req.param("collection"), c.req.param("slug"), c.get("user").id);
			return c.json({ data: { ok: true } });
		})
		.get("/api/preview-link/:collection/:slug{.+}", need("content:read"), async (c) => {
			if (!previewSecret) throw new ApiError(500, "NOT_CONFIGURED", "Preview links unavailable");
			const collection = service.collections.find((x) => x.name === c.req.param("collection"));
			const slug = c.req.param("slug");
			if (!collection || !(await service.get(collection.name, slug)))
				throw new ApiError(404, "NOT_FOUND", "Entry not found");
			const { token, expires } = signPreview(previewSecret, collection.name, slug);
			const path = (collection.route ?? `/${collection.name}/{slug}`).replace("{slug}", slug);
			return c.json({ data: { url: `${path}?wuppy-preview=${token}`, expiresAt: expires.toISOString() } });
		})
		.get("/api/history/:collection/:slug{.+}", need("git:read"), async (c) =>
			c.json({ data: await service.history(c.req.param("collection"), c.req.param("slug")) }),
		)
		.get("/api/commits/:sha/diff", need("git:read"), async (c) =>
			c.json({ data: await service.diff(sha(c.req.param("sha"))) }),
		)
		.post("/api/commits/:sha/revert", need("git:revert"), async (c) =>
			c.json({ data: { sha: await service.revert(sha(c.req.param("sha"))) } }),
		)
		.get("/api/openapi.json", (c) => c.json(buildOpenApi(app.routes, { title: "Wuppy API", version: "0.0.0" })));
}

export type AppType = ReturnType<typeof createApp>;
