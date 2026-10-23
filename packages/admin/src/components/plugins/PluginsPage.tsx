import { useCallback, useEffect, useState } from "react";
import { apiData } from "../../lib/api.ts";
import {
	Badge,
	Button,
	Card,
	CardHeader,
	Checkbox,
	EmptyState,
	ErrorText,
	Input,
	PageHeader,
	Spinner,
	toast,
} from "../../ui/index.tsx";

interface Manifest {
	id: string;
	version: string;
	name?: string;
	description?: string;
	author?: string;
	hooks: string[];
	routes: Array<{ path: string; methods: string[] }>;
	adminPages: Array<{ path: string; label: string }>;
	settings: Array<{ key: string; label: string; type: "string" | "boolean" | "number"; help?: string }>;
	capabilities: {
		content: { read: string[]; write: string[] };
		network: Array<{ host: string; methods: string[]; paths: string[] }>;
		secrets: string[];
		email: boolean;
	};
	limits: { timeoutMs: number; memoryMb: number; callsPerMinute: number };
}
export interface PluginRow {
	dir: string;
	id: string | null;
	version: string | null;
	name?: string;
	state: "active" | "disabled" | "needs-approval" | "error";
	source: "config" | "registry";
	registry?: string;
	pendingHash?: string;
	error?: string;
	manifest?: Manifest;
	stats?: { calls: number; failures: number; callsThisMinute: number; quota: number; totalMs: number };
	lastError?: { message: string; at: string };
	logs?: string[];
}
interface Listing {
	id: string;
	name?: string;
	description?: string;
	version: string;
	registry: string;
	verified: boolean;
	installedVersion: string | null;
	updateAvailable: boolean;
}

const TONE = { active: "success", disabled: "warning", "needs-approval": "warning", error: "danger" } as const;

/** What the plugin could do, in plain words, for the approval screen. */
export function capabilityLines(m: Manifest): string[] {
	const c = m.capabilities;
	const has = (hook: string) => m.hooks.includes(hook);
	const seen = [...new Set([...c.content.read, ...c.content.write])].join(", ");
	return [
		...c.content.read.map((x) => `Read ${x} content`),
		...c.content.write.map((x) => `Create and overwrite ${x} content`),
		...(has("beforeContentSave") && seen ? [`Refuse saves of ${seen} entries`] : []),
		...(has("beforeContentSave") && c.content.write.length
			? [`Change ${c.content.write.join(", ")} entries as they are saved`]
			: []),
		...(has("beforeContentDelete") && seen ? [`Refuse deleting ${seen} entries`] : []),
		...(has("beforeMediaUpload") ? ["Refuse media uploads"] : []),
		...(has("beforeCommentCreate") ? ["Refuse, hold or mark visitor comments as spam"] : []),
		...c.network.map((r) => `Call ${r.host} (${r.methods.join("/")} ${r.paths.join(", ")})`),
		...c.secrets.map((x) => `Read secret ${x}`),
		...(c.email ? ["Send email from this site"] : []),
	];
}

