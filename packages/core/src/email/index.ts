import { createTransport, type Transporter } from "nodemailer";
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
export function createEmailSender(
	/** A getter lets Settings changes (provider, sender, SMTP host) apply to the very next email without a restart. */
	settingsSource: WuppySettings | (() => Promise<WuppySettings>),
	/** Test seam: build the SMTP transport. */
	makeTransport: (options: Parameters<typeof createTransport>[0]) => Pick<Transporter, "sendMail"> = createTransport,
): EmailSender {
	return async (message) => {
		const settings = typeof settingsSource === "function" ? await settingsSource() : settingsSource;
		const provider = settings.email.provider;
		const from =
			settings.email.from || (provider === "resend" ? "Wuppy <onboarding@resend.dev>" : "Wuppy <noreply@localhost>");
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
		if (provider === "smtp") {
			const { host, port, user } = settings.email;
			if (!host) throw new Error("Set the SMTP host in Settings → Email");
			const pass = process.env.SMTP_PASSWORD;
			const transport = makeTransport({
				host,
				port,
				// Port 465 is TLS from the first byte; others upgrade with STARTTLS, which nodemailer requires when offered.
				secure: port === 465,
				requireTLS: port !== 465 && !["localhost", "127.0.0.1"].includes(host),
				...(user ? { auth: { user, pass: pass ?? "" } } : {}),
				connectionTimeout: 10_000,
				socketTimeout: 20_000,
			});
			await transport.sendMail({
				from,
				to: message.to,
				subject: message.subject,
				text: message.text ?? "",
				...(message.html ? { html: message.html } : {}),
			});
			console.info(`[wuppy:email] smtp to=${message.to}`);
			return;
		}
		throw new Error(`Email provider "${provider}" is not configured`);
	};
}
