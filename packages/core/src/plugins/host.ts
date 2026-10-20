import {
	canFetch,
	canReadContent,
	canReadSecret,
	canWriteContent,
	type HookName,
	type Manifest,
} from "@wuppy/plugin-types";
import { newQuickJSWASMModule, type QuickJSContext } from "quickjs-emscripten";

export interface HostDeps {
	log: (message: string) => void;
	readContent: (collection: string, slug: string) => Promise<{ data: Record<string, unknown>; body: string } | null>;
	/** Creates or overwrites an entry. Only called for collections the manifest lists under `content.write`. */
	writeContent?: (
		pluginId: string,
		collection: string,
		slug: string,
		doc: { data: Record<string, unknown>; body: string },
	) => Promise<void>;
	/** Looks up a secret the manifest declared. Returns undefined when it is not configured. */
	secret?: (pluginId: string, name: string) => string | undefined;
	/** Sends an email on the plugin's behalf; only called when the manifest has `capabilities.email`. */
	sendEmail?: (pluginId: string, message: { to: string; subject: string; text: string }) => Promise<void>;
	/** Current settings values (defaults applied). Read on every call so changes apply immediately. */
	settings?: (pluginId: string) => Record<string, string | boolean | number>;
	/** Called only for requests the manifest allows. Responsible for size caps and redirect policy. */
	fetch: (
		url: string,
		init: { method: string; body?: string; headers?: Record<string, string> },
	) => Promise<{ status: number; body: string }>;
}

export type DispatchResult = { ok: true; skipped?: true } | { ok: false; error: string };

export interface LoadedPlugin {
	dispatch(hook: HookName, event: unknown): Promise<DispatchResult>;
	request(
		method: string,
		path: string,
		body: string | undefined,
	): Promise<{ status: number; headers?: Record<string, string>; body: string }>;
	dispose(): void;
}

// Host functions are captured here and removed from the global object so plugin code only sees `ctx`.
const PRELUDE = `
(() => {
	const log = __hostLog, get = __hostContentGet, put = __hostContentPut, fetchFn = __hostFetch;
	const secretFn = __hostSecret, mail = __hostEmail, settingsFn = __hostSettings;
	for (const n of ["__hostLog", "__hostContentGet", "__hostContentPut", "__hostFetch", "__hostSecret", "__hostEmail", "__hostSettings"]) delete globalThis[n];
	const ctx = Object.freeze({
		log: (m) => log(String(m)),
		content: Object.freeze({
			get: async (c, s) => JSON.parse(await get(String(c), String(s))),
			put: async (c, s, doc) => { await put(String(c), String(s), JSON.stringify(doc || {})); },
		}),
		fetch: async (u, init) => JSON.parse(await fetchFn(String(u), JSON.stringify(init || {}))),
		secret: (name) => { const v = secretFn(String(name)); return v === "" ? undefined : v; },
		email: Object.freeze({ send: async (m) => { await mail(JSON.stringify(m || {})); } }),
		get settings() { return Object.freeze(JSON.parse(settingsFn())); },
	});
	globalThis.__run = async (hook, ev) => {
		const fn = globalThis.__plugin && globalThis.__plugin[hook];
		if (typeof fn === "function") await fn(JSON.parse(ev), ctx);
	};
	globalThis.__handle = async (method, path, body) => {
		const fn = globalThis.__plugin && globalThis.__plugin.fetch;
		if (typeof fn !== "function") return JSON.stringify({ status: 404, body: "" });
		const res = await fn({ method: String(method), path: String(path), body: body ? JSON.parse(body) : undefined }, ctx);
		return JSON.stringify(res || { status: 204, body: "" });
	};
})();
`;

/**
 * Runs untrusted plugin code in QuickJS compiled to WASM: no Node APIs, no ambient network or filesystem.
 * The only way out is `ctx`, and every capability is checked against the manifest here, not in the plugin.
 */
