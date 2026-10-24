import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const git = promisify(execFile);

export interface Migration {
	/** Runs once, when the project moves from a version below `to` to one at or above it. */
	to: string;
	title: string;
	run: (cwd: string) => Promise<void>;
}

/** Data files are parsed with defaults, so no release has needed a migration yet; add one here when a format changes. */
export const MIGRATIONS: Migration[] = [];

const parts = (v: string) =>
	v
		.split(/[.-]/)
		.slice(0, 3)
		.map((n) => Number.parseInt(n, 10) || 0);
export const compareVersions = (a: string, b: string) => {
	const [x, y] = [parts(a), parts(b)];
	for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] ?? 0) - (y[i] ?? 0);
	return 0;
};

const readJson = async <T>(path: string): Promise<T | null> =>
	readFile(path, "utf8").then(
		(text) => JSON.parse(text) as T,
		() => null,
	);

export interface UpgradeResult {
	code: number;
	message: string;
}

/**
 * Brings project data up to the installed `wuppycms` version. Install the new version first (`pnpm up wuppycms`);
 * the previous state is whatever Git has, so a dirty tree is refused: rolling back is `git checkout`.
 */
export async function upgrade(cwd: string, { force = false } = {}): Promise<UpgradeResult> {
	const installed = (await readJson<{ version: string }>(join(cwd, "node_modules", "wuppycms", "package.json")))?.version;
	if (!installed) return { code: 1, message: "wuppy is not installed here. Run your package manager's install first." };
	const stateFile = join(cwd, ".wuppy", "version.json");
	const from = (await readJson<{ version: string }>(stateFile))?.version ?? "0.0.0";
	if (compareVersions(installed, from) < 0)
		return {
			code: 1,
			message: `Installed ${installed} is older than the data (${from}). Downgrades are not supported; restore from Git or a backup.`,
		};

	const pending = MIGRATIONS.filter((m) => compareVersions(m.to, from) > 0 && compareVersions(m.to, installed) <= 0);
	const isRepo = await access(join(cwd, ".git")).then(
		() => true,
		() => false,
	);
	if (pending.length > 0 && isRepo && !force) {
		const { stdout } = await git("git", ["status", "--porcelain"], { cwd });
		if (stdout.trim())
			return {
				code: 1,
				message:
					"Commit or stash your changes first, so the upgrade can be undone with `git checkout .` (or pass --force).",
			};
	}
	for (const m of pending) await m.run(cwd);
	await mkdir(join(cwd, ".wuppy"), { recursive: true });
	await writeFile(stateFile, JSON.stringify({ version: installed }) + "\n");
	const done = pending.length ? pending.map((m) => `  - ${m.title}`).join("\n") : "  (no data changes needed)";
	return {
		code: 0,
		message: `Upgraded ${from} -> ${installed}\n${done}\nRun \`wuppycms types\` to refresh generated types. To undo data changes: git checkout . && git clean -fd .wuppy/data`,
	};
}
