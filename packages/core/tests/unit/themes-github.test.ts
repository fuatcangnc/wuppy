import { existsSync, readlinkSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GithubAccounts, githubAstroRepos, GithubThemes, olderThan, type Run } from "../../src/themes/github.ts";

let base: string;
beforeEach(async () => {
	base = await mkdtemp(join(tmpdir(), "wuppy-themes-"));
	await mkdir(join(base, "node_modules", "wuppycms"), { recursive: true });
	await writeFile(
		join(base, "wuppy.config.mjs"),
		`export default { collections: [{ name: "posts", dir: "content/posts" }] };`,
	);
});
afterEach(() => rm(base, { recursive: true, force: true }));

const put = async (path: string, text: string) => {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, text);
};

/** Fake git/npm/astro: each step leaves what the real one would. */
function fakeRun(
	calls: { cmd: string; args: string[]; env: NodeJS.ProcessEnv }[],
	buildOk = true,
	astro = "7.4.2",
): Run {
	return async (cmd, args, { cwd, env }) => {
		calls.push({ cmd, args, env });
		if (cmd === "git") {
			const dir = args.at(-1)!;
			await put(join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
			await put(join(dir, "package.json"), JSON.stringify({ dependencies: { astro: "7", wuppycms: "^1" } }));
			await put(
				join(dir, "astro.config.mjs"),
				`import { defineConfig } from "astro/config";\nexport default defineConfig({\n\tsite: "https://x.test",\n\tmarkdown: { remarkPlugins: [] },\n});\n`,
			);
			await put(join(dir, "src/content/posts/a.md"), "---\ntitle: A\n---\nHi\n");
		} else if (cmd === "npm") {
			await put(join(cwd, "node_modules/astro/bin/astro.mjs"), "");
			await put(join(cwd, "node_modules/astro/package.json"), JSON.stringify({ version: astro }));
		} else if (buildOk) await put(join(cwd, "dist/server/entry.mjs"), "");
	};
}

const settle = async (themes: GithubThemes) => {
	await vi.waitFor(() => expect(themes.job?.status).not.toBe("running"), { timeout: 5000 });
};

const page = (nodes: object[], next: boolean) =>
	new Response(
		JSON.stringify({
			data: { viewer: { repositories: { pageInfo: { hasNextPage: next, endCursor: "c1" }, nodes } } },
		}),
	);

describe("GitHub themes", () => {
	it("clones, wraps, installs, links Wuppy, builds and activates", async () => {
		const calls: { cmd: string; args: string[]; env: NodeJS.ProcessEnv }[] = [];
		const restart = vi.fn(() => true);
		const themes = new GithubThemes({ base, run: fakeRun(calls), restart });
		process.env.WUPPY_SECRET = "s".repeat(40);
		themes.install("me/site", "gho_secret");
		await settle(themes);
		expect(themes.job).toMatchObject({ status: "done" });
		// The theme's sample post is now the site's.
		expect(await readFile(join(base, "content/posts/a.md"), "utf8")).toContain("title: A");

		expect(calls.map((c) => c.cmd)).toEqual(["git", "npm", process.execPath]);
		const [clone, npm, build] = calls;
		expect(npm!.args).toContain("--replace-registry-host=always");
		expect(clone!.args).toEqual(["clone", "--", "https://github.com/me/site.git", themes.themeDir("me/site")]);
		// The token goes in the environment, never argv; no server secret reaches the repo's code.
		expect(clone!.args.join(" ")).not.toContain("gho_secret");
		expect(Buffer.from(clone!.env.GIT_CONFIG_VALUE_0!.split(" ").at(-1)!, "base64").toString()).toBe(
			"x-access-token:gho_secret",
		);
		for (const c of [npm!, build!]) expect(c.env.WUPPY_SECRET).toBeUndefined();
		expect(build!.env.NODE_ENV).toBe("production");
		expect(build!.args.slice(1)).toEqual(["build", "--config", "astro.wuppy.config.mjs"]);

		const dir = themes.themeDir("me/site");
		expect(existsSync(join(dir, "wuppy.config.mjs"))).toBe(true);
		expect(existsSync(join(dir, ".env"))).toBe(false);
		const deps = JSON.parse(await readFile(join(dir, "package.json"), "utf8")).dependencies;
		expect(deps.wuppycms).toBeUndefined();
		expect(deps["@astrojs/node"]).toBeDefined();
		expect(deps["@astrojs/markdown-remark"]).toBeDefined();
		expect(deps.astro).toBe("^7.4.0");
		expect(await readFile(join(dir, "astro.wuppy.config.mjs"), "utf8")).toContain(
			'import config from "./astro.config.mjs"',
		);
		expect(readlinkSync(join(dir, "node_modules/wuppycms"))).toContain(join("node_modules", "wuppycms"));

		expect(await themes.installed()).toEqual(["me/site"]);
		expect(await themes.active()).toBe("me/site");
		expect(JSON.parse(await readFile(join(base, ".wuppy/themes/active.json"), "utf8")).dir).toBe(
			".wuppy/themes/me__site",
		);
		expect(restart).toHaveBeenCalledOnce();

		await themes.activate(null);
		expect(await themes.active()).toBeNull();
	});

	it("reports a failed build and keeps the current site", async () => {
		const themes = new GithubThemes({ base, run: fakeRun([], false) });
		themes.install("me/site", "t");
		await settle(themes);
		expect(themes.job).toMatchObject({ status: "failed", error: expect.stringMatching(/server entry/) });
		expect(await themes.active()).toBeNull();
		await expect(themes.activate("me/site")).rejects.toThrow(/not installed/);
		// Installing again after a failure clones afresh, so a fix pushed to GitHub is picked up.
		const calls: { cmd: string; args: string[]; env: NodeJS.ProcessEnv }[] = [];
		const retry = new GithubThemes({ base, run: fakeRun(calls) });
		retry.install("me/site", "t");
		await settle(retry);
		expect(calls[0]?.cmd).toBe("git");
		expect(retry.job).toMatchObject({ status: "done" });
	});

	it("fails the install when npm still installs an Astro without source marks", async () => {
		const themes = new GithubThemes({ base, run: fakeRun([], true, "7.3.1") });
		themes.install("me/site", "t");
		await settle(themes);
		expect(themes.job).toMatchObject({ status: "failed", error: expect.stringMatching(/Astro 7\.3\.1/) });
	});

	it("raises only an Astro range that allows versions before 7.4", () => {
		expect(
			["7", "^7.3.1", "~6.2.0", "^7.4.0", "^7.4.2", "8", "latest", "*"].map((r) => olderThan(r, "^7.4.0")),
		).toEqual([true, true, true, false, false, false, false, false]);
	});

	it("rejects bad repo names and a second install while one runs", () => {
		const themes = new GithubThemes({ base, run: () => new Promise(() => {}) });
		expect(() => themes.install("../etc", "t")).toThrow(/owner\/name/);
		themes.install("me/a", "t");
		expect(() => themes.install("me/b", "t")).toThrow(/still being installed/);
	});

	it("lists only Astro repos from the GraphQL API, across pages", async () => {
		const fetchFn = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				page([{ nameWithOwner: "me/a", isPrivate: true, description: null, object: { text: '{"astro": "7"}' } }], true),
			)
			.mockResolvedValueOnce(
				page([{ nameWithOwner: "me/b", isPrivate: false, description: "x", object: null }], false),
			);
		expect(await githubAstroRepos("t", fetchFn)).toEqual([{ repo: "me/a", private: true, description: "" }]);
		expect(JSON.parse(fetchFn.mock.calls[1]![1]!.body as string).variables).toEqual({ endCursor: "c1" });
		await expect(githubAstroRepos("t", async () => new Response("", { status: 401 }))).rejects.toMatchObject({
			status: 401,
		});
	});

	it("connects GitHub through the OAuth consent page and keeps the token sealed per user", async () => {
		const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ access_token: "gho_secret", scope: "repo" }));
		const db = new DatabaseSync(":memory:");
		const app = {
			clientId: "cid",
			clientSecret: "csecret",
			redirectUri: "https://site.test/api/themes/github/callback",
		};
		const gh = new GithubAccounts(db, "s".repeat(40), app, fetchFn);
		expect(gh.configured).toBe(true);
		expect(new GithubAccounts(db, "s".repeat(40), { ...app, clientSecret: "" }).configured).toBe(false);

		const url = new URL(gh.authorizeUrl("u1"));
		expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
		expect(url.searchParams.get("scope")).toBe("repo");
		expect(url.searchParams.get("redirect_uri")).toBe(app.redirectUri);
		const state = url.searchParams.get("state")!;
		// The state belongs to the admin who started, and works once.
		await expect(gh.finish("u2", "code", state)).rejects.toThrow(/expired/);
		const again = new URL(gh.authorizeUrl("u1")).searchParams.get("state")!;
		await gh.finish("u1", "code", again);
		await expect(gh.finish("u1", "code", again)).rejects.toThrow(/expired/);
		expect(Object.fromEntries(fetchFn.mock.calls[0]![1]!.body as URLSearchParams)).toEqual({
			client_id: "cid",
			client_secret: "csecret",
			code: "code",
			redirect_uri: app.redirectUri,
		});
		expect(gh.token("u1")).toBe("gho_secret");
		expect(gh.token("u2")).toBeNull();
		expect(JSON.stringify(db.prepare("SELECT * FROM wuppy_github_tokens").all())).not.toContain("gho_secret");
		gh.disconnect("u1");
		expect(gh.token("u1")).toBeNull();

		const denied = new GithubAccounts(db, "s".repeat(40), app, async () =>
			Response.json({ error: "bad_verification_code", error_description: "The code is wrong." }),
		);
		const s2 = new URL(denied.authorizeUrl("u1")).searchParams.get("state")!;
		await expect(denied.finish("u1", "x", s2)).rejects.toThrow("The code is wrong.");
	});
});
