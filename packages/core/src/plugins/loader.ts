import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import {
	capabilityHash as hashCapabilities,
	manifestSchema,
	type FilterName,
	type HookName,
	type Manifest,
} from "@wuppycms/plugin-types";
import type { WebhookEvent } from "../webhooks/index.ts";
import { PluginHookError, PluginRejectedError } from "./errors.ts";
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

/** Events plugins hear about; webhooks get the `WebhookEvent` ones. */
export type PluginEvent =
	WebhookEvent | { type: "comment.created"; id: string; collection: string; slug: string; status: string; at: string };

const HOOK_FOR: Partial<Record<PluginEvent["type"], HookName>> = {
	"content.updated": "onContentUpdated",
	"content.deleted": "onContentDeleted",
	"media.uploaded": "onMediaUploaded",
	"comment.created": "onCommentCreated",
};

/** What a before-hook may answer besides nothing: a refusal, or (when `apply` accepts it) a changed event. */
export interface FilterRules<E> {
	/** Whether this plugin may see the event at all (for example: it can read that collection). */
	applies?: (manifest: Manifest) => boolean;
	/** Turns a non-refusal answer into the next event. Throws when the answer is not allowed. */
	apply?: (manifest: Manifest, answer: unknown, current: E) => E;
}

const reasonOf = (answer: unknown): string | null | undefined => {
	if (!answer || typeof answer !== "object" || !("reject" in answer)) return undefined;
	const raw = (answer as { reject: unknown }).reject;
	// Shown to people as text: no control characters, bounded length.
	const reason = typeof raw === "string" ? raw.replace(/[\p{Cc}\s]+/gu, " ").trim() : "";
	return reason.length >= 1 && reason.length <= 500 ? reason : null;
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
	dispatch(event: PluginEvent): Promise<void>;
	/**
	 * Runs a before-hook through every enabled plugin that declares it, in config order; each sees the previous answer.
	 * Throws `PluginRejectedError` on a refusal and `PluginHookError` when a plugin fails (fail closed).
	 */
	filter<E>(hook: FilterName, event: E, rules?: FilterRules<E>): Promise<E>;
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
		async filter(hook, event, { applies = () => true, apply } = {}) {
			let current = event;
			for (const p of running) {
				if (!p.enabled || !p.manifest.hooks.includes(hook) || !applies(p.manifest)) continue;
				// Not refused over quota: that would let a flood of visitor comments block editors' saves. The timeout
				// still bounds every call, and the call is counted.
				admit(p);
				const started = now();
				const res = await p.instance.filter(hook, current);
				const refuse = (error: string) => {
					record(p, started, `${hook}: ${error}`);
					deps.log(`plugin ${p.manifest.id} failed on ${hook}: ${error}`);
					return new PluginHookError(p.manifest.id);
				};
				if (!res.ok) throw refuse(res.error);
				const reason = reasonOf(res.value);
				if (reason === null) throw refuse("a refusal needs a reason of 1-500 characters");
				if (reason !== undefined) {
					record(p, started);
					throw new PluginRejectedError(p.manifest.id, reason);
				}
				if (res.value !== null) {
					if (!apply) throw refuse("this hook can only refuse ({ reject }) or return nothing");
					try {
						current = apply(p.manifest, res.value, current);
					} catch (e) {
						throw refuse((e as Error).message);
					}
				}
				record(p, started);
			}
			return current;
		},
		dispose: () => running.forEach((p) => p.instance.dispose()),
	};
}