function Settings({ row }: { row: PluginRow }) {
	const [values, setValues] = useState<Record<string, string | boolean | number> | null>(null);
	useEffect(() => {
		void apiData<{ values: Record<string, string | boolean | number> }>("GET", `/api/plugin-admin/${row.id}/settings`)
			.then((r) => setValues(r.values))
			.catch(() => setValues({}));
	}, [row.id]);
	const fields = row.manifest?.settings ?? [];
	if (!values || fields.length === 0) return null;
	return (
		<form
			className="grid gap-2"
			onSubmit={(e) => {
				e.preventDefault();
				void apiData("PUT", `/api/plugin-admin/${row.id}/settings`, { values })
					.then(() => toast("Plugin settings saved"))
					.catch((err: Error) => toast(err.message, "error"));
			}}
		>
			<p className="font-medium">Settings</p>
			{fields.map((f) =>
				f.type === "boolean" ? (
					<Checkbox
						key={f.key}
						label={f.label}
						checked={values[f.key] === true}
						onChange={(e) => setValues({ ...values, [f.key]: e.target.checked })}
					/>
				) : (
					<Input
						key={f.key}
						label={f.label}
						type={f.type === "number" ? "number" : "text"}
						hint={f.help}
						value={String(values[f.key] ?? "")}
						onChange={(e) =>
							setValues({ ...values, [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value })
						}
					/>
				),
			)}
			<div>
				<Button type="submit" size="sm">
					Save plugin settings
				</Button>
			</div>
		</form>
	);
}

export function PluginsPage() {
	const [rows, setRows] = useState<PluginRow[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [found, setFound] = useState<{ results: Listing[]; errors: string[] } | null>(null);

	const load = useCallback(
		() =>
			apiData<{ plugins: PluginRow[] }>("GET", "/api/plugins")
				.then((d) => setRows(d.plugins))
				.catch((e: Error) => setError(e.message)),
		[],
	);
	useEffect(() => void load(), [load]);

	const act = (promise: Promise<unknown>, done: string) =>
		promise
			.then(() => {
				toast(done);
				return load();
			})
			.catch((e: Error) => toast(e.message, "error"));

	return (
		<div className="grid gap-4">
			<PageHeader
				title="Plugins"
				description="Sandboxed plugins: review what they may do, switch them on or off, configure them."
			/>
			<ErrorText>{error}</ErrorText>
			{!rows ? (
				<Spinner />
			) : rows.length === 0 ? (
				<EmptyState
					title="No plugins"
					description="Install one from a registry below, or add a plugin directory to wuppy.config."
				/>
			) : (
				rows.map((row) => {
					const m = row.manifest;
					return (
						<Card key={row.dir}>
							<CardHeader
								title={row.name ?? row.id ?? row.dir}
								description={
									m?.description ??
									`${row.version ? `v${row.version}` : ""} ${row.source === "registry" ? `· from ${row.registry}` : "· wuppy.config"}`
								}
								actions={<Badge tone={TONE[row.state]}>{row.state}</Badge>}
							/>
							<div className="grid gap-3 p-4 text-sm">
								{row.state === "error" && (
									<p role="alert" className="text-destructive">
										{row.error}
									</p>
								)}
								{m && (
									<div>
										<p className="font-medium">{row.state === "needs-approval" ? "Asks permission to" : "Can"}</p>
										<ul className="mt-1 list-disc ps-5 text-muted-foreground">
											{capabilityLines(m).map((line) => (
												<li key={line}>{line}</li>
											))}
											{capabilityLines(m).length === 0 && <li>Nothing beyond its own sandbox.</li>}
										</ul>
										<p className="mt-1 text-xs text-muted-foreground">
											Hooks: {m.hooks.join(", ") || "none"} · Routes:{" "}
											{m.routes.map((r) => `${r.methods.join("|")} ${r.path}`).join(", ") || "none"} · Limits:{" "}
											{m.limits.timeoutMs} ms, {m.limits.memoryMb} MB, {m.limits.callsPerMinute} calls/min
										</p>
									</div>
								)}
								{row.state === "needs-approval" && row.pendingHash && (
									<div className="flex flex-wrap items-center gap-2">
										<Button
											size="sm"
											onClick={() =>
												void act(
													apiData("POST", "/api/plugin-admin/approve", { dir: row.dir, hash: row.pendingHash }),
													"Plugin approved",
												)
											}
										>
											Approve these permissions
										</Button>
										<span className="text-xs text-muted-foreground">
											It does not run until you do. A later update that asks for more needs approval again.
										</span>
									</div>
								)}
								{(row.state === "active" || row.state === "disabled") && row.id && (
									<div className="flex flex-wrap gap-2">
										<Button
											size="sm"
											variant="secondary"
											onClick={() =>
												void act(
													apiData("PUT", `/api/plugin-admin/${row.id}/enabled`, { enabled: row.state === "disabled" }),
													row.state === "disabled" ? "Plugin enabled" : "Plugin disabled",
												)
											}
										>
											{row.state === "disabled" ? "Enable" : "Disable"}
										</Button>
									</div>
								)}
								{row.state === "active" && <Settings row={row} />}
								{row.stats && (
									<div>
										<p className="font-medium">Usage</p>
										<p className="text-muted-foreground">
											{row.stats.calls} calls ({row.stats.failures} failed), {row.stats.callsThisMinute}/
											{row.stats.quota} this minute, {row.stats.totalMs} ms total
										</p>
										{row.lastError && (
											<p className="text-destructive">
												Last error ({new Date(row.lastError.at).toLocaleString()}): {row.lastError.message}
											</p>
										)}
									</div>
								)}
								{row.logs && row.logs.length > 0 && (
									<details>
										<summary className="cursor-pointer font-medium">Log ({row.logs.length})</summary>
										<pre className="mt-1 max-h-48 overflow-auto rounded-ui bg-secondary p-2 text-xs">
											{row.logs.join("\n")}
										</pre>
									</details>
								)}
								{row.source === "registry" && (
									<div>
										<Button
											size="sm"
											variant="destructive"
											onClick={() => {
												if (confirm(`Remove ${row.id ?? row.dir}? Its files and settings are deleted.`)) {
													void act(
														apiData("DELETE", `/api/plugin-admin?dir=${encodeURIComponent(row.dir)}`),
														"Plugin removed",
													);
												}
											}}
										>
											Remove
										</Button>
									</div>
								)}
							</div>
						</Card>
					);
				})
			)}

			<Card>
				<CardHeader title="Find plugins" description="Searches the registries listed in wuppy.config." />
				<div className="grid gap-3 p-4">
					<form
						className="flex items-end gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							void apiData<{ results: Listing[]; errors: string[] }>(
								"GET",
								`/api/registry?q=${encodeURIComponent(query)}`,
							)
								.then(setFound)
								.catch((err: Error) => setError(err.message));
						}}
					>
						<Input label="Search registries" value={query} onChange={(e) => setQuery(e.target.value)} />
						<Button type="submit" variant="secondary">
							Search
						</Button>
					</form>
					{found?.errors.map((e) => (
						<p key={e} role="alert" className="text-sm text-destructive">
							{e}
						</p>
					))}
					{found && found.results.length === 0 && found.errors.length === 0 && (
						<p className="text-sm text-muted-foreground">
							No plugins found. Add a registry under `registries` in wuppy.config.
						</p>
					)}
					<ul className="grid gap-2">
						{found?.results.map((r) => (
							<li
								key={`${r.registry}:${r.id}`}
								className="flex flex-wrap items-center justify-between gap-2 rounded-ui border border-border p-2 text-sm"
							>
								<span>
									<strong>{r.name ?? r.id}</strong> v{r.version}{" "}
									<span className="text-muted-foreground">· {r.registry}</span>
									{r.verified ? <Badge tone="success">signed</Badge> : <Badge tone="warning">unsigned</Badge>}
									<span className="block text-muted-foreground">{r.description}</span>
								</span>
								<Button
									size="sm"
									variant="secondary"
									onClick={() =>
										void act(
											apiData("POST", "/api/registry/install", { registry: r.registry, id: r.id }),
											"Installed. Review its permissions to turn it on.",
										)
									}
								>
									{r.updateAvailable
										? `Update from ${r.installedVersion}`
										: r.installedVersion
											? "Reinstall"
											: "Install"}
								</Button>
							</li>
						))}
					</ul>
				</div>
			</Card>
		</div>
	);
}
