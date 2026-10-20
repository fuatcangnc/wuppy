import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { GitAdapter } from "@wuppy/git";

const NAME = /^[a-z][a-z0-9-]*$/;

export class UnknownDataFileError extends Error {}

/**
 * Small JSON documents that belong to the site (menus, widgets, settings…).
 * They live next to content, so a clone or a backup carries them too.
 */
export class JsonStore {
	constructor(
		private readonly root: string,
		private readonly git: GitAdapter,
	) {}

	private rel(name: string): string {
		if (!NAME.test(name)) throw new UnknownDataFileError(`Invalid data file: ${name}`);
		return `.wuppy/data/${name}.json`;
	}

	async read<T>(name: string, fallback: T): Promise<T> {
		try {
			return JSON.parse(await readFile(join(this.root, this.rel(name)), "utf8")) as T;
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
			throw e;
		}
	}

	async write(name: string, value: unknown, message: string): Promise<void> {
		const rel = this.rel(name);
		const path = join(this.root, rel);
		await mkdir(dirname(path), { recursive: true });
		const temp = `${path}.tmp`;
		await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`);
		await rename(temp, path);
		await this.git.commit([rel], message).catch((e: Error) => {
			if (!/nothing to commit/i.test(e.message)) throw e;
		});
	}
}
