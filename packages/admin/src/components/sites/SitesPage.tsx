import {
	ChevronLeft,
	ChevronRight,
	ExternalLink,
	Globe,
	KeyRound,
	LogIn,
	Plus,
	RefreshCw,
	Search,
	Sparkles,
	Trash2,
} from "@react-zero-ui/icon-sprite";
import { useNavigate } from "@tanstack/react-router";
import { useStore } from "@nanostores/react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, apiData } from "../../lib/api.ts";
import { $sites, loadSites, switchSite, type ManagedSite } from "../../stores/sites.ts";
import { $session } from "../../stores/session.ts";
import { Badge, Button, Dialog, EmptyState, ErrorText, Input, Select, toast } from "../../ui/index.tsx";
import { WorkspaceLayout, WorkspacePanel, WorkspaceSidebar } from "../shared/WorkspaceLayout.tsx";
import { ContextNote } from "./ContextNote.tsx";
import { SiteMembers } from "./SiteMembers.tsx";
import { BulkCare, SiteCare } from "./SiteCare.tsx";

const STATUS: Record<ManagedSite["status"], { label: string; tone: "success" | "danger" | "neutral"; dot: string }> = {
	connected: { label: "Connected", tone: "success", dot: "bg-emerald-500" },
	connection_error: { label: "Connection problem", tone: "danger", dot: "bg-destructive" },
	unchecked: { label: "Not checked", tone: "neutral", dot: "bg-muted-foreground" },
};
const TABS = [
	{ id: "", label: "All" },
	{ id: "connected", label: "Connected" },
	{ id: "connection_error", label: "Problems" },
	{ id: "unchecked", label: "Not checked" },
] as const;
const PERMISSION_LABELS: Record<string, string> = {
	"content:read": "Read content",
	"content:write": "Write content",
	"content:publish": "Publish",
	"media:write": "Upload media",
	"site:settings": "Site settings",
	"git:revert": "Restore revisions",
	"audit:read": "Security log",
};

const host = (url: string) => url.replace(/^https?:\/\//, "");
const DAY = 86_400_000;
function ago(iso: string | null): string {
	if (!iso) return "never";
	const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes} min ago`;
	if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
	return `${Math.round(minutes / 1440)} d ago`;
}
function expiry(iso: string | null): { text: string; warn: boolean } {
	if (!iso) return { text: "No expiry", warn: false };
	const days = Math.ceil((new Date(iso).getTime() - Date.now()) / DAY);
	if (days < 0) return { text: `Expired ${-days} d ago`, warn: true };
	return { text: `${days} d left`, warn: days <= 14 };
}

function SiteAvatar({ site, size = "sm" }: { site: ManagedSite; size?: "sm" | "lg" }) {
	return (
		<span
			aria-hidden="true"
			className={`relative grid shrink-0 place-items-center rounded-md border border-border bg-secondary font-semibold text-foreground ${
				size === "lg" ? "size-14 text-xl" : "size-10 text-sm"
			}`}
		>
			{site.name.trim().charAt(0).toUpperCase() || <Globe size={14} />}
			<span
				className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-card ${STATUS[site.status].dot}`}
			/>
		</span>
	);
}

type Modal =
	| { kind: "add" }
	| { kind: "edit"; site: ManagedSite }
	| { kind: "token"; site: ManagedSite }
	| { kind: "disconnect"; site: ManagedSite }
	| null;

