import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ParsedDocument } from "./parsers/frontmatter.ts";

export interface Autosave extends ParsedDocument {
	savedAt: string;
	userId: string;
}

/**
 * One unsaved-work recovery copy per entry under `.wuppy/autosave`. It is not a revision: nothing is committed to Git,
 * so autosaves can never clutter history and are dropped when the editor saves for real.
 */
export class AutosaveStore {
	constructor(private readonly root: string) {}

	private path(collection: string, slug: string): string {
		return join(this.root, ".wuppy", "autosave", encodeURIComponent(collection), `${encodeURIComponent(slug)}.json`);
	}

	async get(collection: string, slug: string): Promise<Autosave | null> {
		try {
			return JSON.parse(await readFile(this.path(collection, slug), "utf8")) as Autosave;
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
			throw e;
		}
	}

	async put(collection: string, slug: string, doc: ParsedDocument, userId: string): Promise<Autosave> {
		const path = this.path(collection, slug);
		await mkdir(join(path, ".."), { recursive: true });
		const saved: Autosave = { ...doc, savedAt: new Date().toISOString(), userId };
		await writeFile(`${path}.tmp`, JSON.stringify(saved));
		await rename(`${path}.tmp`, path);
		return saved;
	}

	async delete(collection: string, slug: string): Promise<void> {
		await rm(this.path(collection, slug), { force: true });
	}
}
