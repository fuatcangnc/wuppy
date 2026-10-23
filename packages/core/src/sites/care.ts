import { assertSiteAddress, SiteError, toCheck, whoami, type SiteNetwork } from "./connect.ts";
import { forward } from "./proxy.ts";
import type { ManagedSite, SiteStore } from "./store.ts";

const DAY = 86_400_000;

// ---- Security scan: what anyone on the internet can see, plus the hub token's state ----

export interface Finding {
	id: string;
	severity: "high" | "medium" | "low";
	title: string;
}

export interface ScanResult {
	checkedAt: string;
	findings: Finding[];
	/** Titles of the checks that passed. */
	passed: string[];
}

/** Files that must never be served: secrets, the database, Git internals. */
const PRIVATE_PATHS = ["/.env", "/.git/config", "/.wuppy/auth.db", "/wuppy.config.ts"];

const HEADER_CHECKS: { id: string; title: string; ok: (h: Headers) => boolean; severity: Finding["severity"] }[] = [
	{
		id: "hsts",
		title: "HTTPS is enforced (Strict-Transport-Security)",
		ok: (h) => h.has("strict-transport-security"),
		severity: "medium",
	},
	{
		id: "nosniff",
		title: "Browsers do not guess file types (X-Content-Type-Options)",
		ok: (h) => h.get("x-content-type-options")?.toLowerCase() === "nosniff",
		severity: "low",
	},
	{
		id: "framing",
		title: "Other sites cannot frame this one (clickjacking)",
		ok: (h) => h.has("x-frame-options") || /frame-ancestors/i.test(h.get("content-security-policy") ?? ""),
		severity: "low",
	},
	{
		id: "referrer",
		title: "Referrer policy is set",
		ok: (h) => h.has("referrer-policy"),
		severity: "low",
	},
];

/** Read-only checks of a managed site. Never sends the hub token: it looks from the outside like a visitor. */
export async function scanSite(site: ManagedSite, net: SiteNetwork, now = new Date()): Promise<ScanResult> {
	const findings: Finding[] = [];
	const passed: string[] = [];
	const check = (ok: boolean, f: Finding) => (ok ? passed.push(f.title) : findings.push(f));
	const get = async (path: string) => {
		await assertSiteAddress(site.url, net);
		return (net.fetch ?? fetch)(`${site.url}${path}`, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
	};

	check(site.status !== "connection_error", {
		id: "connection",
		severity: "high",
		title: "The hub can reach the site with its token",
	});
	const expires = site.tokenExpiresAt ? new Date(site.tokenExpiresAt).getTime() - now.getTime() : null;
	if (expires === null)
		check(false, { id: "token-expiry", severity: "low", title: "The hub token has an expiry date" });
	else
		check(expires > 14 * DAY, {
			id: "token-expiry",
			severity: expires <= 0 ? "high" : "medium",
			title: "The hub token is valid for more than 14 days",
		});

	let home: Response;
	try {
		home = await get("/");
	} catch (e) {
		findings.push({
			id: "reachable",
			severity: "high",
			title: e instanceof SiteError ? e.message : "The site's home page did not answer",
		});
		return { checkedAt: now.toISOString(), findings, passed };
	}
	await home.body?.cancel();
	check(home.status < 500, {
		id: "reachable",
		severity: "high",
		title: "The home page answers without a server error",
	});
	for (const h of HEADER_CHECKS) check(h.ok(home.headers), { id: h.id, severity: h.severity, title: h.title });

	const setup = await get("/api/setup").catch(() => null);
	const setupBody = (await setup?.json().catch(() => null)) as { needsSetup?: unknown } | null | undefined;
	const needsSetup = setup?.ok === true && setupBody?.needsSetup === true;
	check(!needsSetup, {
		id: "setup-open",
		severity: "high",
		title: "Setup is finished (an unfinished setup lets anyone create the owner account)",
	});

	const exposed: string[] = [];
	for (const path of PRIVATE_PATHS) {
		const res = await get(path).catch(() => null);
		await res?.body?.cancel();
		// A page that says "not found" in HTML with status 200 is not the file itself.
		if (res?.status === 200 && !res.headers.get("content-type")?.includes("text/html")) exposed.push(path);
	}
	check(exposed.length === 0, {
		id: "private-files",
		severity: "high",
		title:
			exposed.length === 0
				? "Private files (.env, database, Git) are not served"
				: `Private files are publicly readable: ${exposed.join(", ")}`,
	});
	return { checkedAt: now.toISOString(), findings, passed };
}

// ---- Client report ----

export interface SiteReport {
	site: { name: string; url: string };
	month: string;
	generatedAt: string;
	health: Pick<ManagedSite, "status" | "lastCheckedAt" | "lastError" | "tokenExpiresAt">;
	/** Null when the hub token or the user's role cannot read it. */
	content: {
		drafts: number;
		collections: { name: string; total: number; published: number; draft: number; scheduled: number }[];
		changed: { collection: string; title: string; status: string; modified: string }[];
	} | null;
	activity: { total: number; byType: Record<string, number> } | null;
	scan: ScanResult;
}

/** GET on the remote's API, `data` of a 200 or null. */
export type RemoteGet = (path: string) => Promise<unknown>;

export function remoteGet(
	site: ManagedSite,
	token: string,
	net: SiteNetwork,
	acting: { role: string; email: string | null },
): RemoteGet {
	return async (path) => {
		try {
			const res = await forward(
				{
					origin: site.url,
					token,
					pathAndQuery: path,
					method: "GET",
					headers: new Headers({ accept: "application/json" }),
					body: null,
					actingRole: acting.role,
					actingEmail: acting.email,
				},
				net,
			);
			if (res.status !== 200 || !res.body) return null;
			return (JSON.parse(Buffer.from(res.body).toString("utf8")) as { data?: unknown }).data ?? null;
		} catch {
			return null;
		}
	};
}

export const monthOf = (date: Date) => date.toISOString().slice(0, 7);
export const previousMonth = (date: Date) =>
	monthOf(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1)));

