import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { capabilityHash, manifestSchema, type Manifest } from "@wuppycms/plugin-types";

/** Single source of truth lives in plugin-types so the CLI and the server can never disagree. */
export { capabilityHash };

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

const USAGE = `Usage: wuppycms-plugin <command>

Commands:
  init <dir>       create manifest.json and plugin.js
  hash <dir>       print the capability hash to approve in wuppy.config
  validate <dir>   validate manifest.json
  build <dir>      check plugin.js against the manifest (undeclared capabilities fail the build)
  keygen           print a new Ed25519 key pair for signing packages
  pack <dir> [privateKey]   print a registry bundle and index entry (signed when a key is given)
`;

/** Source-level checks: each ctx API a plugin calls must be declared in the manifest. Heuristic, the sandbox is the real gate. */
export function checkCapabilities(manifest: Manifest, code: string): string[] {
	const problems: string[] = [];
	const uses = (re: RegExp) => re.test(code);
	const c = manifest.capabilities;
	if (uses(/ctx\.fetch\s*\(/) && c.network.length === 0)
		problems.push("calls ctx.fetch but declares no capabilities.network");
	if (uses(/ctx\.content\.get\s*\(/) && c.content.read.length === 0)
		problems.push("calls ctx.content.get but declares no capabilities.content.read");
	if (uses(/ctx\.content\.put\s*\(/) && c.content.write.length === 0)
		problems.push("calls ctx.content.put but declares no capabilities.content.write");
	if (uses(/ctx\.secret\s*\(/) && c.secrets.length === 0)
		problems.push("calls ctx.secret but declares no capabilities.secrets");
	if (uses(/ctx\.email\.send\s*\(/) && !c.email) problems.push("calls ctx.email.send but capabilities.email is false");
	for (const hook of manifest.hooks) {
		if (!new RegExp(`\\b${hook}\\b`).test(code))
			problems.push(`declares hook ${hook} but plugin.js does not define it`);
	}
	if (!/globalThis\.__plugin\s*=|export\s+default/.test(code))
		problems.push("plugin.js defines no plugin (export default { ... })");
	for (const m of manifest.adminPages) {
		if (!manifest.routes.some((r) => r.path === m.path && r.methods.includes("GET"))) {
			problems.push(`adminPages path ${m.path} must also be a declared GET route`);
		}
	}
	return problems;
}

export async function run(argv: string[], cwd: string): Promise<CliResult> {
	const [command, dir, keyArg] = argv;
	if (command === "keygen") {
		const { publicKey, privateKey } = generateKeyPairSync("ed25519");
		return {
			code: 0,
			stderr: "",
			stdout: `public (registry config publicKeys):\n${publicKey.export({ type: "spki", format: "der" }).toString("base64")}\n\nprivate (keep secret, pass to pack):\n${privateKey.export({ type: "pkcs8", format: "der" }).toString("base64")}\n`,
		};
	}
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
				stdout: `Created ${dir}/manifest.json and ${dir}/plugin.js\nNext: wuppycms-plugin hash ${dir}\n`,
			};
		}

		const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
		if (command === "validate") {
			return { code: 0, stderr: "", stdout: `Valid plugin: ${manifest.id}@${manifest.version}\n` };
		}
		if (command === "build" || command === "pack") {
			const manifestText = await readFile(manifestPath, "utf8");
			const code = await readFile(join(cwd, dir, "plugin.js"), "utf8");
			const problems = checkCapabilities(manifest, code);
			if (problems.length) return { code: 1, stdout: "", stderr: `Build failed:\n- ${problems.join("\n- ")}` };
			if (command === "build") return { code: 0, stderr: "", stdout: `Build OK: ${manifest.id}@${manifest.version}\n` };
			const sha256 = createHash("sha256").update(manifestText).update("\n--\n").update(code).digest("hex");
			const signature = keyArg
				? sign(
						null,
						Buffer.from(`${manifest.id}@${manifest.version}:${sha256}`),
						createPrivateKey({ key: Buffer.from(keyArg, "base64"), format: "der", type: "pkcs8" }),
					).toString("base64")
				: undefined;
			if (keyArg)
				createPublicKey(createPrivateKey({ key: Buffer.from(keyArg, "base64"), format: "der", type: "pkcs8" }));
			return {
				code: 0,
				stderr: "",
				stdout: `${JSON.stringify({ bundle: { manifest: manifestText, code }, indexEntry: { id: manifest.id, name: manifest.name, description: manifest.description, version: manifest.version, bundle: { url: `${manifest.id}.json`, sha256 }, ...(signature ? { signature } : {}) } }, null, 2)}\n`,
			};
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
