import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Collection } from "../../content-types/index.ts";
import { parseDocument, serializeDocument, type ParsedDocument } from "../parsers/frontmatter.ts";
import { assertSafeSlug } from "../validation/path.ts";

export interface ContentEntry extends ParsedDocument {
	slug: string;
}

export class FilesystemContent {
	constructor(
		private readonly root: string,
		private readonly collection: Collection,
	) {}

	/** Repo-relative path (forward slashes), for Git. */
	relPath(slug: string): string {
		return `${this.collection.dir}/${assertSafeSlug(slug)}.${this.collection.format}`;
	}

	/** Absolute path, for metadata reads. */
	absolutePath(slug: string): string {
		return join(this.root, this.relPath(slug));
	}

	private file(slug: string): string {
		return join(this.root, this.relPath(slug));
	}

	async get(slug: string): Promise<ContentEntry | null> {
		try {
			return { slug, ...parseDocument(await readFile(this.file(slug), "utf8")) };
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
			throw e;
		}
	}

	async put(slug: string, doc: ParsedDocument): Promise<void> {
		const path = this.file(slug);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, serializeDocument(doc));
	}

	async delete(slug: string): Promise<void> {
		await rm(this.file(slug), { force: true });
	}

	async list(): Promise<string[]> {
		const base = join(this.root, this.collection.dir);
		const ext = `.${this.collection.format}`;
		try {
			const names = await readdir(base, { recursive: true });
			return names
				.filter((n) => n.endsWith(ext))
				.map((n) => n.slice(0, -ext.length).split("\\").join("/"))
				.toSorted();
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw e;
		}
	}
}