export async function loadPlugin(manifest: Manifest, code: string, deps: HostDeps): Promise<LoadedPlugin> {
	// One WASM instance per plugin: a plugin that crashes its engine cannot affect any other plugin.
	const QuickJS = await newQuickJSWASMModule();
	const runtime = QuickJS.newRuntime();
	runtime.setMemoryLimit(manifest.limits.memoryMb * 1024 * 1024);
	runtime.setMaxStackSize(256 * 1024);
	let deadline = Infinity;
	runtime.setInterruptHandler(() => Date.now() > deadline);
	const vm = runtime.newContext();
	let dead = false;

	const dispose = () => {
		if (dead) return;
		dead = true;
		try {
			vm.dispose();
			runtime.dispose();
		} catch {
			// shortcut: an engine interrupted mid-run (timeout/OOM) can fail its leak assertion on teardown;
			// this instance is private to the plugin and is dropped, so swallowing it is safe.
		}
	};

	const asyncFn = (name: string, impl: (args: string[]) => Promise<string>) => {
		const h = vm.newFunction(name, (...argHandles) => {
			const args = argHandles.map((a) => vm.getString(a));
			const promise = vm.newPromise();
			impl(args).then(
				(out) => vm.newString(out).consume((s) => promise.resolve(s)),
				(err: Error) => vm.newError(err.message).consume((e) => promise.reject(e)),
			);
			promise.settled.then(() => !dead && runtime.executePendingJobs());
			return promise.handle;
		});
		vm.setProp(vm.global, name, h);
		h.dispose();
	};

	const syncFn = (name: string, impl: (args: string[]) => void) => {
		const h = vm.newFunction(name, (...argHandles) => {
			impl(argHandles.map((a) => vm.getString(a)));
		});
		vm.setProp(vm.global, name, h);
		h.dispose();
	};

	/** Like `syncFn` but returns a string to the plugin. */
	const valueFn = (name: string, impl: (args: string[]) => string) => {
		const h = vm.newFunction(name, (...argHandles) => vm.newString(impl(argHandles.map((a) => vm.getString(a)))));
		vm.setProp(vm.global, name, h);
		h.dispose();
	};

	syncFn("__hostLog", ([m]) => deps.log(String(m).slice(0, 2000)));
	asyncFn("__hostContentGet", async ([collection = "", slug = ""]) => {
		if (!canReadContent(manifest, collection)) throw new Error(`Content access denied: ${collection}`);
		return JSON.stringify(await deps.readContent(collection, slug));
	});
	asyncFn("__hostContentPut", async ([collection = "", slug = "", raw = "{}"]) => {
		if (!canWriteContent(manifest, collection)) throw new Error(`Content write denied: ${collection}`);
		if (!deps.writeContent) throw new Error("Content writing is unavailable");
		const doc = JSON.parse(raw) as { data?: Record<string, unknown>; body?: unknown };
		if (typeof doc.body !== "string" || !doc.data || typeof doc.data !== "object" || Array.isArray(doc.data)) {
			throw new Error("content.put needs { data: object, body: string }");
		}
		await deps.writeContent(manifest.id, collection, slug, { data: doc.data, body: doc.body });
		return "";
	});
	valueFn("__hostSecret", ([name = ""]) => {
		if (!canReadSecret(manifest, name)) throw new Error(`Secret access denied: ${name}`);
		return deps.secret?.(manifest.id, name) ?? "";
	});
	asyncFn("__hostEmail", async ([raw = "{}"]) => {
		if (!manifest.capabilities.email) throw new Error("Email access denied");
		if (!deps.sendEmail) throw new Error("Email is unavailable");
		const m = JSON.parse(raw) as { to?: unknown; subject?: unknown; text?: unknown };
		if (typeof m.to !== "string" || typeof m.subject !== "string" || typeof m.text !== "string") {
			throw new Error("email.send needs { to, subject, text } strings");
		}
		await deps.sendEmail(manifest.id, { to: m.to, subject: m.subject.slice(0, 200), text: m.text.slice(0, 5000) });
		return "";
	});
	valueFn("__hostSettings", () => JSON.stringify(deps.settings?.(manifest.id) ?? {}));
	asyncFn("__hostFetch", async ([url = "", rawInit = "{}"]) => {
		const init = JSON.parse(rawInit) as { method?: string; body?: string; headers?: Record<string, string> };
		const method = (init.method ?? "GET").toUpperCase();
		if (!canFetch(manifest, url, method)) throw new Error(`Network access denied: ${method} ${url}`);
		return JSON.stringify(await deps.fetch(url, { method, body: init.body, headers: init.headers }));
	});

	const evalOrThrow = (src: string, filename: string, what: string) => {
		const r = vm.evalCode(src, filename);
		if (r.error) {
			const err = describe(vm, r.error);
			dispose();
			throw new Error(`Failed to load plugin (${what}): ${err}`);
		}
		r.value.dispose();
	};
	deadline = Date.now() + manifest.limits.timeoutMs;
	evalOrThrow(PRELUDE, "prelude.js", "prelude");
	evalOrThrow(code, `${manifest.id}.js`, "code");
	const defined = vm.evalCode(`typeof globalThis.__plugin === "object" && globalThis.__plugin !== null`);
	const ok = defined.error ? false : vm.dump(defined.value) === true;
	(defined.error ?? defined.value).dispose();
	if (!ok) {
		dispose();
		throw new Error("Failed to load plugin: it must define globalThis.__plugin");
	}

	return {
		dispose,
		async request(method, path, body) {
			if (dead) return { status: 503, body: "Plugin was stopped" };
			deadline = Date.now() + manifest.limits.timeoutMs;
			const call = vm.evalCode(
				`__handle(${JSON.stringify(method)}, ${JSON.stringify(path)}, ${JSON.stringify(body ?? "")})`,
			);
			if (call.error) return { status: 500, body: describe(vm, call.error) };
			let timer: NodeJS.Timeout | undefined;
			const timeout = new Promise<"timeout">(
				(resolve) => (timer = setTimeout(() => resolve("timeout"), manifest.limits.timeoutMs)),
			);
			try {
				const settled = vm.resolvePromise(call.value);
				runtime.executePendingJobs();
				const result = await Promise.race([settled, timeout]);
				if (result === "timeout") {
					dispose();
					return { status: 504, body: "Plugin timed out" };
				}
				if (result.error) return { status: 500, body: describe(vm, result.error) };
				const raw = vm.dump(result.value) as string;
				result.value.dispose();
				try {
					const parsed = JSON.parse(raw) as { status?: number; headers?: Record<string, string>; body?: string };
					return {
						status: typeof parsed.status === "number" ? parsed.status : 200,
						headers: parsed.headers,
						body: typeof parsed.body === "string" ? parsed.body : JSON.stringify(parsed.body ?? ""),
					};
				} catch {
					return { status: 200, body: raw };
				}
			} finally {
				clearTimeout(timer);
				if (!dead) call.value.dispose();
			}
		},
		async dispatch(hook, event) {
			if (dead) return { ok: false, error: "Plugin was stopped" };
			if (!manifest.hooks.includes(hook)) return { ok: true, skipped: true };
			deadline = Date.now() + manifest.limits.timeoutMs;
			const call = vm.evalCode(`__run(${JSON.stringify(hook)}, ${JSON.stringify(JSON.stringify(event))})`);
			if (call.error) return fail(describe(vm, call.error));

			let timer: NodeJS.Timeout | undefined;
			const timeout = new Promise<"timeout">(
				(r) => (timer = setTimeout(() => r("timeout"), manifest.limits.timeoutMs)),
			);
			try {
				const settled = vm.resolvePromise(call.value);
				runtime.executePendingJobs();
				const res = await Promise.race([settled, timeout]);
				if (res === "timeout") return fail("Plugin timed out");
				if (res.error) return fail(describe(vm, res.error));
				res.value.dispose();
				return { ok: true };
			} finally {
				clearTimeout(timer);
				if (!dead) call.value.dispose();
			}
		},
	};

	function fail(error: string): DispatchResult {
		// A plugin that timed out or ran out of memory may be mid-flight; stop it rather than reuse it.
		if (/timed out|interrupted|out of memory/i.test(error)) dispose();
		return { ok: false, error };
	}
}

function describe(vm: QuickJSContext, handle: Parameters<QuickJSContext["dump"]>[0]): string {
	const dumped = vm.dump(handle) as { name?: string; message?: string } | string;
	handle.dispose();
	return typeof dumped === "string" ? dumped : `${dumped.name ?? "Error"}: ${dumped.message ?? JSON.stringify(dumped)}`;
}
