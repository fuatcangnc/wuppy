#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { scaffold } from "./index.ts";

const [name, ...rest] = process.argv.slice(2);
if (!name || name.startsWith("-")) {
	console.error("Usage: create-wuppy <project-name> [--url http://localhost:4321]");
	process.exit(1);
}
const url = rest[rest.indexOf("--url") + 1] ?? "http://localhost:4321";

// Published packages carry the template next to dist/; a workspace checkout reads it from templates/.
const bundled = resolve(import.meta.dirname, "../template");
const { version } = JSON.parse(readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8")) as {
	version: string;
};

try {
	await scaffold({
		template: existsSync(bundled) ? bundled : resolve(import.meta.dirname, "../../../templates/starter"),
		wuppyVersion: `^${version}`,
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
