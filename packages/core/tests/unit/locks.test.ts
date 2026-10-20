import { describe, expect, it } from "vitest";
import { EditLocks } from "../../src/content/locks.ts";

describe("EditLocks", () => {
	it("first editor holds it, others are told who, the holder can refresh", () => {
		let t = 1_000_000;
		const locks = new EditLocks(60_000, () => t);
		expect(locks.acquire("posts", "a", "ada")).toEqual({ ok: true });
		const other = locks.acquire("posts", "a", "bob");
		expect(other).toMatchObject({ ok: false, heldBy: { userId: "ada" } });
		t += 30_000;
		expect(locks.acquire("posts", "a", "ada")).toEqual({ ok: true });
		expect(locks.get("posts", "a")?.since).not.toBe(locks.get("posts", "a")?.seenAt);
	});

	it("expires without heartbeats, can be taken over, and is released only by its holder", () => {
		let t = 0;
		const locks = new EditLocks(60_000, () => t);
		locks.acquire("posts", "a", "ada");
		locks.release("posts", "a", "bob");
		expect(locks.get("posts", "a")?.userId).toBe("ada");
		expect(locks.acquire("posts", "a", "bob", true)).toEqual({ ok: true });
		expect(locks.get("posts", "a")?.userId).toBe("bob");
		t = 61_000;
		expect(locks.get("posts", "a")).toBeNull();
		expect(locks.acquire("posts", "a", "cy")).toEqual({ ok: true });
		locks.release("posts", "a", "cy");
		expect(locks.get("posts", "a")).toBeNull();
	});

	it("locks are per entry", () => {
		const locks = new EditLocks();
		locks.acquire("posts", "a", "ada");
		expect(locks.acquire("posts", "b", "bob")).toEqual({ ok: true });
		expect(locks.acquire("pages", "a", "bob")).toEqual({ ok: true });
	});
});
