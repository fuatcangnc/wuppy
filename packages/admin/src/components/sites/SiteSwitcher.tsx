import { Check, ChevronsUpDown, Computer, Search, Settings } from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { $sites, activeManagedSite, switchSite, type ManagedSite } from "../../stores/sites.ts";
import { Input } from "../../ui/index.tsx";

const host = (url: string) => url.replace(/^https?:\/\//, "");

function SiteMark({ site }: { site: ManagedSite | null }) {
	if (!site) return <Computer size="1em" className="shrink-0 text-muted-foreground" />;
	return (
		<span className="relative grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-semibold text-foreground">
			{site.name.charAt(0).toUpperCase()}
			{site.status === "connection_error" && (
				<span
					className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-destructive"
					aria-label="Connection problem"
				/>
			)}
		</span>
	);
}

export function SiteSwitcher() {
	const state = useStore($sites);
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const box = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!open) return;
		const close = (e: MouseEvent | KeyboardEvent) => {
			if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener("mousedown", close);
		document.addEventListener("keydown", close);
		return () => {
			document.removeEventListener("mousedown", close);
			document.removeEventListener("keydown", close);
		};
	}, [open]);
	if (state.status !== "ready") return null;
	// Nothing to switch between and nothing to manage: keep the sidebar quiet.
	if (state.sites.length === 0 && !state.canManage) return null;
	const active = activeManagedSite(state);
	const q = query.trim().toLowerCase();
	const matches = state.sites.filter((s) => !q || `${s.name} ${s.url}`.toLowerCase().includes(q));
	const showLocal = state.localAllowed && (!q || "local".includes(q));

	const option = (id: string, site: ManagedSite | null) => (
		<li key={id}>
			<button
				type="button"
				role="option"
				aria-selected={state.active === id}
				onClick={() => {
					setOpen(false);
					switchSite(id);
				}}
				className="flex w-full items-center gap-2 px-3 py-2 text-start hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
			>
				<SiteMark site={site} />
				<span className="min-w-0">
					<span className="block truncate text-sm font-medium">{site ? site.name : "Local"}</span>
					{site && <span className="block truncate text-[11px] text-muted-foreground">{host(site.url)}</span>}
				</span>
				{state.active === id && <Check size="1em" className="ms-auto shrink-0 text-primary" />}
			</button>
		</li>
	);

	return (
		<div ref={box} className="relative mb-3">
			<button
				type="button"
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-controls="site-switcher-list"
				onClick={() => setOpen((value) => !value)}
				className="flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm transition-colors hover:bg-muted/60"
			>
				<SiteMark site={active} />
				<span className="truncate font-medium">{active ? active.name : "Local"}</span>
				<ChevronsUpDown size="1em" className="ms-auto shrink-0 text-muted-foreground" />
			</button>
			{open && (
				<div className="absolute inset-x-0 top-11 z-50 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
					<div className="border-b border-border p-2">
						<div className="relative">
							<Search
								size="1em"
								className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								aria-label="Search sites"
								autoFocus
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Search sites..."
								className="h-8 bg-transparent pl-9 text-sm shadow-none"
							/>
						</div>
					</div>
					<ul id="site-switcher-list" role="listbox" aria-label="Sites" className="max-h-72 overflow-auto">
						{showLocal && option("local", null)}
						{matches.map((s) => option(s.id, s))}
						{!showLocal && matches.length === 0 && (
							<li className="px-3 py-2 text-sm text-muted-foreground">No sites found</li>
						)}
					</ul>
					{state.canManage && (
						<Link
							to="/sites"
							onClick={() => setOpen(false)}
							className="flex items-center gap-2 border-t border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
						>
							<Settings size="1em" /> Manage sites
						</Link>
					)}
				</div>
			)}
		</div>
	);
}
