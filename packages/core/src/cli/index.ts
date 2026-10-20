import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { manifestSchema } from "@wuppy/plugin-types";
import { capabilityHash } from "../plugins/loader.ts";

export interface CliResult {
	code: number;
	stdout: string;
	stderr: string;
}

const USAGE = "Usage: wuppy plugin hash <plugin-dir>";

export async function run(argv: string[], cwd: string): Promise<CliResult> {
	const [cmd, sub, dir] = argv;
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
