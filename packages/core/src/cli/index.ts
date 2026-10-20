import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { manifestSchema } from "@wuppy/plugin-types";
import { generateTypes } from "../content-types/generate.ts";
import { loadConfig } from "../config/index.ts";
import { capabilityHash } from "../plugins/loader.ts";
import { upgrade } from "./upgrade.ts";

export interface CliResult {
	code: number;
	stdout: string;
	stderr: string;
}

const USAGE = "Usage: wuppy plugin hash <plugin-dir> | wuppy doctor | wuppy types | wuppy upgrade [--force]";

const exists = (p: string) =>
	access(p).then(
		() => true,
		() => false,
	);

/** Checks the things that break a fresh install: config, secret, content dirs, Git. */
async function doctor(cwd: string, env: NodeJS.ProcessEnv): Promise<CliResult> {
	const lines: string[] = [];
	let failed = false;
	const check = (ok: boolean, label: string, hint = "") => {
		if (!ok) failed = true;
		lines.push(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : ` - ${hint}`}`);
	};
	try {
		const config = await loadConfig(cwd);
		check(true, "wuppy.config loads");
		for (const c of config.collections)
			check(await exists(join(cwd, c.dir)), `content dir ${c.dir}`, "directory is missing");
		check(
			!config.git || (await exists(join(cwd, ".git"))),
			"Git repository",
			"run `git init` (created on first sign-up otherwise)",
		);
	} catch (e) {
		check(false, "wuppy.config loads", (e as Error).message);
	}
	check((env.WUPPY_SECRET ?? "").length >= 32, "WUPPY_SECRET", "set 32+ random characters in .env");
	return { code: failed ? 1 : 0, stdout: lines.join("\n") + "\n", stderr: "" };
}

export async function run(argv: string[], cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<CliResult> {
	const [cmd, sub, dir] = argv;
	if (cmd === "doctor") return doctor(cwd, env);
	if (cmd === "upgrade") {
		const r = await upgrade(cwd, { force: argv.includes("--force") });
		return r.code === 0
			? { code: 0, stdout: r.message + "\n", stderr: "" }
			: { code: r.code, stdout: "", stderr: r.message };
	}
	if (cmd === "types") {
		try {
			const { collections } = await loadConfig(cwd);
			await writeFile(join(cwd, "wuppy-env.d.ts"), generateTypes(collections));
			return { code: 0, stdout: `Wrote wuppy-env.d.ts (${collections.length} collections)\n`, stderr: "" };
		} catch (e) {
			return { code: 1, stdout: "", stderr: (e as Error).message };
		}
	}
	if (cmd === "plugin" && sub === "hash") {
		if (!dir) return { code: 1, stdout: "", stderr: USAGE };
		try {
			const manifest = manifestSchema.parse(JSON.parse(await readFile(join(cwd, dir, "manifest.json"), "utf8")));
			return {
				code: 0,
				stderr: "",
				stdout: `Capabilities requested by "${manifest.id}":\n${JSON.stringify(manifest.capabilities, null, 2)}\n\nIf you accept them, add to wuppy.config:\n  { dir: "${dir}", approve: "${capabilityHash(manifest)}" }\n`,
			};
		} catch (e) {
			return { code: 1, stdout: "", stderr: `Cannot read ${dir}/manifest.json: ${(e as Error).message}` };
		}
	}
	return { code: 1, stdout: "", stderr: USAGE };
}
