import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RealGit } from "../../src/adapters/real-git.ts";

let dir: string;
let git: RealGit;
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "wuppy-git-"));
	git = await RealGit.init(dir);
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const write = (name: string, text: string) => writeFile(join(dir, name), text);

describe("RealGit", () => {
	it("history of a repository without commits is empty, not an error", async () => {
		expect(await git.history()).toEqual([]);
		expect(await git.history("never-saved.md")).toEqual([]);
	});

	it("commits a file and lists it in history, newest first", async () => {
		await write("a.md", "one\n");
		await git.commit(["a.md"], "feat: add a");
		await write("a.md", "two\n");
		await git.commit(["a.md"], "feat: edit a");

		const log = await git.history("a.md");
		expect(log.map((c) => c.message)).toEqual(["feat: edit a", "feat: add a"]);
		expect(log[0]?.sha).toMatch(/^[0-9a-f]{40}$/);
	});

	it("returns a diff for a commit", async () => {
		await write("a.md", "one\n");
		await git.commit(["a.md"], "add");
		await write("a.md", "two\n");
		const sha = await git.commit(["a.md"], "edit");
		const diff = await git.diff(sha);
		expect(diff).toContain("-one");
		expect(diff).toContain("+two");
	});

	it("revert creates a new commit and keeps history", async () => {
		await write("a.md", "one\n");
		await git.commit(["a.md"], "add");
		await write("a.md", "two\n");
		const bad = await git.commit(["a.md"], "edit");

		await git.revert(bad);

		expect(await readFile(join(dir, "a.md"), "utf8")).toBe("one\n");
		const log = await git.history("a.md");
		expect(log).toHaveLength(3);
		expect(log[0]?.message).toMatch(/^Revert/);
	});

	it("does not commit when nothing changed", async () => {
		await write("a.md", "one\n");
		await git.commit(["a.md"], "add");
		await expect(git.commit(["a.md"], "noop")).rejects.toThrow(/nothing to commit/i);
	});

	it("rejects a sha that is not hex (no option injection)", async () => {
		await expect(git.diff("--output=/tmp/x")).rejects.toThrow(/invalid/i);
		await expect(git.revert("-n")).rejects.toThrow(/invalid/i);
	});

	it("rejects paths that escape the repo", async () => {
		await expect(git.commit(["../x"], "bad")).rejects.toThrow(/unsafe/i);
	});
});
