import { aiConfigFromEnv } from "./ai/chat.ts";
import { ChatHistory } from "./ai/history.ts";
import { careRound, sendMonthlyReports } from "./sites/care.ts";
import { mkdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import {
	acceptInvitation as acceptInvitationRecord,
	createInvitation,
	createMigratedAuth,
	listPendingInvitations,
	needsSetup,
	normalizeInvitationEmail,
	permissionsFor,
	revokeInvitation as revokeInvitationRecord,
	userFromRequest,
} from "@wuppycms/auth";
import { NoopGit, RealGit } from "@wuppycms/git";
import { Hono } from "hono";
import { createApp } from "./api/app.ts";
import { loadConfig } from "./config/index.ts";
import { siteCollections, type Collection, type Relation } from "./content-types/index.ts";
import { loadDotEnv } from "./config/env.ts";
import { resolveOAuthProviders } from "./config/oauth.ts";
import { resolvePasskeyOptions } from "./config/passkey.ts";
import { resolveSessionPolicy } from "./config/session.ts";
import { AuditLog } from "./audit/index.ts";
import { ContentService } from "./content/service.ts";
import { AutosaveStore } from "./content/autosave.ts";
import { BackupService } from "./transfer/backups.ts";
import { createWebhookSender } from "./webhooks/index.ts";
import { assertPublicUrl } from "./security/ssrf.ts";
import { ImportJobs } from "./import/job.ts";
import { PluginManager } from "./plugins/manager.ts";
import { RegistryClient } from "./plugins/registry.ts";
import { MediaService } from "./media/index.ts";
import { JsonStore } from "./data/store.ts";
import { CommentService } from "./comments/index.ts";
import { RedirectService } from "./redirects/service.ts";
import { ApiTokenService, bearerUser } from "./security/api-tokens.ts";
import { SiteStore } from "./sites/store.ts";
import { GITHUB_CLIENT_ID, GithubAccounts, GithubThemes } from "./themes/github.ts";
import { linkTheme } from "./themes/site.ts";
import { themeComponentNames } from "./themes/components.ts";
import { renderEmail } from "./email/templates.ts";
import { createEmailSender } from "./email/index.ts";
import { settingsSchema } from "./data/schemas.ts";

export interface ServerOptions {
	/** The site's folder: content, media, data. */
	root: string;
	/** The running GitHub theme's folder; its collections are stored in the site (see themes/site.ts). */
	theme?: string;
	secret: string;
	baseURL: string;
	/** Plugin log sink (defaults to console). */
	log?: (message: string) => void;
	/** Network used by plugins after the manifest check passed (defaults to a size/time-capped `fetch`). */
	pluginFetch?: (
		url: string,
		init: { method: string; body?: string; headers?: Record<string, string> },
	) => Promise<{ status: number; body: string }>;
}

const MAX_PLUGIN_RESPONSE = 1024 * 1024;

async function limitedFetch(url: string, init: { method: string; body?: string; headers?: Record<string, string> }) {
	// The manifest allowlist names a host; DNS can still point it at the internal network.
	if (process.env.WUPPY_ALLOW_PRIVATE_URLS !== "1") await assertPublicUrl(url);
	const res = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(5000) });
	const text = await res.text();
	return { status: res.status, body: text.slice(0, MAX_PLUGIN_RESPONSE) };
}