/** One form for add / rename / new token / disconnect; each sends only its own fields. */
function SiteForm({
	modal,
	onDone,
	onCreated,
}: {
	modal: NonNullable<Modal>;
	onDone: () => void;
	onCreated?: (id: string) => void;
}) {
	const site = "site" in modal ? modal.site : null;
	const [name, setName] = useState(site?.name ?? "");
	const [url, setUrl] = useState("");
	const [token, setToken] = useState("");
	const [confirm, setConfirm] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const titles = {
		add: "Connect a site",
		edit: "Rename site",
		token: "Replace hub token",
		disconnect: "Disconnect site",
	};
	const submit = async (e: FormEvent) => {
		e.preventDefault();
		setBusy(true);
		setError(null);
		try {
			if (modal.kind === "add") {
				const created = await apiData<{ id: string }>("POST", "/api/sites", { name, url, token });
				onCreated?.(created.id);
			}
			if (modal.kind === "edit") await api("PATCH", `/api/sites/${site!.id}`, { name });
			if (modal.kind === "token") await api("PUT", `/api/sites/${site!.id}/token`, { token });
			if (modal.kind === "disconnect") await api("DELETE", `/api/sites/${site!.id}`);
			toast(modal.kind === "disconnect" ? "Site disconnected" : "Saved");
			onDone();
		} catch (failure) {
			setError((failure as Error).message);
		} finally {
			setBusy(false);
		}
	};
	const tokenField = (
		<Input
			label="Hub token"
			type="password"
			autoComplete="off"
			required
			value={token}
			onChange={(e) => setToken(e.target.value)}
			hint="On the site: Users → API tokens → Access “Connect to a hub”. It is stored encrypted and never shown again."
		/>
	);
	const ready =
		modal.kind === "disconnect"
			? confirm === site!.name
			: modal.kind === "add"
				? name.trim() && url.trim() && token.trim()
				: modal.kind === "token"
					? token.trim()
					: name.trim();
	return (
		<Dialog
			open
			title={titles[modal.kind]}
			description={site ? site.url : undefined}
			onClose={onDone}
			footer={
				<>
					<Button variant="ghost" onClick={onDone}>
						Cancel
					</Button>
					<Button
						type="submit"
						form="site-form"
						variant={modal.kind === "disconnect" ? "destructive" : "default"}
						disabled={!ready || busy}
					>
						{modal.kind === "disconnect" ? "Disconnect" : modal.kind === "add" ? "Connect" : "Save"}
					</Button>
				</>
			}
		>
			<form id="site-form" className="grid gap-3" onSubmit={(e) => void submit(e)}>
				{(modal.kind === "add" || modal.kind === "edit") && (
					<Input label="Name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
				)}
				{modal.kind === "add" && (
					<Input
						label="Site address"
						type="url"
						required
						placeholder="https://example.com"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
					/>
				)}
				{(modal.kind === "add" || modal.kind === "token") && tokenField}
				{modal.kind === "disconnect" && (
					<>
						<p className="text-sm text-muted-foreground">
							This only removes the site from this Wuppy, with its members. Nothing on the site changes. Revoke the hub
							token on the site too.
						</p>
						<Input
							label={`Type “${site!.name}” to confirm`}
							value={confirm}
							onChange={(e) => setConfirm(e.target.value)}
						/>
					</>
				)}
				<ErrorText>{error}</ErrorText>
			</form>
		</Dialog>
	);
}

