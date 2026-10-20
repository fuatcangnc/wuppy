import { createHmac } from "node:crypto";
import { z } from "zod";
import { redact } from "../security/redact.ts";
import { assertPublicUrl } from "../security/ssrf.ts";

export const EVENT_TYPES = ["content.updated", "content.deleted", "content.reverted", "media.uploaded"] as const;

export interface WebhookEvent {
	type: (typeof EVENT_TYPES)[number];
	collection?: string;
	slug?: string;
	sha?: string;
	url?: string;
	at: string;
}

export const webhooksSchema = z
	.array(
		z.object({
			url: z.url({ protocol: /^https?$/ }),
			/** Shared secret for the `X-Wuppy-Signature` HMAC. Strongly recommended. */
			secret: z.string().min(8).optional(),
			events: z.array(z.enum(EVENT_TYPES)).optional(),
		}),
	)
	.default([]);

export type WebhookConfig = z.output<typeof webhooksSchema>[number];

/** Deliveries are best-effort (no retries) and never throw into the code that caused the event. */
export function createWebhookSender(
	hooks: WebhookConfig[],
	{ timeoutMs = 5000, allowPrivate = false }: { timeoutMs?: number; allowPrivate?: boolean } = {},
) {
	return async (event: WebhookEvent): Promise<void> => {
		const body = JSON.stringify(event);
		await Promise.all(
			hooks
				.filter((h) => !h.events || h.events.includes(event.type))
				.map(async (h) => {
					try {
						if (!allowPrivate) await assertPublicUrl(h.url);
						await fetch(h.url, {
							method: "POST",
							redirect: "error",
							signal: AbortSignal.timeout(timeoutMs),
							headers: {
								"content-type": "application/json",
								"x-wuppy-event": event.type,
								...(h.secret
									? { "x-wuppy-signature": `sha256=${createHmac("sha256", h.secret).update(body).digest("hex")}` }
									: {}),
							},
							body,
						});
					} catch (e) {
						console.error(redact(`webhook ${h.url} failed: ${(e as Error).message}`));
					}
				}),
		);
	};
}
