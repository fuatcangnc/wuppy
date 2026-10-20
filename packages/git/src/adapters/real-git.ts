import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Commit, GitAdapter } from "../types.ts";

const run = promisify(execFile);
const SHA = /^[0-9a-f]{7,40}$/i;
const SEP = "\x1f";
const END = "\x1e";

function assertSha(sha: string): void {
	if (!SHA.test(sha)) throw new Error(`Invalid sha: ${JSON.stringify(sha)}`);
}

function assertRepoPath(p: string): void {
	if (!p || p.startsWith("-") || p.startsWith("/") || p.includes("\0") || p.split(/[\\/]/).includes("..")) {
		throw new Error(`Unsafe path: ${JSON.stringify(p)}`);
	}
}

export class RealGit implements GitAdapter {
	private constructor(private readonly cwd: string) {}

	static async init(cwd: string): Promise<RealGit> {
		const g = new RealGit(cwd);
		await g.git("init", "-q");
		return g;
	}

	/** Open `cwd`'s repository, creating one if the directory is not already a git work tree. */
	static async ensure(cwd: string): Promise<RealGit> {
		const g = new RealGit(cwd);
		const inside = await g.git("rev-parse", "--is-inside-work-tree").catch(() => "");
		return inside.trim() === "true" ? g : RealGit.init(cwd);
	}

	/** Use an existing repository. */
	static open(cwd: string): RealGit {
		return new RealGit(cwd);
	}

	private async git(...args: string[]): Promise<string> {
		try {
			const { stdout } = await run("git", args, {
				cwd: this.cwd,
				maxBuffer: 32 * 1024 * 1024,
				env: {
					...process.env,
					GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME ?? "Wuppy",
					GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL ?? "wuppy@localhost",
					GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME ?? "Wuppy",
					GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL ?? "wuppy@localhost",
				},
			});
			return stdout;
		} catch (e) {
			const err = e as { stdout?: string; stderr?: string; message: string };
			throw new Error(`git ${args[0]} failed: ${(err.stderr || err.stdout || err.message).trim()}`, { cause: e });
		}
	}

	async commit(paths: string[], message: string): Promise<string> {
		paths.forEach(assertRepoPath);
		await this.git("add", "--", ...paths);
		const staged = await this.git("diff", "--cached", "--name-only", "--", ...paths);
		if (!staged.trim()) throw new Error("Nothing to commit");
		await this.git("commit", "-q", "-m", message, "--", ...paths);
		return (await this.git("rev-parse", "HEAD")).trim();
	}

	async history(path?: string): Promise<Commit[]> {
		if (path) assertRepoPath(path);
		const fmt = ["%H", "%s", "%an", "%aI"].join(SEP) + END;
		const out = await this.git("log", `--format=${fmt}`, ...(path ? ["--", path] : [])).catch((e: Error) => {
			if (/does not have any commits yet/.test(e.message)) return "";
			throw e;
		});
		return out
			.split(END)
			.map((r) => r.trim())
			.filter(Boolean)
			.map((r) => {
				const [sha = "", message = "", author = "", date = ""] = r.split(SEP);
				return { sha, message, author, date };
			});
	}

	async diff(sha: string): Promise<string> {
		assertSha(sha);
		return this.git("show", "--format=", sha);
	}

	async revert(sha: string): Promise<string> {
		assertSha(sha);
		await this.git("revert", "--no-edit", sha);
		return (await this.git("rev-parse", "HEAD")).trim();
	}
}
