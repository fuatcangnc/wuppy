#!/usr/bin/env node
import { run } from "./index.ts";
import { startMcp } from "./mcp.ts";

const argv = process.argv.slice(2);
if (argv[0] === "mcp") {
	// stdout belongs to the MCP transport: never print a CLI result here.
	await startMcp({ cwd: process.cwd() });
} else {
	const { code, stdout, stderr } = await run(argv, process.cwd());
	if (stdout) process.stdout.write(stdout);
	if (stderr) process.stderr.write(stderr + "\n");
	process.exit(code);
}