/** Facts only, gathered from the site: nothing in a report is written by a model. */
export async function buildReport(
	site: ManagedSite,
	month: string,
	get: RemoteGet,
	net: SiteNetwork,
	now = new Date(),
): Promise<SiteReport> {
	const [dashboard, audit, scan] = await Promise.all([
		get("/api/dashboard") as Promise<{
			drafts: number;
			collections: NonNullable<SiteReport["content"]>["collections"];
			recent: { collection: string; title: string; status: string; modified: string }[];
		} | null>,
		get("/api/audit?limit=1000") as Promise<{ type: string; at: string }[] | null>,
		scanSite(site, net, now),
	]);
	const inMonth = (at: string) => at.startsWith(month);
	const byType: Record<string, number> = {};
	for (const e of audit?.filter((a) => inMonth(a.at)) ?? []) byType[e.type] = (byType[e.type] ?? 0) + 1;
	return {
		site: { name: site.name, url: site.url },
		month,
		generatedAt: now.toISOString(),
		health: {
			status: site.status,
			lastCheckedAt: site.lastCheckedAt,
			lastError: site.lastError,
			tokenExpiresAt: site.tokenExpiresAt,
		},
		content: dashboard && {
			drafts: dashboard.drafts,
			collections: dashboard.collections,
			changed: dashboard.recent
				.filter((e) => inMonth(e.modified))
				.map(({ collection, title, status, modified }) => ({ collection, title, status, modified })),
		},
		activity: audit && { total: Object.values(byType).reduce((a, b) => a + b, 0), byType },
		scan,
	};
}

const esc = (s: string) =>
	s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
const STATUS_TEXT = { connected: "Online", connection_error: "Problem", unchecked: "Not checked" } as const;

/** Plain text version (email fallback). */
export function reportText(r: SiteReport): string {
	const lines = [
		`${r.site.name} — report for ${r.month}`,
		r.site.url,
		"",
		`Health: ${STATUS_TEXT[r.health.status]}${r.health.lastError ? ` (${r.health.lastError})` : ""}`,
		`Security: ${r.scan.findings.length === 0 ? "all checks passed" : `${r.scan.findings.length} to fix`}`,
		...r.scan.findings.map((f) => `  - [${f.severity}] ${f.title}`),
	];
	if (r.content) {
		lines.push("", "Content:");
		for (const c of r.content.collections)
			lines.push(`  ${c.name}: ${c.published} published, ${c.draft} drafts, ${c.scheduled} scheduled`);
		lines.push(`  Updated this month: ${r.content.changed.length}`);
		for (const e of r.content.changed.slice(0, 20)) lines.push(`    - ${e.title} (${e.collection}, ${e.status})`);
	}
	if (r.activity) lines.push("", `Activity this month: ${r.activity.total} recorded actions`);
	return lines.join("\n");
}

