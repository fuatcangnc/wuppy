import { Resend } from "resend";
import type { WuppySettings } from "../data/schemas.ts";

export interface EmailMessage {
	to: string;
	subject: string;
	text?: string;
	html?: string;
	/** When set, Resend renders the published template instead of the inline body. */
	template?: {
		id: string;
		variables?: Record<string, string | number>;
	};
}

export type EmailSender = (message: EmailMessage) => Promise<void>;

/**
 * Console is the zero-config development sender. Resend is a hosted HTTP API;
 * the key is read from the environment so it never lands in site settings.
 */
export function createEmailSender(settings: WuppySettings): EmailSender {
	const provider = settings.email.provider;
	const from =
		settings.email.from || (provider === "resend" ? "Wuppy <onboarding@resend.dev>" : "Wuppy <noreply@localhost>");
	return async (message) => {
		if (provider === "console") {
			console.info(`[wuppy:email] to=${message.to} subject=${message.subject}\n${message.text ?? ""}`);
			return;
		}
		if (provider === "resend") {
			const key = process.env.RESEND_API_KEY;
			if (!key) throw new Error("RESEND_API_KEY is not set");
			const resend = new Resend(key);
			const result = message.template
				? await resend.emails.send({
						from,
						to: message.to,
						subject: message.subject,
						template: message.template,
					})
				: await resend.emails.send({
						from,
						to: message.to,
						subject: message.subject,
						text: message.text ?? "",
						...(message.html ? { html: message.html } : {}),
					});
			if (result.error) throw new Error(`Resend rejected the message: ${result.error.message}`);
			console.info(`[wuppy:email] id=${result.data?.id ?? "unknown"} to=${message.to}`);
			return;
		}
		throw new Error(`Email provider "${provider}" is not configured`);
	};
}
