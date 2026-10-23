import { atom } from "nanostores";
import { api, apiData, apiSite, setApiSite } from "../lib/api.ts";
import { $dirty } from "./editor.ts";

export interface ManagedSite {
	id: string;
	name: string;
	url: string;
	tokenLast4: string;
	status: "connected" | "connection_error" | "unchecked";
	permissions: string[];
	tokenExpiresAt: string | null;
	lastCheckedAt: string | null;
	lastError: string | null;
	createdAt: string;
	/** The role the signed-in user acts with on this site. */
	role: "admin" | "editor" | "author" | "viewer";
}

export type SitesState =
	| { status: "loading" }
	| {
			status: "ready";
			sites: ManagedSite[];
			canManage: boolean;
			/** Clients have no access to this install itself, only to their sites. */
			localAllowed: boolean;
			active: string;
			/** Effective permissions on the active remote site; null while on Local. */
			permissions: string[] | null;
	  };

export const $sites = atom<SitesState>({ status: "loading" });

/** Loads the sites this user may open and settles which one is active before any content request is made. */
export async function loadSites(localAllowed: boolean): Promise<void> {
	let sites: ManagedSite[] = [];
	let canManage = false;
	try {
		const res = await api<{ data: ManagedSite[]; meta?: { canManage?: boolean } }>("GET", "/api/sites");
		sites = res.data;
		canManage = res.meta?.canManage === true;
	} catch {
		// managed sites unavailable: Local only
	}
	let active = apiSite();
	if (!sites.some((s) => s.id === active)) active = localAllowed ? "local" : (sites[0]?.id ?? "local");
	setApiSite(active);
	let permissions: string[] | null = null;
	if (active !== "local") {
		permissions = await apiData<{ permissions: string[] }>("GET", `/api/sites/${active}/me`)
			.then((d) => d.permissions)
			.catch(() => []);
	}
	$sites.set({ status: "ready", sites, canManage, localAllowed, active, permissions });
}

/** A full reload is the switch: no list, draft or cache from the previous site can leak into the next one. */
export function switchSite(id: string): void {
	if (id === apiSite()) return;
	if ($dirty.get() && !window.confirm("You have unsaved changes. Switch site and discard them?")) return;
	setApiSite(id);
	window.location.assign("/admin/");
}

export const activeManagedSite = (state: SitesState): ManagedSite | null =>
	state.status === "ready" ? (state.sites.find((s) => s.id === state.active) ?? null) : null;
