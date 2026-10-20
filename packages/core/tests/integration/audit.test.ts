import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { AuditLog } from "../../src/audit/index.ts";

let log: AuditLog;
beforeEach(() => void (log = new AuditLog(new DatabaseSync(":memory:"))));

describe("AuditLog", () => {
	it("stores events and lists newest first", () => {
		log.record({ type: "auth.sign_in", ok: true, actor: "u1", at: "2026-01-01T00:00:00.000Z" });
		log.record({ type: "auth.sign_in", ok: false, email: "x@y.z", at: "2026-01-02T00:00:00.000Z" });
		expect(log.list().map((e) => [e.type, e.ok, e.actor ?? null, e.email ?? null])).toEqual([
			["auth.sign_in", false, null, "x@y.z"],
			["auth.sign_in", true, "u1", null],
		]);
	});

	it("caps the page size", () => {
		for (let i = 0; i < 5; i++) log.record({ type: "t", ok: true, at: `2026-01-0${i + 1}T00:00:00.000Z` });
		expect(log.list(2)).toHaveLength(2);
		expect(log.list(10_000).length).toBeLessThanOrEqual(500);
	});
});
