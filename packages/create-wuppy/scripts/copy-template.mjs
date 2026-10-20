// Run by `prepack`: bundles templates/starter into the published package (without installs or local state).
import { cp, rm } from "node:fs/promises";
import { resolve } from "node:path";

const from = resolve(import.meta.dirname, "../../../templates/starter");
const to = resolve(import.meta.dirname, "../template");
const SKIP = /(^|[\\/])(node_modules|\.wuppy|\.git|dist|\.astro|\.env)([\\/]|$)/;

await rm(to, { recursive: true, force: true });
await cp(from, to, { recursive: true, filter: (src) => !SKIP.test(src.slice(from.length)) });
