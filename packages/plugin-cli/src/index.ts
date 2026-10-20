import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { manifestSchema, type Manifest } from "@wuppy/plugin-types";

const canonical = (value: unknown): string =>
	Array.isArray(value)
		? `[${value.map(canonical).join(",")}]`
		: value && typeof value === "object"
			? `{${Object.keys(value)
					.toSorted()
					.map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
					.join(",")}}`
			: JSON.stringify(value);

/** Hash only capabilities so code changes do not force a new approval. */
export function capabilityHash(manifest: Manifest): string {
	return createHash("sha256").update(canonical(manifest.capabilities)).digest("hex");
}

export const TEMPLATE_MANIFEST = {
	id: "my-plugin",
	version: "0.1.0",
	name: "My plugin",
	hooks: ["onContentUpdated"],
	capabilities: {
		content: { read: ["posts"] },
		network: [],
	},
	limits: { timeoutMs: 2000, memoryMb: 16 },
};

export const TEMPLATE_PLUGIN = `export default {
	async onContentUpdated(event, ctx) {
		ctx.log(\`updated \${event.collection}/\${event.slug}\`);
	},
};
`;

export interface CliResult {
	code: number;
	stdout: string;
	stderr: string;
}

const USAGE = `Usage: wuppy-plugin <command>

Commands:
  init <dir>       create manifest.json and plugin.js
  hash <dir>       print the capability hash to approve in wuppy.config
  validate <dir>   validate manifest.json
`;

export async function run(argv: string[], cwd: string): Promise<CliResult> {
	const [command, dir] = argv;
	if (!command || !dir) return { code: 1, stdout: "", stderr: USAGE };
	const manifestPath = join(cwd, dir, "manifest.json");
	try {
		if (command === "init") {
			await mkdir(join(cwd, dir), { recursive: true });
			await writeFile(manifestPath, `${JSON.stringify(TEMPLATE_MANIFEST, null, 2)}\n`, { flag: "wx" });
			await writeFile(join(cwd, dir, "plugin.js"), TEMPLATE_PLUGIN, { flag: "wx" });
			return {
				code: 0,
				stderr: "",
				stdout: `Created ${dir}/manifest.json and ${dir}/plugin.js\nNext: wuppy-plugin hash ${dir}\n`,
			};
		}

		const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
		if (command === "validate") {
			return { code: 0, stderr: "", stdout: `Valid plugin: ${manifest.id}@${manifest.version}\n` };
		}
		if (command === "hash") {
			return {
				code: 0,
				stderr: "",
				stdout: `Capabilities requested by "${manifest.id}":\n${JSON.stringify(manifest.capabilities, null, 2)}\n\nApprove with:\n  { dir: "${dir}", approve: "${capabilityHash(manifest)}" }\n`,
			};
		}
		return { code: 1, stdout: "", stderr: USAGE };
	} catch (error) {
		return { code: 1, stdout: "", stderr: `${(error as Error).message}` };
	}
}
