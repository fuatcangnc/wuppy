import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { canReadContent, canWriteContent, resolveSettings, type Manifest } from "@wuppy/plugin-types";
import type { JsonStore } from "../data/store.ts";
import { sanitizeHtml } from "../security/sanitize.ts";
import type { HostDeps } from "./host.ts";
import { loadPlugins, type PluginEntry, type PluginEvent, type PluginSet, type PluginStatus } from "./loader.ts";

export interface ContentSaveEvent {
	collection: string;
	slug: string;
	isNew: boolean;
	data: Record<string, unknown>;
	body: string;
}
export interface CommentCreateEvent {
	collection: string;
	slug: string;
	author: string;
	body: string;
	/** What the site would store it as; a plugin may only make it stricter. */
	status: "approved" | "pending" | "spam";
}

const STRICTNESS = ["approved", "pending", "spam"] as const;
const seesCollection = (collection: string) => (m: Manifest) =>
	canReadContent(m, collection) || canWriteContent(m, collection);
import type { RegistryClient } from "./registry.ts";

/** What the admin changes at runtime. Lives in `.wuppy/data/plugin-state.json`, so it is committed like other site data. */
interface State {
	/** Plugin directories added from a registry (config-defined ones are not listed here). */
	installed: Array<{ dir: string; registry: string; version: string }>;
	/** Capability hashes approved in the admin, by directory. */
	approvals: Record<string, string>;
	disabled: string[];
	settings: Record<string, Record<string, unknown>>;
	/** Digest of the files at install time, by plugin id. */
	lock: Record<string, { sha256: string; version: string; registry: string }>;
}

const EMPTY: State = { installed: [], approvals: {}, disabled: [], settings: {}, lock: {} };
const STATE = "plugin-state";
const PLUGIN_DIR = "plugins";

export interface ManagerDeps extends Omit<HostDeps, "settings"> {
	registry?: RegistryClient;
	/** After any change that reloads plugins (for logging). */
	onReload?: (set: PluginSet) => void;
}

export class PluginNotFoundError extends Error {}

/**
 * Owns the plugin set for the running server: loads config-defined plus admin-installed plugins, applies the
 * owner's approvals/enable switches/settings, and reloads after changes.
 */
export class PluginManager {
	private set: PluginSet | undefined;
	private state: State = EMPTY;
	private queue: Promise<unknown> = Promise.resolve();

	constructor(
		private readonly root: string,
		private readonly json: JsonStore,
		private readonly configured: PluginEntry[],
		private readonly deps: ManagerDeps,
	) {}

	/** Changes are applied one at a time so two admins cannot interleave a state write and a reload. */
	private serial<T>(fn: () => Promise<T>): Promise<T> {
		const run = this.queue.then(fn, fn);
		this.queue = run.catch(() => undefined);
		return run;
	}

	async load(): Promise<void> {
		this.state = { ...EMPTY, ...(await this.json.read<Partial<State>>(STATE, {})) };
		this.set?.dispose();
		const entries: PluginEntry[] = [
			...this.configured,
			...this.state.installed.filter((i) => !this.configured.some((c) => c.dir === i.dir)).map((i) => ({ dir: i.dir })),
		];
		this.set = await loadPlugins(
			this.root,
			entries,
			{
				...this.deps,
				settings: (id) => this.resolvedSettings(id),
			},
			{
				approvals: this.state.approvals,
				lock: this.state.lock,
				disabled: new Set(this.state.disabled),
			},
		);
		this.deps.onReload?.(this.set);
	}

	private async save(message: string): Promise<void> {
		await this.json.write(STATE, this.state, message);
	}

	private manifestOf(id: string): Manifest | undefined {
		return this.set?.manifests.find((m) => m.id === id);
	}

	private resolvedSettings(id: string) {
		const manifest = this.manifestOf(id);
		return manifest ? resolveSettings(manifest, this.state.settings[id]) : {};
	}

	get current(): PluginSet {
		if (!this.set) throw new Error("Plugins are not loaded yet");
		return this.set;
	}