/** Printable page: the browser's "Save as PDF" turns it into the PDF report. Also the HTML email body. */
export function reportHtml(r: SiteReport, { printable = false } = {}): string {
	const row = (cells: (string | number)[], tag = "td") =>
		`<tr>${cells.map((c) => `<${tag}>${esc(String(c))}</${tag}>`).join("")}</tr>`;
	const section = (title: string, body: string) => `<h2>${esc(title)}</h2>${body}`;
	const parts = [
		`<h1>${esc(r.site.name)}</h1>`,
		`<p class="muted">${esc(r.site.url)} · Report for ${esc(r.month)} · Generated ${esc(r.generatedAt.slice(0, 10))}</p>`,
		section(
			"Health",
			`<p><strong>${STATUS_TEXT[r.health.status]}</strong>${r.health.lastError ? ` — ${esc(r.health.lastError)}` : ""}</p>`,
		),
		section(
			"Security",
			r.scan.findings.length === 0
				? `<p>All ${r.scan.passed.length} checks passed.</p>`
				: `<ul>${r.scan.findings.map((f) => `<li><strong>${f.severity}</strong> ${esc(f.title)}</li>`).join("")}</ul><p class="muted">${r.scan.passed.length} other checks passed.</p>`,
		),
	];
	if (r.content)
		parts.push(
			section(
				"Content",
				`<table>${row(["Collection", "Published", "Drafts", "Scheduled"], "th")}${r.content.collections
					.map((c) => row([c.name, c.published, c.draft, c.scheduled]))
					.join("")}</table>` +
					`<p>${r.content.changed.length} entries updated this month.</p>` +
					(r.content.changed.length
						? `<table>${row(["Title", "Collection", "Status", "Date"], "th")}${r.content.changed
								.slice(0, 50)
								.map((e) => row([e.title, e.collection, e.status, e.modified.slice(0, 10)]))
								.join("")}</table>`
						: ""),
			),
		);
	if (r.activity)
		parts.push(
			section(
				"Activity",
				`<p>${r.activity.total} recorded actions this month.</p>` +
					(r.activity.total
						? `<table>${row(["Action", "Count"], "th")}${Object.entries(r.activity.byType)
								.toSorted((a, b) => b[1] - a[1])
								.map(([t, n]) => row([t, n]))
								.join("")}</table>`
						: ""),
			),
		);
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(`${r.site.name} — ${r.month}`)}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;max-width:760px;margin:2rem auto;padding:0 1rem;color:#111}
h1{margin:0}h2{margin-top:1.75rem;font-size:1.05rem;border-bottom:1px solid #ddd;padding-bottom:.25rem}
.muted{color:#666}table{border-collapse:collapse;width:100%;margin:.5rem 0}th,td{text-align:left;padding:.3rem .5rem;border-bottom:1px solid #eee}
.bar{display:flex;justify-content:flex-end}@media print{.bar{display:none}body{margin:0}}</style></head><body>
${printable ? `<div class="bar"><button type="button" onclick="window.print()">Save as PDF</button></div>` : ""}
${parts.join("\n")}
</body></html>`;
}

// ---- Scheduled care (run by the server) ----

/** Re-checks every site's connection and returns the problems worth telling the agency about. */
export async function careRound(store: SiteStore, net: SiteNetwork, now = new Date()): Promise<string[]> {
	const problems: string[] = [];
	for (const site of store.list()) {
		const token = store.token(site.id);
		if (!token) store.markFailed(site.id, "Reconnect required: the stored token can no longer be read");
		else
			try {
				store.markChecked(site.id, toCheck(await whoami(site.url, token, net)));
			} catch (e) {
				if (!(e instanceof SiteError)) throw e;
				store.markFailed(site.id, e.message);
			}
		const fresh = store.get(site.id)!;
		const scan = await scanSite(fresh, net, now);
		for (const finding of scan.findings.filter((f) => f.severity !== "low"))
			problems.push(
				`${fresh.name} (${fresh.url}): ${finding.id === "connection" ? (fresh.lastError ?? finding.title) : finding.title}`,
			);
	}
	return problems;
}

/** Sends last month's report to each site that has a recipient, once per month (catches up after downtime). */
export async function sendMonthlyReports(
	store: SiteStore,
	net: SiteNetwork,
	send: (message: { to: string; subject: string; text: string; html: string }) => Promise<void>,
	now = new Date(),
): Promise<number> {
	const month = previousMonth(now);
	let sent = 0;
	for (const site of store.list()) {
		const settings = store.reportSettings(site.id);
		const token = store.token(site.id);
		if (!settings.email || settings.lastSent === month || !token) continue;
		const report = await buildReport(
			site,
			month,
			remoteGet(site, token, net, { role: "admin", email: null }),
			net,
			now,
		);
		await send({
			to: settings.email,
			subject: `${site.name}: website report for ${month}`,
			text: reportText(report),
			html: reportHtml(report),
		});
		store.markReported(site.id, month);
		sent++;
	}
	return sent;
}
