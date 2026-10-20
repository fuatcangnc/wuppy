import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ContentService } from "../content/service.ts";
import { exportContent } from "./index.ts";

export interface BackupInfo {
	name: string;
	bytes: number;
	createdAt: string;
}

const NAME = /^backup-\d{8}T\d{6}(-\d+)?Z\.json$/;

/** Content snapshots under `.wuppy/backups`, newest `keep` retained. Not in Git on purpose: backups of Git belong outside the repo. */
export class BackupService {
	private readonly dir: string;

	constructor(
		root: string,
		private readonly service: ContentService,
		private readonly keep = 14,
	) {
		this.dir = join(root, ".wuppy", "backups");
	}

	async create(now = new Date()): Promise<BackupInfo> {
		await mkdir(this.dir, { recursive: true });
		const stamp = now
			.toISOString()
			.replace(/[-:]/g, "")
			.replace(/\.\d+Z$/, "Z");
		let name = `backup-${stamp}.json`;
		for (let n = 2; await this.has(name); n++) name = `backup-${stamp.slice(0, -1)}-${n}Z.json`;
		await writeFile(join(this.dir, name), JSON.stringify(await exportContent(this.service)), { flag: "wx" });
		await this.prune();
		return (await this.list()).find((b) => b.name === name)!;
	}

	private has(name: string): Promise<boolean> {
		return stat(join(this.dir, name)).then(
			() => true,
			() => false,
		);
	}

	async list(): Promise<BackupInfo[]> {
		const names = await readdir(this.dir).catch(() => [] as string[]);
		const infos = await Promise.all(
			names
				.filter((n) => NAME.test(n))
				.map(async (name) => {
					const s = await stat(join(this.dir, name));
					return { name, bytes: s.size, createdAt: s.mtime.toISOString() };
				}),
		);
		return infos.toSorted((a, b) => b.name.localeCompare(a.name));
	}

	/** Returns the raw JSON, or null for unknown names (the name is matched against a strict pattern, never joined as given). */
	async read(name: string): Promise<string | null> {
		if (!NAME.test(name)) return null;
		return readFile(join(this.dir, name), "utf8").catch(() => null);
	}

	private async prune(): Promise<void> {
		for (const old of (await this.list()).slice(this.keep)) await rm(join(this.dir, old.name), { force: true });
	}
}
