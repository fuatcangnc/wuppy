import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { manifestSchema, type HookName, type Manifest } from "@wuppy/plugin-types";
import type { WebhookEvent } from "../webhooks/index.ts";
import { loadPlugin, type HostDeps, type LoadedPlugin } from "./host.ts";

export interface PluginEntry {
	/** Directory containing `manifest.json` and `plugin.js`, relative to the project root. */
	dir: string;
	/** Hash of the capabilities the site owner reviewed. A changed manifest needs a new hash (re-approval). */
	approve: string;
}

const canonical = (v: unknown): string =>
	Array.isArray(v)
		? `[${v.map(canonical).join(",")}]`
		: v && typeof v === "object"
			? `{${Object.keys(v)
					.toSorted()
					.map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
					.join(",")}}`
			: JSON.stringify(v);

/** Hash over the *parsed* capabilities, so defaults cannot hide a change. */
export const capabilityHash = (manifest: unknown): string =>
	createHash("sha256")
		.update(canonical(manifestSchema.parse(manifest).capabilities))
		.digest("hex");

const HOOK_FOR: Partial<Record<WebhookEvent["type"], HookName>> = {
	"content.updated": "onContentUpdated",
	"content.deleted": "onContentDeleted",
	"media.uploaded": "onMediaUploaded",
};

export interface PluginSet {
	loaded: string[];
	errors: string[];
	manifests: Manifest[];
	dispatch(event: WebhookEvent): Promise<void>;
	request(
		id: string,
		method: string,
		path: string,
		body?: string,
	): Promise<{ status: number; headers?: Record<string, string>; body: string } | null>;
	dispose(): void;
}

/** Fail closed per plugin: anything not approved, not parseable or outside the project is skipped and reported. */
export async function loadPlugins(root: string, entries: PluginEntry[], deps: HostDeps): Promise<PluginSet> {
	const plugins: { manifest: Manifest; instance: LoadedPlugin }[] = [];
	const errors: string[] = [];
	const base = resolve(root);

	for (const entry of entries) {
		try {
			const dir = resolve(base, entry.dir);
			if (!dir.startsWith(base + sep)) throw new Error(`Plugin directory is outside the project: ${entry.dir}`);
			const manifest = manifestSchema.parse(JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")));
			const hash = capabilityHash(manifest);
			if (hash !== entry.approve) {
				throw new Error(
					`Plugin "${manifest.id}" capabilities are not approved. Review them, then set approve: "${hash}" for ${entry.dir}`,
				);
			}
			const instance = await loadPlugin(manifest, await readFile(join(dir, "plugin.js"), "utf8"), deps);
			plugins.push({ manifest, instance });
		} catch (e) {
			errors.push((e as Error).message);
		}
	}

	return {
		loaded: plugins.map((p) => p.manifest.id),
		errors,
		manifests: plugins.map((p) => p.manifest),
		async request(id, method, path, body) {
			const plugin = plugins.find((p) => p.manifest.id === id);
			if (!plugin) return null;
			return plugin.instance.request(method, path, body);
		},
		async dispatch(event) {
			const hook = HOOK_FOR[event.type];
			if (!hook) return;
			await Promise.all(
				plugins.map(async (p) => {
					const res = await p.instance.dispatch(hook, event);
					if (!res.ok) deps.log(`plugin ${p.manifest.id} failed on ${hook}: ${res.error}`);
				}),
			);
		},
		dispose: () => plugins.forEach((p) => p.instance.dispose()),
	};
}
