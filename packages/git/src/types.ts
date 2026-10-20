export interface Commit {
	sha: string;
	message: string;
	author: string;
	date: string;
}

export interface GitAdapter {
	/** Stages `paths` and commits them. Returns the new sha. Throws if nothing changed. */
	commit(paths: string[], message: string): Promise<string>;
	history(path?: string): Promise<Commit[]>;
	diff(sha: string): Promise<string>;
	/** Adds a new revert commit; history is never rewritten. */
	revert(sha: string): Promise<string>;
}
