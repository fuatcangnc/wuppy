import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveSessionPolicy } from "../../src/config/session.ts";

afterEach(() => vi.unstubAllEnvs());

describe("session policy", () => {
	it("uses a seven-day lifetime refreshed daily by default", () => {
		vi.stubEnv("WUPPY_SESSION_DAYS", "");
		vi.stubEnv("WUPPY_SESSION_UPDATE_HOURS", "");
		expect(resolveSessionPolicy()).toEqual({ expiresIn: 7 * 86_400, updateAge: 86_400 });
	});

	it("accepts fractional days and an update age of zero", () => {
		vi.stubEnv("WUPPY_SESSION_DAYS", "0.5");
		vi.stubEnv("WUPPY_SESSION_UPDATE_HOURS", "0");
		expect(resolveSessionPolicy()).toEqual({ expiresIn: 43_200, updateAge: 0 });
	});

	it("rejects invalid or contradictory values", () => {
		vi.stubEnv("WUPPY_SESSION_DAYS", "soon");
		expect(() => resolveSessionPolicy()).toThrow(/WUPPY_SESSION_DAYS must be a number/);

		vi.stubEnv("WUPPY_SESSION_DAYS", "0");
		expect(() => resolveSessionPolicy()).toThrow(/greater than 0/);

		vi.stubEnv("WUPPY_SESSION_DAYS", "1");
		vi.stubEnv("WUPPY_SESSION_UPDATE_HOURS", "-1");
		expect(() => resolveSessionPolicy()).toThrow(/0 or greater/);

		vi.stubEnv("WUPPY_SESSION_UPDATE_HOURS", "24");
		expect(() => resolveSessionPolicy()).toThrow(/less than the session lifetime/);
	});
});
