// Run by `prepack`: bundles templates/starter into the published package (without installs or local state).
import { execFileSync } from "node:child_process";
import { cp, rm } from "node:fs/promises";
import { resolve } from "node:path";

const from = resolve(import.meta.dirname, "../../../templates/starter");
const to = resolve(import.meta.dirname, "../template");
const SKIP = /(^|[\\/])(node_modules|\.wuppy|\.git|dist|\.astro|\.env)([\\/]|$)/;
// Only files in Git: content, uploads and themes made while running the starter locally stay out.
const tracked = execFileSync("git", ["ls-files", "-z", "."], { cwd: from, encoding: "utf8" })
	.split("\0")
	.filter((f) => f && !SKIP.test(f));
if (!tracked.includes("package.json")) throw new Error("templates/starter has no tracked package.json");

await rm(to, { recursive: true, force: true });
// npm leaves `.gitignore` out of a published package, so it ships as `gitignore` and scaffold() renames it back.
for (const file of tracked) await cp(resolve(from, file), resolve(to, file === ".gitignore" ? "gitignore" : file));
