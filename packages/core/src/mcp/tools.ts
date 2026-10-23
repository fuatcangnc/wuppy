import { z } from "zod";

/** One request to this hub's own REST API, made with the caller's credentials. */
export type ApiCall = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: unknown }>;

export interface Tool {
	name: string;
	description: string;
	/** Changes something (content, email). Chat offers these only when the user allows changes. */
	write: boolean;
	inputSchema: Record<string, unknown>;
	run: (call: ApiCall, args: unknown) => Promise<unknown>;
}

/** A tool failure the model should read and recover from (not a server error). */
export class ToolError extends Error {}

const site = z
	.string()
	.min(1)
	.max(200)
	.describe('Site id, name or host from list_sites, or "local" for this hub itself');
const collection = z.string().min(1).max(100).describe("Collection name from list_collections, e.g. posts");
const slug = z.string().min(1).max(500);

const ok = async (call: ApiCall, method: string, path: string, body?: unknown) => {
	const res = await call(method, path, body);
	if (res.status >= 400) {
		const error = (res.body as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`;
		throw new ToolError(res.status === 403 ? `Not allowed: ${error}` : error);
	}
	return res.body as { data: unknown };
};

interface SiteRow {
	id: string;
	name: string;
	url: string;
}

/** Accepts what a person or model would naturally say ("Müşteri 1", "musteri1.cigce.com.tr") as well as the id. */
async function resolveSite(call: ApiCall, value: string): Promise<SiteRow | null> {
	if (value === "local") return null;
	const { data } = (await ok(call, "GET", "/api/sites")) as { data: SiteRow[] };
	const needle = value.trim().toLowerCase();
	const found =
		data.find((s) => s.id === value) ??
		data.find((s) => s.name.toLowerCase() === needle || new URL(s.url).host === needle || s.url === needle) ??
		data.find((s) => new URL(s.url).host.startsWith(`${needle}.`));
	if (!found) throw new ToolError(`No site matches "${value}". Call list_sites to see the sites you can reach.`);
	return found;
}

/** Where a site's content API lives: this hub, or the hub's proxy to it. */
const apiBase = async (call: ApiCall, value: string) => {
	const s = await resolveSite(call, value);
	return { site: s, base: s ? `/api/sites/${encodeURIComponent(s.id)}/proxy` : "" };
};

const enc = (value: string) => value.split("/").map(encodeURIComponent).join("/");

function tool<S extends z.ZodType>(def: {
	name: string;
	description: string;
	write?: boolean;
	input: S;
	run: (call: ApiCall, args: z.infer<S>) => Promise<unknown>;
}): Tool {
	const { $schema: _drop, ...inputSchema } = z.toJSONSchema(def.input) as Record<string, unknown>;
	return {
		name: def.name,
		description: def.description,
		write: def.write ?? false,
		inputSchema,
		run: async (call, args) => {
			const parsed = def.input.safeParse(args ?? {});
			if (!parsed.success) throw new ToolError(`Invalid arguments: ${parsed.error.message}`);
			return def.run(call, parsed.data);
		},
	};
}

export const TOOLS: Tool[] = [
	tool({
		name: "list_sites",
		description: "List the sites you can work on, with connection status and your role on each.",
		input: z.object({}),
		run: async (call) => {
			const { data } = (await ok(call, "GET", "/api/sites")) as {
				data: (SiteRow & { status: string; role: string; lastCheckedAt: string | null; lastError: string | null })[];
			};
			return data.map(({ id, name, url, status, role, lastCheckedAt, lastError }) => ({
				id,
				name,
				url,
				status,
				role,
				lastCheckedAt,
				lastError,
			}));
		},
	}),
	tool({
		name: "get_context",
		description:
			"Read the agency playbook (how the agency works, its standards) and, when a site is given, that client's brief (goals, brand voice, preferences). Read this before writing for a client.",
		input: z.object({ site: site.optional() }),
		run: async (call, { site: value }) => {
			const agency = (await ok(call, "GET", "/api/ai/context")).data;
			const s = value ? await resolveSite(call, value) : null;
			const client = s ? (await ok(call, "GET", `/api/sites/${encodeURIComponent(s.id)}/context`)).data : null;
			return { agency, ...(s ? { site: { name: s.name, url: s.url }, client } : {}) };
		},
	}),
	tool({
		name: "check_site",
		description: "Check that a managed site is up and the hub can still reach it (health and token expiry).",
		input: z.object({ site }),
		run: async (call, { site: value }) => {
			const s = await resolveSite(call, value);
			if (!s) return { name: "local", status: "connected" };
			const res = await call("POST", `/api/sites/${encodeURIComponent(s.id)}/check`);
			const body = res.body as { data?: Record<string, unknown>; error?: { code: string; message: string } };
			if (res.status >= 400) return { name: s.name, url: s.url, status: "connection_error", error: body.error };
			const { name, url, status, tokenExpiresAt, lastCheckedAt } = body.data ?? {};
			return { name, url, status, tokenExpiresAt, lastCheckedAt };
		},
	}),
	tool({
		name: "site_overview",
		description: "Content counts, drafts, scheduled and recent entries of a site. Good for reports.",
		input: z.object({ site }),
		run: async (call, { site: value }) =>
			(await ok(call, "GET", `${(await apiBase(call, value)).base}/api/dashboard`)).data,
	}),
	tool({
		name: "list_collections",
		description: "List a site's content collections (posts, pages…) and their fields.",
		input: z.object({ site }),
		run: async (call, { site: value }) => {
			const { data } = (await ok(call, "GET", `${(await apiBase(call, value)).base}/api/collections`)) as {
				data: { name: string; label?: string; fields?: unknown }[];
			};
			return data.map(({ name, label, fields }) => ({ name, label, fields }));
		},
	}),
	tool({
		name: "list_content",
		description: "List entries of a collection, newest first. Optional text search and status filter.",
		input: z.object({
			site,
			collection,
			query: z.string().max(200).optional(),
			status: z.enum(["draft", "published", "scheduled"]).optional(),
			limit: z.number().int().min(1).max(50).default(20),
		}),
		run: async (call, { site: value, collection: name, query, status, limit }) => {
			const params = new URLSearchParams({ limit: String(limit) });
			if (query) params.set("q", query);
			if (status) params.set("status", status);
			const { base } = await apiBase(call, value);
			const { data } = (await ok(call, "GET", `${base}/api/content/${encodeURIComponent(name)}?${params}`)) as {
				data: { slug: string; data: Record<string, unknown>; modified: string; status: string }[];
			};
			return data.map((e) => ({ slug: e.slug, title: e.data.title ?? e.slug, status: e.status, modified: e.modified }));
		},
	}),
	tool({
		name: "read_content",
		description: "Read one entry: its fields (frontmatter) and Markdown body.",
		input: z.object({ site, collection, slug }),
		run: async (call, { site: value, collection: name, slug: entry }) => {
			const { base } = await apiBase(call, value);
			const { data } = (await ok(call, "GET", `${base}/api/content/${encodeURIComponent(name)}/${enc(entry)}`)) as {
				data: { data: unknown; body: string };
			};
			return { data: data.data, body: data.body };
		},
	}),
	tool({
		name: "site_activity",
		description: "Recent activity on a site: who changed what and when (needs security log access).",
		input: z.object({ site, limit: z.number().int().min(1).max(100).default(30) }),
		run: async (call, { site: value, limit }) =>
			(await ok(call, "GET", `${(await apiBase(call, value)).base}/api/audit?limit=${limit}`)).data,
	}),
	tool({
		name: "site_report",
		description:
			"Facts for a client report on a managed site for one month: health, security checks, content counts, entries changed and activity.",
		input: z.object({
			site,
			month: z
				.string()
				.regex(/^\d{4}-(0[1-9]|1[0-2])$/)
				.optional()
				.describe("YYYY-MM, default this month"),
		}),
		run: async (call, { site: value, month }) => {
			const s = await resolveSite(call, value);
			if (!s) throw new ToolError("Reports are for managed sites");
			return (await ok(call, "GET", `/api/sites/${encodeURIComponent(s.id)}/report${month ? `?month=${month}` : ""}`))
				.data;
		},
	}),
	tool({
		name: "security_scan",
		description:
			"Security check of a managed site from the outside: unfinished setup, exposed private files, security headers, hub token expiry.",
		input: z.object({ site }),
		run: async (call, { site: value }) => {
			const s = await resolveSite(call, value);
			if (!s) throw new ToolError("The scan is for managed sites");
			return (await ok(call, "POST", `/api/sites/${encodeURIComponent(s.id)}/scan`)).data;
		},
	}),
	tool({
		name: "create_draft",
		description: "Create a new draft entry. It is always saved as a draft; a person publishes it.",
		write: true,
		input: z.object({
			site,
			collection,
			slug: slug.regex(/^[a-z0-9][a-z0-9/-]*$/, "lowercase letters, digits, - and /"),
			title: z.string().min(1).max(200),
			body: z.string().max(100_000).describe("Markdown"),
			fields: z.record(z.string(), z.unknown()).optional().describe("Other frontmatter fields"),
		}),
		run: async (call, { site: value, collection: name, slug: entry, title, body, fields }) => {
			const { base } = await apiBase(call, value);
			await ok(call, "POST", `${base}/api/content/${encodeURIComponent(name)}`, {
				slug: entry,
				data: { ...fields, title, draft: true },
				body,
				message: `Draft by assistant: ${title}`.slice(0, 200),
			});
			return { ok: true, slug: entry, draft: true };
		},
	}),
	tool({
		name: "update_content",
		description:
			"Change an existing entry. Give only what changes: fields are merged into the current ones, body replaces the current body.",
		write: true,
		input: z.object({
			site,
			collection,
			slug,
			fields: z.record(z.string(), z.unknown()).optional(),
			body: z.string().max(100_000).optional(),
		}),
		run: async (call, { site: value, collection: name, slug: entry, fields, body }) => {
			const { base } = await apiBase(call, value);
			const path = `${base}/api/content/${encodeURIComponent(name)}/${enc(entry)}`;
			const { data: current } = (await ok(call, "GET", path)) as {
				data: { data: Record<string, unknown>; body: string };
			};
			await ok(call, "PUT", path, {
				data: { ...current.data, ...fields },
				body: body ?? current.body,
				message: `Edit by assistant: ${entry}`.slice(0, 200),
			});
			return { ok: true, slug: entry };
		},
	}),
	tool({
		name: "email_site_member",
		description: "Email a person who is a member of the given managed site (e.g. send a client their report).",
		write: true,
		input: z.object({
			site,
			to: z.string().email().max(200),
			subject: z.string().min(1).max(200),
			text: z.string().min(1).max(20_000),
		}),
		run: async (call, { site: value, to, subject, text }) => {
			const s = await resolveSite(call, value);
			if (!s) throw new ToolError("Pick a managed site; its members are the people you can email");
			await ok(call, "POST", `/api/sites/${encodeURIComponent(s.id)}/email`, { to, subject, text });
			return { ok: true, to };
		},
	}),
];

const MAX_RESULT_CHARS = 20_000;

/** Runs a tool and returns text for the model. Failures come back as text too, so the model can adjust. */
export async function runTool(
	call: ApiCall,
	name: string,
	args: unknown,
	allowed: readonly Tool[] = TOOLS,
): Promise<{ text: string; isError: boolean }> {
	const found = allowed.find((t) => t.name === name);
	if (!found) return { text: `Unknown tool: ${name}`, isError: true };
	try {
		const text = JSON.stringify(await found.run(call, args));
		return {
			text: text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}… (truncated)` : text,
			isError: false,
		};
	} catch (e) {
		if (e instanceof ToolError) return { text: e.message, isError: true };
		throw e;
	}
}
