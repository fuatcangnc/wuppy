import { createPublicKey, verify } from "node:crypto";
import { manifestSchema, type Manifest } from "@wuppycms/plugin-types";
import { z } from "zod";
import { fetchPublic } from "../security/ssrf.ts";
import { fileDigest } from "./loader.ts";

export const registryConfigSchema = z.object({
	name: z.string().regex(/^[a-z][a-z0-9-]*$/),
	/** URL of the registry's `index.json`. */
	url: z.url({ protocol: /^https?$/ }),
	/** Ed25519 public keys (base64 SPKI DER) whose signatures this registry's packages must carry. */
	publicKeys: z.array(z.string().min(20)).default([]),
});
export type RegistryConfig = z.output<typeof registryConfigSchema>;

const indexSchema = z.object({
	plugins: z.array(
		z.object({
			id: z.string().regex(/^[a-z][a-z0-9-]*$/),
			name: z.string().max(100).optional(),
			description: z.string().max(500).optional(),
			author: z.string().max(200).optional(),
			version: z.string(),
			/** Where the bundle lives, and the digest it must have (`fileDigest` of manifest text + code). */
			bundle: z.object({ url: z.string(), sha256: z.string().length(64) }),
			/** Base64 Ed25519 signature over `<id>@<version>:<sha256>`. */
			signature: z.string().optional(),
		}),
	),
});
export type RegistryEntry = z.output<typeof indexSchema>["plugins"][number];

const bundleSchema = z.object({ manifest: z.string(), code: z.string() });

export interface RegistryListing extends RegistryEntry {
	registry: string;
	/** True when the registry has trusted keys and the entry's signature checks out against one of them. */
	verified: boolean;
}

export type Fetcher = (url: string) => Promise<string>;

const defaultFetch: Fetcher = async (url) =>
	new TextDecoder().decode((await fetchPublic(url, { maxBytes: 2 * 1024 * 1024 })).bytes);

/** The message a publisher signs. */
export const signedMessage = (id: string, version: string, sha256: string) => `${id}@${version}:${sha256}`;

export function verifySignature(registry: RegistryConfig, entry: RegistryEntry): boolean {
	if (!entry.signature || registry.publicKeys.length === 0) return false;
	const message = Buffer.from(signedMessage(entry.id, entry.version, entry.bundle.sha256));
	const signature = Buffer.from(entry.signature, "base64");
	return registry.publicKeys.some((key) => {
		try {
			return verify(
				null,
				message,
				createPublicKey({ key: Buffer.from(key, "base64"), format: "der", type: "spki" }),
				signature,
			);
		} catch {
			return false;
		}
	});
}

export class RegistryClient {
	private cache = new Map<string, { at: number; entries: RegistryEntry[] }>();

	constructor(
		private readonly registries: readonly RegistryConfig[],
		private readonly fetchText: Fetcher = defaultFetch,
		private readonly ttlMs = 5 * 60_000,
		private readonly now: () => number = Date.now,
	) {}

	private async index(registry: RegistryConfig): Promise<RegistryEntry[]> {
		const hit = this.cache.get(registry.name);
		if (hit && this.now() - hit.at < this.ttlMs) return hit.entries;
		const entries = indexSchema.parse(JSON.parse(await this.fetchText(registry.url))).plugins;
		this.cache.set(registry.name, { at: this.now(), entries });
		return entries;
	}

	/** Matching packages from every registry. A registry that is down is reported, not fatal. */
	async search(q = ""): Promise<{ results: RegistryListing[]; errors: string[] }> {
		const needle = q.trim().toLowerCase();
		const results: RegistryListing[] = [];
		const errors: string[] = [];
		for (const registry of this.registries) {
			try {
				for (const entry of await this.index(registry)) {
					if (needle && !`${entry.id} ${entry.name ?? ""} ${entry.description ?? ""}`.toLowerCase().includes(needle))
						continue;
					results.push({ ...entry, registry: registry.name, verified: verifySignature(registry, entry) });
				}
			} catch (e) {
				errors.push(`${registry.name}: ${(e as Error).message}`);
			}
		}
		return { results, errors };
	}

	/**
	 * Downloads and checks a package: digest pinned by the index, signature when the registry has trusted keys,
	 * and a manifest whose id/version match the listing. Nothing is written here.
	 */
	async fetchPackage(
		registryName: string,
		id: string,
	): Promise<{
		manifest: Manifest;
		manifestText: string;
		code: string;
		sha256: string;
		verified: boolean;
		version: string;
	}> {
		const registry = this.registries.find((r) => r.name === registryName);
		if (!registry) throw new Error(`Unknown registry: ${registryName}`);
		const entry = (await this.index(registry)).find((e) => e.id === id);
		if (!entry) throw new Error(`${registryName} has no plugin "${id}"`);
		const verified = verifySignature(registry, entry);
		if (registry.publicKeys.length > 0 && !verified) {
			throw new Error(`"${id}" is not signed by a key this site trusts for ${registryName}`);
		}
		const url = new URL(entry.bundle.url, registry.url).href;
		const bundle = bundleSchema.parse(JSON.parse(await this.fetchText(url)));
		const sha256 = fileDigest(bundle.manifest, bundle.code);
		if (sha256 !== entry.bundle.sha256) throw new Error(`"${id}" does not match the digest published in the index`);
		const manifest = manifestSchema.parse(JSON.parse(bundle.manifest));
		if (manifest.id !== entry.id || manifest.version !== entry.version) {
			throw new Error(
				`"${id}" manifest says ${manifest.id}@${manifest.version}, the index says ${entry.id}@${entry.version}`,
			);
		}
		return { manifest, manifestText: bundle.manifest, code: bundle.code, sha256, verified, version: entry.version };
	}
}
