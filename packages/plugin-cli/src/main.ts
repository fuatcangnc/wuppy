#!/usr/bin/env node
import { run } from "./index.ts";

const result = await run(process.argv.slice(2), process.cwd());
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(`${result.stderr}\n`);
process.exit(result.code);
