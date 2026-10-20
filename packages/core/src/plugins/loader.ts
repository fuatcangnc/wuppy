import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { capabilityHash as hashCapabilities, manifestSchema, type HookName, type Manifest } from "@wuppy/plugin-types";
import type { WebhookEvent } from "../webhooks/index.ts";
import { loadPlugin, type HostDeps, type LoadedPlugin } from "./host.ts";

export interface PluginEntry {
	/** Directory containing `manifest.json` and `plugin.js`, relative to the project root. */
	dir: string;
	/** Hash of the capabilities the site owner reviewed. A changed manifest needs a new hash (re-approval). */
	approve?: string;
}

/** Hash over the *parsed* capabilities, so defaults cannot hide a change. */
export const capabilityHash = (manifest: unknown): string => hashCapabilities(manifest);

/** Digest of exactly the files that run. Registries pin it; a lock file detects edits after install. */
export const fileDigest = (manifestText: string, code: string): string =>
	createHash("sha256").update(manifestText).update("\n--\n").update(code).digest("hex");

const HOOK_FOR: Partial<Record<WebhookEvent["type"], HookName>> = {
	"content.updated": "onContentUpdated",
	"content.deleted": "onContentDeleted",
	"media.uploaded": "onMediaUploaded",
};

const MAX_LOG_LINES = 100;

export interface PluginStatus {
	dir: string;
	id: string | null;
	version: string | null;
	name?: string;
	state: "active" | "disabled" | "needs-approval" | "error";
	/** Hash the owner must approve (set when `state` is needs-approval). */
	pendingHash?: string;
	error?: string;
	manifest?: Manifest;
	stats?: { calls: number; failures: number; callsThisMinute: number; quota: number; totalMs: number };
	lastError?: { message: string; at: string };
	logs?: string[];
}

export interface PluginSet {
	loaded: string[];
	errors: string[];
	manifests: Manifest[];
	/** One row per configured plugin, whatever happened to it. */
	statuses(): PluginStatus[];
	setEnabled(id: string, enabled: boolean): boolean;
	dispatch(event: WebhookEvent): Promise<void>;
	request(
		id: string,
		method: string,
		path: string,
		body?: string,
	): Promise<{ status: number; headers?: Record<string, string>; body: string } | null>;
	dispose(): void;
}

export interface LoadOptions {
	/** Approvals made in the admin, by plugin directory. A config `approve` takes precedence. */
	approvals?: Record<string, string>;
	/** Content digests recorded at install time, by plugin id. A mismatch means the files were edited. */
	lock?: Record<string, { sha256: string }>;
	/** Plugin ids switched off in the admin. */
	disabled?: ReadonlySet<string>;
	now?: () => number;
}

interface Running {
	dir: string;
	manifest: Manifest;
	instance: LoadedPlugin;
	enabled: boolean;
	calls: number;
	failures: number;
	totalMs: number;
	window: { start: number; count: number };
	lastError?: { message: string; at: string };
	logs: string[];
}

