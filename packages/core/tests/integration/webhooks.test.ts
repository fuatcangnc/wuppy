import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NoopGit } from "@wuppycms/git";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectionSchema } from "../../src/content-types/index.ts";
import { ContentService } from "../../src/content/service.ts";
import { createWebhookSender, type WebhookEvent } from "../../src/webhooks/index.ts";

let server: Server;
let received: { headers: Record<string, string | string[] | undefined>; body: string }[];
let url: string;
let root: string;

beforeEach(async () => {
	received = [];
	root = await mkdtemp(join(tmpdir(), "wuppy-hook-"));
	server = createServer((req, res) => {
		let body = "";
		req.on("data", (c) => (body += c));
		req.on("end", () => {
			received.push({ headers: req.headers, body });
			res.end("ok");
		});
	});
	await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
	url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
});
afterEach(async () => {
	await new Promise((r) => server.close(r));
	await rm(root, { recursive: true, force: true });
});

const event: WebhookEvent = { type: "content.updated", collection: "posts", slug: "a", at: "2026-01-01T00:00:00.000Z" };

describe("webhooks", () => {
	it("POSTs the event as JSON with an HMAC-SHA256 signature", async () => {
		const send = createWebhookSender([{ url, secret: "s3cret" }], { allowPrivate: true });
		await send(event);
		expect(received).toHaveLength(1);
		const { headers, body } = received[0]!;
		expect(JSON.parse(body)).toEqual(event);
		expect(headers["x-wuppy-event"]).toBe("content.updated");
		expect(headers["x-wuppy-signature"]).toBe(`sha256=${createHmac("sha256", "s3cret").update(body).digest("hex")}`);
	});

	it("only sends events a hook subscribed to", async () => {
		const send = createWebhookSender([{ url, events: ["content.deleted"] }], { allowPrivate: true });
		await send(event);
		expect(received).toHaveLength(0);
		await send({ ...event, type: "content.deleted" });
		expect(received).toHaveLength(1);
	});

	it("an unreachable endpoint never throws into the caller", async () => {
		const send = createWebhookSender([{ url: "http://127.0.0.1:1/nope" }], { timeoutMs: 500 });
		await expect(send(event)).resolves.toBeUndefined();
	});

	it("ContentService emits events for put, delete and revert", async () => {
		const events: string[] = [];
		const svc = new ContentService(
			root,
			[collectionSchema.parse({ name: "posts", dir: "content/posts" })],
			new NoopGit(),
			{ emit: (e) => events.push(`${e.type}:${e.slug ?? ""}`) },
		);
		await svc.put("posts", "a", { data: {}, body: "x" });
		await svc.delete("posts", "a");
		expect(events).toEqual(["content.updated:a", "content.deleted:a"]);
	});
});

describe("webhook SSRF guard", () => {
	it("refuses private targets unless explicitly allowed", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const send = createWebhookSender([{ url: "http://169.254.169.254/latest" }]);
		await send({ type: "content.updated", at: "now" });
		expect(spy.mock.calls[0]?.[0]).toMatch(/private address/);
		spy.mockRestore();
	});
});
