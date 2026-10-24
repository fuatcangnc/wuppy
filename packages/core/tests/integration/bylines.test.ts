import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { RealGit } from "@wuppycms/git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.ts";
import { creditsOf, validateBylines } from "../../src/bylines/index.ts";
import { CommentService } from "../../src/comments/index.ts";
import { collectionSchema, fieldSchema } from "../../src/content-types/index.ts";
import { generateTypes } from "../../src/content-types/generate.ts";
import { ContentService } from "../../src/content/service.ts";
import { JsonStore } from "../../src/data/store.ts";
import { getByline, getCredits } from "../../src/data/helpers.ts";
import { bylineFieldSchema, bylineSchema } from "../../src/data/schemas.ts";
import { MediaService } from "../../src/media/index.ts";
import { RedirectService } from "../../src/redirects/service.ts";

const H = { "X-Wuppy-Request": "1", "Content-Type": "application/json" };
let root: string;
let app: ReturnType<typeof createApp>;
let json: JsonStore;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-byl-"));
	const git = await RealGit.init(root);
	json = new JsonStore(root, git);
	app = createApp({
		service: new ContentService(root, [], git),
		media: new MediaService(root, git),
		json,
		comments: new CommentService(new DatabaseSync(":memory:")),
		redirects: new RedirectService(json, new DatabaseSync(":memory:"), []),
		userCount: () => 1,
		getUser: async () => ({ id: "u", permissions: ["content:read", "content:write", "bylines:manage"] }),
	});
});
afterEach(() => rm(root, { recursive: true, force: true }));

const put = (name: string, data: unknown) =>
	app.request(`/api/data/${name}`, { method: "PUT", headers: H, body: JSON.stringify({ data }) });
const field = (over: object) => bylineFieldSchema.parse({ name: "twitter", label: "Twitter", ...over });
const byline = (over: object = {}) => bylineSchema.parse({ slug: "ada", name: "Ada", ...over });

describe("byline schema validation", () => {
	it("flags missing required values and bad URLs", () => {
		const fields = [field({ required: true }), field({ name: "site", label: "Site", type: "url" })];
		expect(validateBylines([byline({ extra: { twitter: "@ada", site: "https://a.dev" } })], fields)).toEqual([]);
		expect(validateBylines([byline({ extra: { site: "nope" } })], fields).map((i) => i.field)).toEqual([
			"twitter",
			"site",
		]);
	});

	it("rejects saving a byline that breaks the schema, and lists existing ones that do", async () => {
		await put("byline-schema", [field({ required: true })]);
		const res = await put("bylines", [byline()]);
		expect(res.status).toBe(422);
		expect(await put("bylines", [byline({ extra: { twitter: "@ada" } })])).toHaveProperty("status", 200);
		await put("byline-schema", [field({ required: true }), field({ name: "site", label: "Site", required: true })]);
		const issues = (await (await app.request("/api/bylines/issues")).json()) as {
			data: { slug: string; field: string }[];
		};
		expect(issues.data).toMatchObject([{ slug: "ada", field: "site" }]);
	});
});

describe("credits", () => {
	it("the byline field accepts slugs and { byline, role } items", () => {
		const schema = fieldSchema({ type: "byline", multiple: true, required: false });
		expect(schema.safeParse(["ada", { byline: "bob", role: "photographer" }]).success).toBe(true);
		expect(schema.safeParse([{ role: "x" }]).success).toBe(false);
		expect(creditsOf(["ada", { byline: "bob", role: "editor" }, 3, ""])).toEqual([
			{ byline: "ada" },
			{ byline: "bob", role: "editor" },
		]);
		expect(generateTypes([collectionSchema.parse({ name: "posts", dir: "p", fields: { by: "byline" } })])).toContain(
			'"by"?: string | Array<string | { byline: string; role?: string }>',
		);
	});

	it("resolves credits and translations, and never exposes the email", async () => {
		await mkdir(join(root, ".wuppy/data"), { recursive: true });
		await writeFile(
			join(root, ".wuppy/data/bylines.json"),
			JSON.stringify([byline({ email: "a@x.dev", bio: "Hi", translations: { tr: { name: "Ayşe" } } })]),
		);
		const credits = await getCredits(["ada", { byline: "ghost" }, { byline: "ada", role: "editor" }], root, "tr");
		expect(credits.map((c) => [c.byline.name, c.role, c.byline.bio, c.byline.email])).toEqual([
			["Ayşe", undefined, "Hi", ""],
			["Ayşe", "editor", "Hi", ""],
		]);
		expect((await getByline("ada", root, "de"))?.name).toBe("Ada");
	});
});