	dispatch(event: PluginEvent): Promise<void> {
		return this.set?.dispatch(event) ?? Promise.resolve();
	}

	/** Plugins that can read the collection may refuse a save; only those that can write it may change it. */
	async beforeContentSave(event: ContentSaveEvent): Promise<ContentSaveEvent> {
		if (!this.set) return event;
		return this.set.filter("beforeContentSave", event, {
			applies: seesCollection(event.collection),
			apply: (m, answer, current) => {
				if (!canWriteContent(m, current.collection)) {
					throw new Error(`may refuse but not change ${current.collection} entries (needs content.write)`);
				}
				const { data, body } = answer as { data?: unknown; body?: unknown };
				if (typeof body !== "string" || !data || typeof data !== "object" || Array.isArray(data)) {
					throw new Error("answer { data, body }, { reject: reason } or nothing");
				}
				return { ...current, data: data as Record<string, unknown>, body };
			},
		});
	}

	/** Moving an entry to the trash; plugins that can see the collection may refuse it. */
	async beforeContentDelete(event: { collection: string; slug: string }): Promise<void> {
		await this.set?.filter("beforeContentDelete", event, { applies: seesCollection(event.collection) });
	}

	/** A file that passed Wuppy's own checks; `replaces` is set when it overwrites an existing one. */
	async beforeMediaUpload(event: { mime: string; size: number; replaces?: string }): Promise<void> {
		await this.set?.filter("beforeMediaUpload", event);
	}

	/** A visitor's comment; plugins may refuse it, hold it or mark it as spam, never approve it. */
	async beforeCommentCreate(event: CommentCreateEvent): Promise<CommentCreateEvent> {
		if (!this.set) return event;
		return this.set.filter("beforeCommentCreate", event, {
			apply: (_m, answer, current) => {
				const { status } = answer as { status?: unknown };
				const rank = STRICTNESS.indexOf(status as (typeof STRICTNESS)[number]);
				if (rank === -1) throw new Error('answer { status: "pending" | "spam" }, { reject: reason } or nothing');
				return rank > STRICTNESS.indexOf(current.status) ? { ...current, status: STRICTNESS[rank]! } : current;
			},
		});
	}

	statuses(): Array<PluginStatus & { source: "config" | "registry"; registry?: string }> {
		return this.current.statuses().map((s) => {
			const installed = this.state.installed.find((i) => i.dir === s.dir);
			return {
				...s,
				source: installed && !this.configured.some((c) => c.dir === s.dir) ? "registry" : "config",
				...(installed ? { registry: installed.registry } : {}),
			};
		});
	}

	manifest(id: string): Manifest | undefined {
		return this.manifestOf(id);
	}

	request(id: string, method: string, path: string, body?: string) {
		return this.current.request(id, method, path, body);
	}

	/** Approve exactly the capabilities the admin just reviewed; a stale hash (plugin changed meanwhile) is refused. */
	approve(dir: string, hash: string): Promise<boolean> {
		return this.serial(async () => {
			const row = this.current.statuses().find((s) => s.dir === dir && s.state === "needs-approval");
			if (!row || row.pendingHash !== hash) return false;
			this.state = { ...this.state, approvals: { ...this.state.approvals, [dir]: hash } };
			await this.save(`plugins: approve ${row.id ?? dir}`);
			await this.load();
			return true;
		});
	}

	setEnabled(id: string, enabled: boolean): Promise<boolean> {
		return this.serial(async () => {
			if (!this.current.setEnabled(id, enabled)) return false;
			const rest = this.state.disabled.filter((d) => d !== id);
			this.state = { ...this.state, disabled: enabled ? rest : [...rest, id] };
			await this.save(`plugins: ${enabled ? "enable" : "disable"} ${id}`);
			return true;
		});
	}

	settingsOf(id: string): { fields: Manifest["settings"]; values: Record<string, string | boolean | number> } | null {
		const manifest = this.manifestOf(id);
		return manifest ? { fields: manifest.settings, values: this.resolvedSettings(id) } : null;
	}

