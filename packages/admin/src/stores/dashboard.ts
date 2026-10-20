import { atom, map } from "nanostores";
import { apiData } from "../lib/api.ts";

export interface DashboardCollection {
	name: string;
	total: number;
	published: number;
	draft: number;
	scheduled: number;
}
export interface RecentEntry {
	collection: string;
	slug: string;
	title: string;
	status: "draft" | "scheduled" | "published";
	modified: string;
}
export interface DashboardData {
	drafts: number;
	media: number;
	users: number;
	collections: DashboardCollection[];
	recent: RecentEntry[];
}

export const $dashboard = atom<DashboardData | null>(null);
export const $dashboardError = atom<string | null>(null);

export async function loadDashboard(): Promise<void> {
	$dashboardError.set(null);
	try {
		$dashboard.set(await apiData<DashboardData>("GET", "/api/dashboard"));
	} catch (e) {
		$dashboardError.set((e as Error).message);
	}
}

export interface DataFile<T> {
	value: T | null;
	error: string | null;
}
export const $data = map<Record<string, unknown>>({});
export const $dataErrors = map<Record<string, string | null>>({});

export async function loadData<T>(name: string): Promise<T> {
	$dataErrors.setKey(name, null);
	try {
		const value = await apiData<T>("GET", `/api/data/${name}`);
		$data.setKey(name, value);
		return value;
	} catch (e) {
		$dataErrors.setKey(name, (e as Error).message);
		throw e;
	}
}

export async function saveData<T>(name: string, value: T): Promise<T> {
	$dataErrors.setKey(name, null);
	try {
		const saved = await apiData<T>("PUT", `/api/data/${name}`, { data: value });
		$data.setKey(name, saved);
		return saved;
	} catch (e) {
		$dataErrors.setKey(name, (e as Error).message);
		throw e;
	}
}
