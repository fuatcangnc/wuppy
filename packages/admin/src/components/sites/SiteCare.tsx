import { FileText, Package, RefreshCw, ShieldCheck } from "@react-zero-ui/icon-sprite";
import { useEffect, useState } from "react";
import { api, apiData } from "../../lib/api.ts";
import type { ManagedSite } from "../../stores/sites.ts";
import { Badge, Button, Dialog, ErrorText, Input, Select, toast } from "../../ui/index.tsx";

interface Finding {
	id: string;
	severity: "high" | "medium" | "low";
	title: string;
}
interface Scan {
	checkedAt: string;
	findings: Finding[];
	passed: string[];
}
const TONE = { high: "danger", medium: "warning", low: "neutral" } as const;

function Findings({ scan }: { scan: Scan }) {
	return scan.findings.length === 0 ? (
		<p className="text-sm text-emerald-600">All {scan.passed.length} checks passed.</p>
	) : (
		<ul className="grid gap-1.5">
			{scan.findings.map((f) => (
				<li key={f.id} className="flex items-start gap-2 text-sm">
					<Badge tone={TONE[f.severity]}>{f.severity}</Badge>
					<span>{f.title}</span>
				</li>
			))}
			<li className="text-xs text-muted-foreground">{scan.passed.length} other checks passed.</li>
		</ul>
	);
}

/** Security scan, client report (PDF via print) and the monthly report recipient for one site. */
export function SiteCare({ site }: { site: ManagedSite }) {
	const [scan, setScan] = useState<Scan | null>(null);
	const [scanning, setScanning] = useState(false);
	const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
	const [members, setMembers] = useState<{ email: string }[]>([]);
	const [recipient, setRecipient] = useState("");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let live = true;
		void Promise.all([
			apiData<{ email: string }[]>("GET", `/api/sites/${site.id}/members`),
			apiData<{ email: string | null }>("GET", `/api/sites/${site.id}/report-settings`),
		])
			.then(([m, settings]) => {
				if (!live) return;
				setMembers(m);
				setRecipient(settings.email ?? "");
			})
			.catch((e: Error) => live && setError(e.message));
		return () => {
			live = false;
		};
	}, [site.id]);

	const runScan = async () => {
		setScanning(true);
		setError(null);
		try {
			setScan(await apiData<Scan>("POST", `/api/sites/${site.id}/scan`));
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setScanning(false);
		}
	};
	const saveRecipient = async (email: string) => {
		setRecipient(email);
		try {
			await api("PUT", `/api/sites/${site.id}/report-settings`, { email: email || null });
			toast(email ? `Monthly report goes to ${email}` : "Monthly report off");
		} catch (e) {
			setError((e as Error).message);
		}
	};

	return (
		<div className="grid gap-4">
			<div className="grid gap-2">
				<div className="flex items-center justify-between gap-2">
					<p className="text-xs font-medium tracking-wider text-zinc-400 uppercase">Security</p>
					<Button size="sm" variant="secondary" disabled={scanning} onClick={() => void runScan()}>
						<ShieldCheck size={14} /> {scanning ? "Scanning…" : "Run security scan"}
					</Button>
				</div>
				{scan ? (
					<Findings scan={scan} />
				) : (
					<p className="text-xs text-muted-foreground">
						Checks the site like a visitor would: unfinished setup, exposed private files, security headers, token
						expiry. The hub also runs it every hour and emails site managers about problems.
					</p>
				)}
			</div>
			<div className="grid gap-2">
				<p className="text-xs font-medium tracking-wider text-zinc-400 uppercase">Client report</p>
				<div className="flex flex-wrap items-end gap-2">
					<Input
						label="Month"
						type="month"
						value={month}
						max={new Date().toISOString().slice(0, 7)}
						onChange={(e) => setMonth(e.target.value)}
					/>
					<Button
						variant="secondary"
						disabled={!month}
						onClick={() =>
							window.open(
								`/api/sites/${site.id}/report?format=html&month=${encodeURIComponent(month)}`,
								"_blank",
								"noopener",
							)
						}
					>
						<FileText size={14} /> Open report (PDF)
					</Button>
				</div>
				<Select
					label="Email the report every month to"
					value={recipient}
					onChange={(e) => void saveRecipient(e.target.value)}
				>
					<option value="">Nobody (off)</option>
					{members.map((m) => (
						<option key={m.email} value={m.email}>
							{m.email}
						</option>
					))}
				</Select>
				<p className="text-xs text-muted-foreground">
					Sent on the 1st for the previous month. Only members of this site can receive it.
				</p>
			</div>
			<ErrorText>{error}</ErrorText>
		</div>
	);
}

interface PluginRow {
	site: ManagedSite;
	id?: string;
	registry?: string;
	installedVersion?: string | null;
	version?: string;
	error?: string;
}