/** Wires config, content, Git and auth into one fetch-style app (mount it anywhere). */
export async function createServer({
	root,
	theme,
	secret,
	baseURL,
	log = console.log,
	pluginFetch = limitedFetch,
}: ServerOptions) {
	const config = await loadConfig(root);
	await loadDotEnv(root);
	await mkdir(join(root, ".wuppy"), { recursive: true });
	// A GitHub theme runs from its own folder but keeps the accounts of the site it was installed on (serve.mjs sets this).
	const db = new DatabaseSync(process.env.WUPPY_AUTH_DB || join(root, ".wuppy", "auth.db"));
	const audit = new AuditLog(db);
	const git = config.git ? await RealGit.ensure(root) : new NoopGit();
	const json = new JsonStore(root, git);
	const settings = settingsSchema.parse({
		siteName: config.site?.name ?? "Wuppy",
		siteUrl: config.site?.url ?? "",
		...(await json.read<Record<string, unknown>>("settings", {})),
	});
	const currentSettings = async () =>
		settingsSchema.parse({
			siteName: config.site?.name ?? "Wuppy",
			siteUrl: config.site?.url ?? "",
			...(await json.read<Record<string, unknown>>("settings", {})),
		});
	const sendEmail = createEmailSender(currentSettings);
	const oauth = resolveOAuthProviders();
	const auth = await createMigratedAuth({
		db,
		secret,
		baseURL,
		session: resolveSessionPolicy(),
		passkey: resolvePasskeyOptions(baseURL, settings.siteName),
		socialProviders: oauth.socialProviders,
		onAuditEvent: (e) => audit.record(e),
		sendMagicLink: async ({ email, url }) => {
			const templateId = process.env.RESEND_MAGIC_LINK_TEMPLATE;
			const current = await currentSettings();
			await sendEmail({
				to: email,
				...renderEmail("magic", current, { siteName: current.siteName, link: url }),
				...(templateId
					? {
							template: {
								id: templateId,
								variables: { MAGIC_LINK: url, SITE_NAME: current.siteName },
							},
						}
					: {}),
			});
		},
		sendResetPassword: async ({ email, url }) => {
			const current = await currentSettings();
			await sendEmail({
				to: email,
				...renderEmail("reset", current, { siteName: current.siteName, link: url }),
			});
		},
	});

	const send = createWebhookSender([...config.webhooks, ...(await json.read("webhooks", []))], {
		allowPrivate: process.env.WUPPY_ALLOW_PRIVATE_URLS === "1",
	});
	let plugins: PluginManager | undefined;
	const pluginWrites = new Set<string>();
	const emit = (e: Parameters<typeof send>[0]) => {
		void send(e);
		if (e.collection && pluginWrites.has(`${e.collection}/${e.slug}`)) return;
		void plugins?.dispatch(e);
	};
	const comments = new CommentService(db);
	const redirects = new RedirectService(json, db, config.redirects);
	const tokens = new ApiTokenService(db);
	const themeCollections = theme ? (await loadConfig(theme)).collections : [];
	// Content types and relations made in the admin; saving them calls this again, no restart.
	const siteTypes = async () => {
		const merged = siteCollections(
			config.collections,
			(await json.read("content-types", [])) as Collection[],
			(await json.read("relations", [])) as Relation[],
		);
		return theme ? linkTheme(merged, themeCollections).collections : merged;
	};
	const collections = await siteTypes();
	// A theme's `.astro` components are trusted design code; allow them in MDX without repeating every name in config.
	// A site's internal components are not exposed automatically: many require props and would break a page if inserted.
	const autoComponents = theme ? await themeComponentNames(theme) : [];
	const components = [...new Set([...config.components, ...autoComponents])];
	// Plugins load after these services, so the before-hooks reach them through `plugins` at call time.
	const service = new ContentService(root, collections, git, {
		components,
		emit,
		beforeSave: async (e) => {
			const out = (await plugins?.beforeContentSave(e)) ?? e;
			return { data: out.data, body: out.body };
		},
		beforeDelete: async (e) => plugins?.beforeContentDelete(e),
	});
	const media = new MediaService(root, git, emit, json, async (file) => plugins?.beforeMediaUpload(file));
	const backups = new BackupService(root, service, settings.backup.keep);
	// shortcut: settings are read once at startup, so changing the schedule needs a restart.
	if (settings.backup.enabled) {
		setInterval(
			() => void backups.create().catch((e: Error) => log(`[wuppy] scheduled backup failed: ${e.message}`)),
			settings.backup.intervalHours * 3_600_000,
		).unref();
	}

	const emailTimes = new Map<string, number[]>();
	plugins = new PluginManager(root, json, config.plugins, {
		log: (m) => log(`[plugin] ${m}`),
		readContent: async (collection, slug) => {
			const entry = await service.get(collection, slug);
			return entry && { data: entry.data, body: entry.body };
		},
		writeContent: async (pluginId, collection, slug, doc) => {
			// The resulting content event must not wake plugins again, or a plugin that writes on update would loop.
			pluginWrites.add(`${collection}/${slug}`);
			setTimeout(() => pluginWrites.delete(`${collection}/${slug}`), 5000).unref();
			await service.put(collection, slug, doc, `plugin ${pluginId}: update ${collection}/${slug}`);
		},
		secret: (pluginId, name) => process.env[`WUPPY_PLUGIN_${pluginId.toUpperCase().replaceAll("-", "_")}_${name}`],
		sendEmail: async (pluginId, message) => {
			const now = Date.now();
			const recent = (emailTimes.get(pluginId) ?? []).filter((t) => now - t < 60_000);
			if (recent.length >= 10) throw new Error("Email limit reached (10 per minute)");
			emailTimes.set(pluginId, [...recent, now]);
			await sendEmail(message);
		},
		fetch: (url, init) => {
			log(`[plugin] egress ${init.method} ${url}`);
			return pluginFetch(url, init);
		},
		registry: new RegistryClient(config.registries),
		onReload: (set) => {
			for (const err of set.errors) log(`[plugin] not loaded: ${err}`);
		},
	});
	await plugins.load();

	const sites = new SiteStore(db, secret);
	const siteNetwork = { allowPrivate: process.env.WUPPY_ALLOW_PRIVATE_URLS === "1" };
	/** Hub users who manage sites hear about site problems. */
	const siteManagers = () =>
		(db.prepare("SELECT email, role FROM user").all() as { email: string; role: string | null }[])
			.filter((u) =>
				permissionsFor((u.role ?? "viewer") as Parameters<typeof permissionsFor>[0]).includes("sites:manage"),
			)
			.map((u) => u.email);
	// shortcut: the last alert lives in memory, so a restart repeats an ongoing alert once.
	let lastAlert = "";
	const siteCare = async () => {
		if (sites.list().length === 0) return;
		const problems = await careRound(sites, siteNetwork);
		const key = problems.join("\n");
		if (key && key !== lastAlert) {
			const current = await currentSettings();
			for (const to of siteManagers())
				await sendEmail({
					to,
					subject: `${current.siteName}: ${problems.length} site problem${problems.length === 1 ? "" : "s"}`,
					text: `The hourly site check found:\n\n${problems.map((p) => `- ${p}`).join("\n")}\n\nOpen Sites in the admin to fix them.`,
				});
		}
		lastAlert = key;
		await sendMonthlyReports(sites, siteNetwork, sendEmail);
	};
	const runCare = () => void siteCare().catch((e: Error) => log(`[wuppy] site care failed: ${e.message}`));
	setTimeout(runCare, 60_000).unref();
	setInterval(runCare, 3_600_000).unref();

	return new Hono()
		.get("/api/setup", (c) =>
			c.json({
				needsSetup: needsSetup(db),
				siteName: settings.siteName,
				siteUrl: settings.siteUrl,
				socialProviders: oauth.enabled,
			}),
		)
		.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
		.route(
			"/",
			createApp({
				service,
				media,
				json,
				comments,
				redirects,
				tokens,
				backups,
				autosave: new AutosaveStore(root),
				sendEmail,
				previewSecret: secret,
				sites,
				ai: aiConfigFromEnv(),
				chats: new ChatHistory(db),
				siteNetwork,
				resetTwoFactor: (userId) => {
					const row = db.prepare("SELECT email FROM user WHERE id = ?").get(userId) as { email: string } | undefined;
					if (!row) return null;
					const removed = db.prepare("DELETE FROM twoFactor WHERE userId = ?").run(userId);
					if (Number(removed.changes) === 0) return { email: row.email, deleted: false };
					db.prepare("UPDATE user SET twoFactorEnabled = 0 WHERE id = ?").run(userId);
					db.prepare("DELETE FROM session WHERE userId = ?").run(userId);
					return { email: row.email, deleted: true };
				},
				inviteUser: async ({ email, role, invitedBy }) => {
					const normalized = normalizeInvitationEmail(email);
					const existing = db.prepare("SELECT id FROM user WHERE lower(email) = ?").get(normalized);
					if (existing) return { ok: false as const, code: "USER_EXISTS" as const };
					const created = createInvitation(db, { email: normalized, role, invitedBy });
					const link = `${baseURL.replace(/\/+$/, "")}/admin/?invite=${encodeURIComponent(created.token)}`;
					try {
						const current = await currentSettings();
						await sendEmail({
							to: normalized,
							...renderEmail("invite", current, {
								siteName: current.siteName,
								role: created.invitation.role,
								link,
								expiresAt: created.invitation.expiresAt,
							}),
						});
					} catch (e) {
						revokeInvitationRecord(db, created.invitation.id);
						log(`[wuppy] invitation email failed: ${(e as Error).message}`);
						return { ok: false as const, code: "EMAIL_FAILED" as const };
					}
					return {
						ok: true as const,
						email: created.invitation.email,
						role: created.invitation.role,
						expiresAt: created.invitation.expiresAt,
					};
				},
				listInvitations: () => listPendingInvitations(db),
				revokeInvitation: (id) => revokeInvitationRecord(db, id),
				acceptInvitation: (input) => acceptInvitationRecord(db, input),
				userCount: () => (db.prepare("SELECT COUNT(*) AS n FROM user").get() as { n: number }).n,
				pluginManager: plugins,
				siteTypes,
				themes: new GithubThemes({
					base: root,
					// serve.mjs (with Docker's restart policy) and the starter's dev.mjs start the server again after this exit.
					restart: () => {
						if (process.env.WUPPY_RESTART !== "1") return false;
						// dev.mjs restarts only on its own code, so a plain exit of astro still ends it.
						setTimeout(() => process.exit(Number(process.env.WUPPY_RESTART_CODE ?? 0)), 1000);
						return true;
					},
				}),
				github: new GithubAccounts(db, secret, {
					clientId: process.env.WUPPY_GITHUB_CLIENT_ID || GITHUB_CLIENT_ID,
					clientSecret: process.env.WUPPY_GITHUB_CLIENT_SECRET ?? "",
					redirectUri: `${baseURL.replace(/\/+$/, "")}/api/themes/github/callback`,
				}),
				imports: new ImportJobs({ root, service, media, json, redirects }),
				audit,
				locales: config.locales,
				getUser: async (req) =>
					req.headers.get("authorization")?.startsWith("Bearer ")
						? bearerUser(tokens, db, req)
						: userFromRequest(auth, req),
			}),
		);
}
