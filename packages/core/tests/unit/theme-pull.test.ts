import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pullTheme } from "../../src/themes/github.ts";

const git = (cwd: string, ...args: string[]) =>
	execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });

describe("pullTheme", () => {
	it("takes what was pushed, keeps this server's edits, and lets GitHub win where both changed", async () => {
		const root = mkdtempSync(join(tmpdir(), "wuppy-pull-"));
		const upstream = join(root, "upstream");
		const dir = join(root, "theme");
		execFileSync("git", ["init", "--quiet", upstream]);
		for (const f of ["a.astro", "b.tsx", "package.json"]) writeFileSync(join(upstream, f), `${f} 1\n`);
		git(upstream, "add", ".");
		git(upstream, "commit", "--quiet", "-m", "one");
		execFileSync("git", ["clone", "--quiet", upstream, dir]);
		expect(await pullTheme(dir, "")).toBe(false);

		// This server: an edit in the visual editor, and init's change to package.json.
		writeFileSync(join(dir, "a.astro"), "a.astro 1\nedited here\n");
		writeFileSync(join(dir, "b.tsx"), "b.tsx edited here\n");
		writeFileSync(join(dir, "package.json"), "wrapped\n");
		// GitHub: b.tsx deleted, package.json changed.
		git(upstream, "rm", "--quiet", "b.tsx");
		writeFileSync(join(upstream, "package.json"), "package.json 2\n");
		git(upstream, "commit", "--quiet", "-am", "two");

		expect(await pullTheme(dir, "")).toBe(true);
		expect(readFileSync(join(dir, "a.astro"), "utf8")).toBe("a.astro 1\nedited here\n");
		expect(existsSync(join(dir, "b.tsx"))).toBe(false);
		expect(readFileSync(join(dir, "package.json"), "utf8")).toBe("package.json 2\n");
		expect(git(dir, "stash", "list")).toMatch(/Wuppy: edits made on the server/);
		expect(git(dir, "diff", "--name-only", "--diff-filter=U")).toBe("");
	});
});
