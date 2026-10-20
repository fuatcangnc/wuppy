// Packs every publishable package and lints the tarballs (publint; attw for packages that ship types).
// Run after `pnpm build`: pnpm verify:pack
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const out = mkdtempSync(join(tmpdir(), "wuppy-pack-"));
const run = (cwd, ...args) => execFileSync("pnpm", args, { cwd, stdio: ["ignore", "inherit", "inherit"] });
// @wuppy/admin ships static files only, so it has no types to check.
const withoutTypes = new Set(["wuppy-admin"]);

for (const dir of readdirSync(join(root, "packages"), { withFileTypes: true })) {
	const cwd = join(root, "packages", dir.name);
	// Folders without a manifest are placeholders; private packages are not published.
	if (!existsSync(join(cwd, "package.json"))) continue;
	if (JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")).private) continue;
	run(cwd, "pack", "--pack-destination", out);
}
let failed = false;
for (const file of readdirSync(out)) {
	const tarball = join(out, file);
	const base = file.replace(/-\d+\.\d+\.\d+.*\.tgz$/, "").replace(/^@/, "").replace("/", "-");
	try {
		run(root, "dlx", "publint@latest", "--strict", tarball);
		if (!withoutTypes.has(base)) run(root, "dlx", "@arethetypeswrong/cli@latest", tarball, "--profile", "esm-only", "--no-emoji");
	} catch {
		failed = true;
	}
}
process.exit(failed ? 1 : 0);
