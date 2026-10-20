import { atom } from "nanostores";
import { apiData, slugPath } from "../lib/api.ts";
import type { FieldChange } from "../components/git/RevisionCompare.tsx";

export interface CommitInfo {
	sha: string;
	message: string;
	author: string;
	date: string;
}

export const $history = atom<CommitInfo[]>([]);
export const $diff = atom<{ sha: string; text: string } | null>(null);
export const $compare = atom<{ sha: string; changes: FieldChange[] } | null>(null);
export const $gitError = atom<string | null>(null);

export async function loadHistory(collection: string, slug: string): Promise<void> {
	$gitError.set(null);
	try {
		$history.set(await apiData<CommitInfo[]>("GET", `/api/history/${collection}/${slugPath(slug)}`));
	} catch (e) {
		$gitError.set((e as Error).message);
	}
}

export async function showDiff(sha: string): Promise<void> {
	try {
		$diff.set({ sha, text: await apiData<string>("GET", `/api/commits/${sha}/diff`) });
	} catch (e) {
		$gitError.set((e as Error).message);
	}
}

/** Field-by-field comparison of an old version with the current one. */
export async function compareWith(sha: string, collection: string, slug: string): Promise<void> {
	try {
		const { changes } = await apiData<{ changes: FieldChange[] }>(
			"GET",
			`/api/revisions/${collection}/${sha}/${slugPath(slug)}`,
		);
		$compare.set({ sha, changes });
	} catch (e) {
		$gitError.set((e as Error).message);
	}
}

export async function revert(sha: string, collection: string, slug: string): Promise<void> {
	try {
		await apiData("POST", `/api/commits/${sha}/revert`);
		await loadHistory(collection, slug);
	} catch (e) {
		$gitError.set((e as Error).message);
	}
}
