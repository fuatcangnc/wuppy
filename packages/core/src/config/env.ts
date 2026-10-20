import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Minimal `.env` loader for the Node server. Values already present in the
 * process environment win, so deployments can keep using platform secrets.
 */
export async function loadDotEnv(root: string): Promise<void> {
	let text: string;
	try {
		text = await readFile(join(root, ".env"), "utf8");
	} catch {
		return;
	}
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
		if (!match) continue;
		const key = match[1];
		if (!key) continue;
		const raw = match[2] ?? "";
		if (process.env[key] !== undefined) continue;
		let value = raw.trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		process.env[key] = value;
	}
}
