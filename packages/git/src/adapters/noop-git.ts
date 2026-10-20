import type { Commit, GitAdapter } from "../types.ts";

/** For sites that do not use Git: writes succeed, history is empty. */
export class NoopGit implements GitAdapter {
	async commit(): Promise<string> {
		return "";
	}
	async history(): Promise<Commit[]> {
		return [];
	}
	async diff(): Promise<string> {
		return "";
	}
	async revert(): Promise<string> {
		throw new Error("Revert is unavailable without Git");
	}
}
