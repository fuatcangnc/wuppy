#!/usr/bin/env node
import { run } from "./index.ts";

const { code, stdout, stderr } = await run(process.argv.slice(2), process.cwd());
if (stdout) process.stdout.write(stdout);
if (stderr) process.stderr.write(stderr + "\n");
process.exit(code);