/** Fail closed per plugin: anything not approved, not parseable or outside the project is skipped and reported. */
export async function loadPlugins(
	root: string,
	entries: PluginEntry[],
	deps: HostDeps,
	{ approvals = {}, lock = {}, disabled = new Set(), now = Date.now }: LoadOptions = {},
): Promise<PluginSet> {
	const running: Running[] = [];
	const rows: PluginStatus[] = [];
	const errors: string[] = [];
	const base = resolve(root);

	for (const entry of entries) {
		const fail = (message: string, extra: Partial<PluginStatus> = {}) => {
			errors.push(message);
			rows.push({ dir: entry.dir, id: null, version: null, state: "error", error: message, ...extra });
		};
		try {
			const dir = resolve(base, entry.dir);
			if (!dir.startsWith(base + sep)) throw new Error(`Plugin directory is outside the project: ${entry.dir}`);
			const manifestText = await readFile(join(dir, "manifest.json"), "utf8");
			const manifest = manifestSchema.parse(JSON.parse(manifestText));
			const code = await readFile(join(dir, "plugin.js"), "utf8");
			const pinned = lock[manifest.id];
			if (pinned && pinned.sha256 !== fileDigest(manifestText, code)) {
				throw new Error(`Plugin "${manifest.id}" files changed since they were installed; reinstall or update it`);
			}
			const hash = capabilityHash(manifest);
			const approved = entry.approve ?? approvals[entry.dir];
			if (hash !== approved) {
				const message = `Plugin "${manifest.id}" capabilities are not approved. Review them, then approve ${hash} for ${entry.dir}`;
				errors.push(message);
				rows.push({
					dir: entry.dir,
					id: manifest.id,
					version: manifest.version,
					...(manifest.name ? { name: manifest.name } : {}),
					state: "needs-approval",
					pendingHash: hash,
					error: message,
					manifest,
				});
				continue;
			}
			const logs: string[] = [];
			const instance = await loadPlugin(manifest, code, {
				...deps,
				log: (m) => {
					logs.push(`${new Date(now()).toISOString()} ${m}`);
					if (logs.length > MAX_LOG_LINES) logs.shift();
					deps.log(`[${manifest.id}] ${m}`);
				},
			});
			running.push({
				dir: entry.dir,
				manifest,
				instance,
				enabled: !disabled.has(manifest.id),
				calls: 0,
				failures: 0,
				totalMs: 0,
				window: { start: 0, count: 0 },
				logs,
			});
		} catch (e) {
			fail((e as Error).message);
		}
	}

	/** Counts a call against the plugin's per-minute quota. False means over quota. */
	const admit = (p: Running): boolean => {
		const t = now();
		if (t - p.window.start >= 60_000) p.window = { start: t, count: 0 };
		if (p.window.count >= p.manifest.limits.callsPerMinute) return false;
		p.window.count++;
		return true;
	};
	const record = (p: Running, started: number, error?: string) => {
		p.calls++;
		p.totalMs += now() - started;
		if (error) {
			p.failures++;
			p.lastError = { message: error.slice(0, 500), at: new Date(now()).toISOString() };
		}
	};
	const find = (id: string) => running.find((p) => p.manifest.id === id);

	return {
		loaded: running.map((p) => p.manifest.id),
		errors,
		manifests: running.map((p) => p.manifest),
		statuses() {
			const live = running.map<PluginStatus>((p) => {
				const t = now();
				return {
					dir: p.dir,
					id: p.manifest.id,
					version: p.manifest.version,
					...(p.manifest.name ? { name: p.manifest.name } : {}),
					state: p.enabled ? "active" : "disabled",
					manifest: p.manifest,
					stats: {
						calls: p.calls,
						failures: p.failures,
						callsThisMinute: t - p.window.start < 60_000 ? p.window.count : 0,
						quota: p.manifest.limits.callsPerMinute,
						totalMs: p.totalMs,
					},
					...(p.lastError ? { lastError: p.lastError } : {}),
					logs: [...p.logs],
				};
			});
			return [...live, ...rows];
		},
		setEnabled(id, enabled) {
			const plugin = find(id);
			if (!plugin) return false;
			plugin.enabled = enabled;
			return true;
		},
		async request(id, method, path, body) {
			const plugin = find(id);
			if (!plugin) return null;
			if (!plugin.enabled) return { status: 503, body: "Plugin is disabled" };
			if (!admit(plugin)) return { status: 429, body: "Plugin call quota exceeded" };
			const started = now();
			const res = await plugin.instance.request(method, path, body);
			record(plugin, started, res.status >= 500 ? `HTTP ${res.status}: ${res.body}` : undefined);
			return res;
		},
		async dispatch(event) {
			const hook = HOOK_FOR[event.type];
			if (!hook) return;
			await Promise.all(
				running.map(async (p) => {
					if (!p.enabled || !p.manifest.hooks.includes(hook)) return;
					if (!admit(p)) {
						record(p, now(), `Dropped ${hook}: call quota of ${p.manifest.limits.callsPerMinute}/min exceeded`);
						return;
					}
					const started = now();
					const res = await p.instance.dispatch(hook, event);
					record(p, started, res.ok ? undefined : res.error);
					if (!res.ok) deps.log(`plugin ${p.manifest.id} failed on ${hook}: ${res.error}`);
				}),
			);
		},
		dispose: () => running.forEach((p) => p.instance.dispose()),
	};
}
