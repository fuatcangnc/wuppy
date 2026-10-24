import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(import.meta.dirname, "../../src");
const FORBIDDEN = /from\s+["'](cloudflare:|@cloudflare\/|wrangler|kysely-d1)/;

function files(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? files(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : [],
	);
}

describe("ADR-001: core does not know Cloudflare", () => {
	it("no source file imports a Cloudflare package", () => {
		const offenders = files(SRC).filter((f) => FORBIDDEN.test(readFileSync(f, "utf8")));
		expect(offenders).toEqual([]);
	});
	it("core does not depend on @wuppycms/cloudflare", () => {
		const pkg = JSON.parse(readFileSync(resolve(SRC, "../package.json"), "utf8")) as Record<
			string,
			Record<string, string>
		>;
		expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies })).not.toContain(
			"@wuppycms/cloudflare",
		);
	});
});