	saveSettings(id: string, values: Record<string, unknown>): Promise<Record<string, string | boolean | number>> {
		return this.serial(async () => {
			const manifest = this.manifestOf(id);
			if (!manifest) throw new PluginNotFoundError(id);
			const clean = resolveSettings(manifest, values);
			this.state = { ...this.state, settings: { ...this.state.settings, [id]: clean } };
			await this.save(`plugins: settings for ${id}`);
			return clean;
		});
	}

	/** Output of a manifest-declared admin page, sanitized: a plugin can never inject script into the admin. */
	async adminPage(id: string, index: number): Promise<{ label: string; html: string } | null> {
		const page = this.manifestOf(id)?.adminPages[index];
		if (!page) return null;
		const res = await this.request(id, "GET", page.path);
		if (!res || res.status >= 400) throw new Error(res ? `Plugin answered ${res.status}` : "Plugin not loaded");
		let html = res.body;
		try {
			const parsed = JSON.parse(res.body) as { html?: unknown };
			if (typeof parsed.html === "string") html = parsed.html;
		} catch {
			// plain text/HTML body
		}
		return { label: page.label, html: sanitizeHtml(html) };
	}

	/** Remove a plugin installed from a registry (plugins named in wuppy.config are removed by editing it). */
	remove(dir: string): Promise<boolean> {
		return this.serial(async () => {
			const installed = this.state.installed.find((i) => i.dir === dir);
			if (!installed || this.configured.some((c) => c.dir === dir)) return false;
			const target = resolve(this.root, dir);
			const plugins = resolve(this.root, PLUGIN_DIR);
			if (!target.startsWith(plugins + sep)) return false; // never delete outside plugins/
			const id = this.current.statuses().find((s) => s.dir === dir)?.id;
			await rm(target, { recursive: true, force: true });
			const { [dir]: _approval, ...approvals } = this.state.approvals;
			const lock = { ...this.state.lock };
			const settings = { ...this.state.settings };
			if (id) {
				delete lock[id];
				delete settings[id];
			}
			this.state = {
				...this.state,
				installed: this.state.installed.filter((i) => i.dir !== dir),
				approvals,
				lock,
				settings,
				disabled: this.state.disabled.filter((d) => d !== id),
			};
			await this.save(`plugins: remove ${id ?? dir}`);
			await this.load();
			return true;
		});
	}

	search(q: string) {
		if (!this.deps.registry) return Promise.resolve({ results: [], errors: [] as string[] });
		return this.deps.registry.search(q).then(({ results, errors }) => ({
			errors,
			results: results.map((r) => {
				const installed = this.state.lock[r.id];
				return {
					...r,
					installedVersion: installed?.version ?? null,
					updateAvailable: !!installed && installed.version !== r.version,
				};
			}),
		}));
	}

	/** Installs or updates from a registry. The plugin then waits for the owner's approval of its capabilities. */
	install(registry: string, id: string): Promise<{ dir: string; verified: boolean }> {
		return this.serial(async () => {
			if (!this.deps.registry) throw new Error("No plugin registry is configured");
			const pkg = await this.deps.registry.fetchPackage(registry, id);
			const dir = `${PLUGIN_DIR}/${id}`;
			const target = resolve(this.root, dir);
			await mkdir(target, { recursive: true });
			await writeFile(join(target, "manifest.json"), pkg.manifestText);
			await writeFile(join(target, "plugin.js"), pkg.code);
			this.state = {
				...this.state,
				installed: [...this.state.installed.filter((i) => i.dir !== dir), { dir, registry, version: pkg.version }],
				lock: { ...this.state.lock, [id]: { sha256: pkg.sha256, version: pkg.version, registry } },
			};
			await this.save(`plugins: install ${id}@${pkg.version} from ${registry}`);
			await this.load();
			return { dir, verified: pkg.verified };
		});
	}

	dispose(): void {
		this.set?.dispose();
	}
}