export function SitesPage() {
	const navigate = useNavigate();
	const state = useStore($sites);
	const session = useStore($session);
	const [modal, setModal] = useState<Modal>(null);
	const [checking, setChecking] = useState<string | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("");
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const [rename, setRename] = useState("");
	const localAllowed = session.status === "authed" && session.user.role !== "client";
	const reload = useCallback(() => loadSites(localAllowed), [localAllowed]);
	useEffect(() => void reload(), [reload]);

	const sites = state.status === "ready" ? state.sites : [];
	const current = sites.find((s) => s.id === selected) ?? sites[0] ?? null;
	useEffect(() => setRename(current?.name ?? ""), [current?.id, current?.name]);

	if (state.status !== "ready") return null;
	if (!state.canManage)
		return <EmptyState title="Not available" description="Only administrators manage connected sites." />;

	const needle = query.trim().toLowerCase();
	const filtered = sites.filter(
		(s) =>
			(!tab || s.status === tab) &&
			(!needle || s.name.toLowerCase().includes(needle) || s.url.toLowerCase().includes(needle)),
	);
	const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
	const currentPage = Math.min(page, pageCount);
	const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
	const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
	const rangeEnd = Math.min(currentPage * pageSize, filtered.length);
	const countOf = (id: string) => (id ? sites.filter((s) => s.status === id).length : sites.length);

	const check = async (site: ManagedSite) => {
		setChecking(site.id);
		try {
			await apiData("POST", `/api/sites/${site.id}/check`);
			toast(`${site.name} is reachable`);
		} catch (failure) {
			toast((failure as Error).message, "error");
		} finally {
			setChecking(null);
			void reload();
		}
	};
	const saveName = async (site: ManagedSite) => {
		try {
			await api("PATCH", `/api/sites/${site.id}`, { name: rename.trim() });
			toast("Saved");
			void reload();
		} catch (failure) {
			toast((failure as Error).message, "error");
		}
	};
	const close = () => {
		setModal(null);
		void reload();
	};
	const token = current ? expiry(current.tokenExpiresAt) : null;

	return (
		<>
			<WorkspaceLayout sidebarWidth={300}>
				<WorkspaceSidebar>
					<div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
						<div className="grid gap-0.5">
							<h1 className="text-base font-semibold">Sites</h1>
							<p className="text-[11px] text-muted-foreground">
								{filtered.length === sites.length ? sites.length : `${filtered.length} of ${sites.length}`}{" "}
								{sites.length === 1 ? "site" : "sites"} managed from here
							</p>
						</div>
						<Button
							variant="secondary"
							size="icon-sm"
							style={{ borderRadius: "200px" }}
							className="border-border bg-white text-[#101011] shadow-sm hover:bg-zinc-200!"
							aria-label="Connect site"
							title="Connect site"
							onClick={() => setModal({ kind: "add" })}
						>
							<Plus size="1em" />
						</Button>
					</div>
					<div className="grid gap-2 border-b border-border p-3">
						<div className="-mx-3 -mt-3 border-b border-border">
							<div className="relative">
								<Search
									size="1em"
									className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-muted-foreground"
								/>
								<Input
									aria-label="Search sites"
									className="h-12 rounded-none border-transparent bg-transparent pl-11 pr-4 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
									value={query}
									onChange={(event) => {
										setQuery(event.target.value);
										setPage(1);
									}}
									placeholder="Search sites..."
								/>
							</div>
						</div>
						<div className="flex items-center gap-0.5 overflow-x-auto" role="tablist" aria-label="Status">
							{TABS.map((entry) => (
								<button
									key={entry.id}
									type="button"
									role="tab"
									aria-selected={tab === entry.id}
									onClick={() => {
										setTab(entry.id);
										setPage(1);
									}}
									className={`shrink-0 rounded-md px-1.5 py-1 text-[10px] ${tab === entry.id ? "bg-tab text-foreground" : "text-muted-foreground hover:bg-muted/60"}`}
								>
									{entry.label} <span className="tabular-nums opacity-60">{countOf(entry.id)}</span>
								</button>
							))}
						</div>
					</div>
					<div className="grid gap-1 border-b border-border px-3 py-2 text-xs text-muted-foreground">
						{filtered.length} {filtered.length === 1 ? "site" : "sites"}
						<BulkCare sites={filtered} onDone={() => void reload()} />
					</div>

					<div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
						{filtered.length === 0 ? (
							<EmptyState
								title={sites.length === 0 ? "No connected sites" : "No matches"}
								description={
									sites.length === 0
										? "Connect another Wuppy to manage it here."
										: "Change the search or the status tab."
								}
							/>
						) : (
							<ul className="grid gap-1">
								{visible.map((site) => (
									<li key={site.id}>
										<button
											type="button"
											aria-current={current?.id === site.id ? "true" : undefined}
											onClick={() => setSelected(site.id)}
											className={`flex w-full min-w-0 items-center gap-2 rounded-lg border p-2 text-left transition ${
												current?.id === site.id
													? "border-primary/50 bg-secondary"
													: "border-transparent hover:bg-muted/50"
											}`}
										>
											<SiteAvatar site={site} />
											<span className="grid min-w-0 flex-1 gap-0.5">
												<span className="truncate text-xs font-medium">{site.name}</span>
												<span className="truncate text-[10px] text-muted-foreground">
													{host(site.url)} · {STATUS[site.status].label}
												</span>
											</span>
										</button>
									</li>
								))}
							</ul>
						)}
					</div>
					<div className="grid gap-1 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
						<span className="tabular-nums">
							Showing {rangeStart}-{rangeEnd} of {filtered.length}
						</span>
						<div className="flex items-center justify-between gap-1">
							<div className="flex items-center gap-0.5" aria-label="Pagination">
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label="Previous page"
									disabled={currentPage <= 1}
									onClick={() => setPage(currentPage - 1)}
								>
									<ChevronLeft size={13} />
								</Button>
								{Array.from({ length: pageCount }, (_, index) => index + 1)
									.filter((n) => Math.abs(n - currentPage) <= 2 || n === 1 || n === pageCount)
									.map((n) => (
										<Button
											key={n}
											variant={n === currentPage ? "secondary" : "ghost"}
											size="icon-sm"
											className="size-7 text-[11px]"
											aria-label={`Page ${n}`}
											aria-current={n === currentPage ? "page" : undefined}
											onClick={() => setPage(n)}
										>
											{n}
										</Button>
									))}
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label="Next page"
									disabled={currentPage >= pageCount}
									onClick={() => setPage(currentPage + 1)}
								>
									<ChevronRight size={13} />
								</Button>
							</div>
							<Select
								aria-label="Per page"
								size="sm"
								className="w-[4.25rem]"
								value={String(pageSize)}
								onChange={(event) => {
									setPageSize(Number(event.target.value));
									setPage(1);
								}}
							>
								{[10, 20, 50, 100].map((size) => (
									<option key={size} value={size}>
										{size}
									</option>
								))}
							</Select>
						</div>
					</div>
				</WorkspaceSidebar>

				<WorkspacePanel className="min-[1400px]:grid-cols-[minmax(0,1fr)_360px]">
					<section className="custom-scrollbar flex min-h-0 flex-col overflow-y-auto border-b border-border min-[1400px]:border-e min-[1400px]:border-b-0">
						{current ? (
							<div className="grid content-start gap-6 p-6">
								<header className="flex flex-wrap items-center gap-4">
									<SiteAvatar site={current} size="lg" />
									<div className="grid min-w-0 flex-1 gap-1">
										<h2 className="truncate text-xl font-semibold">{current.name}</h2>
										<a
											href={current.url}
											target="_blank"
											rel="noreferrer"
											className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
										>
											{host(current.url)} <ExternalLink size={12} />
										</a>
									</div>
									<Badge tone={STATUS[current.status].tone}>{STATUS[current.status].label}</Badge>
								</header>

								{current.lastError && (
									<div
										role="alert"
										className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
									>
										<span>{current.lastError}</span>
										<Button size="sm" variant="secondary" onClick={() => setModal({ kind: "token", site: current })}>
											<KeyRound size={14} /> Replace token
										</Button>
									</div>
								)}

								<dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
									{[
										["Your role", current.role.charAt(0).toUpperCase() + current.role.slice(1)],
										["Token", token!.text],
										["Last check", ago(current.lastCheckedAt)],
										["Connected", new Date(current.createdAt).toLocaleDateString()],
									].map(([label, value]) => (
										<div key={label} className="grid gap-1 rounded-lg border border-border bg-card p-3">
											<dt className="text-[11px] text-muted-foreground uppercase">{label}</dt>
											<dd
												className={`text-sm font-medium ${label === "Token" && token!.warn ? "text-destructive" : ""}`}
											>
												{value}
											</dd>
										</div>
									))}
								</dl>

								<div className="grid gap-2">
									<p className="text-xs font-medium tracking-wider text-zinc-400 uppercase">Token access</p>
									{current.permissions.length === 0 ? (
										<p className="text-sm text-muted-foreground">No access recorded yet. Check the connection.</p>
									) : (
										<ul className="flex flex-wrap gap-1.5">
											{current.permissions.map((p) => (
												<li key={p} className="rounded-md border border-border bg-secondary px-2 py-1 text-xs">
													{PERMISSION_LABELS[p] ?? p}
												</li>
											))}
										</ul>
									)}
									<p className="text-xs text-muted-foreground">
										The most anyone can do on this site from here. Each member is limited further by their role.
									</p>
								</div>

								<ContextNote
									key={`brief-${current.id}`}
									path={`/api/sites/${current.id}/context`}
									label="Client brief"
									hint="Goals, brand voice, preferences. The assistant reads it before working on this site; clients never see it."
								/>

								<SiteCare key={`care-${current.id}`} site={current} />

								<div className="grid gap-2">
									<p className="text-xs font-medium tracking-wider text-zinc-400 uppercase">Members</p>
									<SiteMembers key={current.id} site={current} />
								</div>
							</div>
						) : (
							<div className="grid flex-1 place-items-center p-6">
								<div className="mx-auto grid w-full max-w-md justify-items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-secondary/25 px-8 py-12 text-center">
									<span className="grid size-16 place-items-center rounded-full border border-border bg-white text-[#101011] shadow-sm">
										<Globe size={24} />
									</span>
									<div className="grid gap-1">
										<p className="font-medium">No connected sites</p>
										<p className="text-sm text-muted-foreground">
											On the other Wuppy, create an API token with access “Connect to a hub”, then connect it here with
											the site's address.
										</p>
									</div>
									<Button variant="secondary" onClick={() => setModal({ kind: "add" })}>
										<Plus size={14} /> Connect site
									</Button>
								</div>
							</div>
						)}
					</section>

					<aside className="custom-scrollbar min-h-0 overflow-y-auto">
						{current && (
							<div data-testid="site-inspector" className="grid gap-5 p-5">
								<form
									className="grid gap-3"
									onSubmit={(event) => {
										event.preventDefault();
										void saveName(current);
									}}
								>
									<Input
										label="Name"
										required
										maxLength={80}
										value={rename}
										onChange={(event) => setRename(event.target.value)}
									/>
									<Button type="submit" disabled={!rename.trim() || rename.trim() === current.name}>
										Save
									</Button>
								</form>

								<div className="grid gap-2">
									<p className="text-xs font-medium tracking-wider text-zinc-400 uppercase">Actions</p>
									<Button variant="secondary" className="justify-start" onClick={() => switchSite(current.id)}>
										<LogIn size={14} /> Manage this site
									</Button>
									<Button
										variant="secondary"
										className="justify-start"
										onClick={() => void navigate({ to: "/assistant", search: { site: current.id } })}
									>
										<Sparkles size={14} /> Ask the assistant
									</Button>
									<Button
										variant="secondary"
										className="justify-start"
										disabled={checking === current.id}
										onClick={() => void check(current)}
									>
										<RefreshCw size={14} /> {checking === current.id ? "Checking…" : "Check connection"}
									</Button>
									<Button
										variant="secondary"
										className="justify-start"
										onClick={() => setModal({ kind: "token", site: current })}
									>
										<KeyRound size={14} /> Replace token
									</Button>
									<Button
										variant="destructive"
										className="justify-start"
										onClick={() => setModal({ kind: "disconnect", site: current })}
									>
										<Trash2 size={14} /> Disconnect
									</Button>
								</div>

								<div className="grid gap-2">
									<p className="text-xs font-medium tracking-wider text-zinc-400 uppercase">Details</p>
									<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
										<dt className="text-muted-foreground">Address</dt>
										<dd className="truncate text-end" title={current.url}>
											{host(current.url)}
										</dd>
										<dt className="text-muted-foreground">Status</dt>
										<dd className="text-end">{STATUS[current.status].label}</dd>
										<dt className="text-muted-foreground">Hub token</dt>
										<dd className="text-end font-mono">…{current.tokenLast4}</dd>
										<dt className="text-muted-foreground">Token expires</dt>
										<dd className="text-end">
											{current.tokenExpiresAt ? new Date(current.tokenExpiresAt).toLocaleDateString() : "—"}
										</dd>
										<dt className="text-muted-foreground">Last check</dt>
										<dd className="text-end">
											{current.lastCheckedAt ? new Date(current.lastCheckedAt).toLocaleString() : "never"}
										</dd>
										<dt className="text-muted-foreground">Connected</dt>
										<dd className="text-end">{new Date(current.createdAt).toLocaleDateString()}</dd>
									</dl>
								</div>
							</div>
						)}
					</aside>
				</WorkspacePanel>
			</WorkspaceLayout>
			{modal && <SiteForm modal={modal} onDone={close} onCreated={setSelected} />}
		</>
	);
}
