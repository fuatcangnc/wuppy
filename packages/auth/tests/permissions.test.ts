import { describe, expect, it } from "vitest";
import { permissionsFor, ROLES } from "../src/permissions/index.ts";

describe("permissionsFor", () => {
	it("admin can do everything", () => expect(permissionsFor("admin")).toContain("git:revert"));
	it("only admins read the audit log", () => {
		expect(permissionsFor("admin")).toContain("audit:read");
		expect(permissionsFor("editor")).not.toContain("audit:read");
	});
	it("only admins can export/import the site", () => {
		expect(permissionsFor("admin")).toContain("site:transfer");
		expect(permissionsFor("editor")).not.toContain("site:transfer");
	});
	it("authors write drafts but cannot publish", () => {
		const p = permissionsFor("author");
		expect(p).toEqual(expect.arrayContaining(["content:read", "content:write", "media:write"]));
		expect(p).not.toContain("content:publish");
		expect(p).not.toContain("content:delete");
	});
	it("editors and admins publish", () => {
		expect(permissionsFor("editor")).toContain("content:publish");
		expect(permissionsFor("admin")).toContain("content:publish");
	});
	it("viewer is read-only", () => {
		expect(permissionsFor("viewer")).toEqual(["content:read"]);
	});
	it("editor writes content but cannot revert", () => {
		const p = permissionsFor("editor");
		expect(p).toContain("content:write");
		expect(p).not.toContain("git:revert");
	});
	it("editor can upload media, viewer cannot", () => {
		expect(permissionsFor("editor")).toContain("media:write");
		expect(permissionsFor("viewer")).not.toContain("media:write");
	});
	it("unknown or missing role gets nothing (fail closed)", () => {
		expect(permissionsFor("hacker")).toEqual([]);
		expect(permissionsFor(null)).toEqual([]);
	});
	it("lists known roles", () => expect(ROLES).toEqual(["admin", "editor", "author", "viewer"]));
});
