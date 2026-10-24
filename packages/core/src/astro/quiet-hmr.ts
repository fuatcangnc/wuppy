import { realpathSync } from "node:fs";

/**
 * The visual editor changes a theme element on the canvas itself, then writes the same change to the `.astro` file.
 * Astro would reload the whole page for that write (it looks like F5 while typing), so a write the editor marks as
 * already shown skips the reload: the file's server modules are still invalidated, so the next request renders it.
 */

// The API runs in Vite's module runner and the plugin in Astro's process scope: a global key is what both see.
const KEY = "__wuppyQuietFiles";
const quiet = ((globalThis as Record<string, unknown>)[KEY] ??= new Map<string, number>()) as Map<string, number>;

/** The next change of this file (within a few seconds, so a later edit outside the editor still reloads) is quiet. */
export const quietNextChange = (file: string) => quiet.set(realpathSync(file), Date.now() + 3000);
// shortcut: Vite reports POSIX paths; on Windows the key would need its slashes turned around.

interface ModuleNode {
	id: string | null;
	file: string | null;
}
interface HotContext {
	environment: {
		moduleGraph: { invalidateModule(mod: ModuleNode, seen: Set<ModuleNode>, timestamp: number, isHmr: boolean): void };
		runner?: {
			evaluatedModules: { getModuleById(id: string): unknown; invalidateModule(mod: unknown): void };
		};
	};
}

export function quietHmrPlugin() {
	return {
		name: "wuppy:quiet-hmr",
		enforce: "pre" as const,
		hotUpdate: {
			order: "pre" as const,
			handler(
				this: HotContext,
				{ file, modules, timestamp }: { file: string; modules: ModuleNode[]; timestamp: number },
			) {
				const until = quiet.get(file);
				if (!until) return;
				if (until < Date.now()) {
					quiet.delete(file);
					return;
				}
				const own = modules.filter((m) => m.file === file);
				if (!own.length) return;
				const seen = new Set<ModuleNode>();
				for (const m of own) this.environment.moduleGraph.invalidateModule(m, seen, timestamp, true);
				const runner = this.environment.runner?.evaluatedModules;
				for (const m of seen) {
					const cached = m.id && runner?.getModuleById(m.id);
					if (cached) runner!.invalidateModule(cached);
				}
				// Left in, the page's server module makes Astro reload the browser, and its unchanged <script> makes Vite do it.
				return modules.filter((m) => m.file !== file);
			},
		},
	};
}