/** Actions over every site at once: connection check, security scan, plugin updates. */
export function BulkCare({ sites, onDone }: { sites: ManagedSite[]; onDone: () => void }) {
	const [open, setOpen] = useState<"scan" | "plugins" | null>(null);
	const [busy, setBusy] = useState(false);
	const [scans, setScans] = useState<{ site: ManagedSite; scan?: Scan; error?: string }[]>([]);
	const [plugins, setPlugins] = useState<PluginRow[]>([]);
	const [query, setQuery] = useState("");

	const checkAll = async () => {
		setBusy(true);
		const results = await Promise.allSettled(sites.map((s) => api("POST", `/api/sites/${s.id}/check`)));
		const failed = results.filter((r) => r.status === "rejected").length;
		toast(failed ? `${failed} of ${sites.length} sites have a problem` : `All ${sites.length} sites are reachable`);
		setBusy(false);
		onDone();
	};
	const scanAll = async () => {
		setOpen("scan");
		setBusy(true);
		setScans(
			await Promise.all(
				sites.map((site) =>
					apiData<Scan>("POST", `/api/sites/${site.id}/scan`).then(
						(scan) => ({ site, scan }),
						(e: Error) => ({ site, error: e.message }),
					),
				),
			),
		);
		setBusy(false);
	};
	const findUpdates = async () => {
		setOpen("plugins");
		setBusy(true);
		const rows = await Promise.all(
			sites.map((site) =>
				apiData<{
					results: {
						id: string;
						registry: string;
						version: string;
						installedVersion: string | null;
						updateAvailable: boolean;
					}[];
				}>("GET", `/api/sites/${site.id}/proxy/api/registry?q=${encodeURIComponent(query)}`).then(
					(d): PluginRow[] => d.results.filter((r) => r.updateAvailable).map((r) => ({ site, ...r })),
					(e: Error): PluginRow[] => [{ site, error: e.message }],
				),
			),
		);
		setPlugins(rows.flat());
		setBusy(false);
	};
	const update = async (rows: PluginRow[]) => {
		setBusy(true);
		let done = 0;
		for (const row of rows) {
			try {
				await api("POST", `/api/sites/${row.site.id}/proxy/api/registry/install`, {
					registry: row.registry,
					id: row.id,
				});
				done++;
				setPlugins((all) => all.filter((r) => r !== row));
			} catch (e) {
				setPlugins((all) => all.map((r) => (r === row ? { ...r, error: (e as Error).message } : r)));
			}
		}
		toast(`${done} plugin${done === 1 ? "" : "s"} updated. Each waits for approval on its site under Plugins.`);
		setBusy(false);
	};
	const updatable = plugins.filter((p) => p.id && !p.error);

	return (
		<>
			<div className="flex flex-wrap gap-1">
				<Button size="sm" variant="ghost" disabled={busy || !sites.length} onClick={() => void checkAll()}>
					<RefreshCw size={13} /> Check all
				</Button>
				<Button size="sm" variant="ghost" disabled={busy || !sites.length} onClick={() => void scanAll()}>
					<ShieldCheck size={13} /> Scan all
				</Button>
				<Button size="sm" variant="ghost" disabled={busy || !sites.length} onClick={() => void findUpdates()}>
					<Package size={13} /> Plugin updates
				</Button>
			</div>
			{open === "scan" && (
				<Dialog open title="Security scan — all sites" onClose={() => setOpen(null)}>
					{busy ? (
						<p className="text-sm text-muted-foreground">Scanning {sites.length} sites…</p>
					) : (
						<ul className="grid gap-4">
							{scans.map(({ site, scan, error }) => (
								<li key={site.id} className="grid gap-1.5">
									<p className="text-sm font-medium">{site.name}</p>
									{scan ? <Findings scan={scan} /> : <ErrorText>{error ?? null}</ErrorText>}
								</li>
							))}
						</ul>
					)}
				</Dialog>
			)}
			{open === "plugins" && (
				<Dialog
					open
					title="Plugin updates — all sites"
					description="Updates come from each site's plugin registries. An updated plugin stays off until someone approves it on that site."
					onClose={() => setOpen(null)}
					footer={
						<Button disabled={busy || updatable.length === 0} onClick={() => void update(updatable)}>
							Update all ({updatable.length})
						</Button>
					}
				>
					<div className="grid gap-3">
						<form
							className="flex items-end gap-2"
							onSubmit={(e) => {
								e.preventDefault();
								void findUpdates();
							}}
						>
							<Input
								label="Filter"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Plugin name"
							/>
							<Button type="submit" variant="secondary" disabled={busy}>
								Search
							</Button>
						</form>
						{busy && <p className="text-sm text-muted-foreground">Working…</p>}
						{!busy && plugins.length === 0 && (
							<p className="text-sm text-muted-foreground">Everything is up to date.</p>
						)}
						<ul className="grid gap-2">
							{plugins.map((row, i) => (
								<li key={i} className="flex items-center justify-between gap-2 text-sm">
									<span className="grid">
										<span className="font-medium">{row.site.name}</span>
										{row.id ? (
											<span className="text-xs text-muted-foreground">
												{row.id}: {row.installedVersion} → {row.version}
											</span>
										) : null}
										{row.error && <span className="text-xs text-destructive">{row.error}</span>}
									</span>
									{row.id && !row.error && (
										<Button size="sm" variant="secondary" disabled={busy} onClick={() => void update([row])}>
											Update
										</Button>
									)}
								</li>
							))}
						</ul>
					</div>
				</Dialog>
			)}
		</>
	);
}
