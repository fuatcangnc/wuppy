import { existsSync } from "node:fs";
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

	/**
	 * A collection holds `.md` and `.mdx` files side by side: an existing entry keeps its own extension,
	 * a new one gets the collection's format.
	 */
	formatOf(slug: string): "md" | "mdx" {
		const other = this.collection.format === "md" ? "mdx" : "md";
		const at = (ext: string) => join(this.root, `${this.collection.dir}/${assertSafeSlug(slug)}.${ext}`);
		return !existsSync(at(this.collection.format)) && existsSync(at(other)) ? other : this.collection.format;
	}

	/** Repo-relative path (forward slashes), for Git. */
	relPath(slug: string): string {
		return `${this.collection.dir}/${assertSafeSlug(slug)}.${this.formatOf(slug)}`;
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
		try {
			const names = await readdir(base, { recursive: true });
			const slugs = names
				.filter((n) => /\.mdx?$/.test(n))
				.map((n) =>
					n
						.replace(/\.mdx?$/, "")
						.split("\\")
						.join("/"),
				);
			return [...new Set(slugs)].toSorted();
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw e;
		}
	}
}
