#!/usr/bin/env node
import { resolve } from "node:path";
import { scaffold } from "./index.ts";

const [name, ...rest] = process.argv.slice(2);
if (!name || name.startsWith("-")) {
	console.error("Usage: create-wuppy <project-name> [--url http://localhost:4321]");
	process.exit(1);
}
const url = rest[rest.indexOf("--url") + 1] ?? "http://localhost:4321";

try {
	await scaffold({
		template: resolve(import.meta.dirname, "../../../templates/starter"),
		target: resolve(name),
		name,
		url,
	});
	console.log(
		`\nCreated ${name}.\n\n  cd ${name}\n  pnpm install\n  pnpm dev\n\nThen open ${url}/admin to create your account.`,
	);
} catch (e) {
	console.error((e as Error).message);
	process.exit(1);
}
