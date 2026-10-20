import { afterEach, describe, expect, it, vi } from "vitest";
import { settingsSchema } from "../../src/data/schemas.ts";
import { createEmailSender } from "../../src/email/index.ts";
import { renderEmail } from "../../src/email/templates.ts";

const settings = (email: object = {}) => settingsSchema.parse({ siteName: "Acme", email });
afterEach(() => vi.unstubAllEnvs());

describe("renderEmail", () => {
	it("fills the default templates", () => {
		const m = renderEmail("invite", settings(), {
			siteName: "Acme",
			role: "editor",
			link: "https://x/y?a=1&b=2",
			expiresAt: "2030-01-01",
		});
		expect(m.subject).toBe("You're invited to Acme");
		expect(m.text).toContain("as editor. Choose your password here: https://x/y?a=1&b=2");
		expect(m.html).toContain('<a href="https://x/y?a=1&amp;b=2">');
		expect(m.html.match(/<p>/g)).toHaveLength(2);
	});

	it("uses site overrides, keeps unknown placeholders visible, and escapes values in HTML", () => {
		const s = settings({
			templates: { reset: { subject: "Hi {{siteName}} {{oops}}", text: "Go: {{link}} <b>{{siteName}}</b>" } },
		});
		const m = renderEmail("reset", s, { siteName: "A&B", link: "https://x" });
		expect(m.subject).toBe("Hi A&B {{oops}}");
		expect(m.html).toContain("A&amp;B");
		expect(m.html).toContain("&lt;b&gt;");
		expect(m.html).not.toContain("<b>");
	});

	it("a partial override keeps the default for the other field", () => {
		const m = renderEmail("magic", settings({ templates: { magic: { subject: "Your login" } } }), {
			siteName: "Acme",
			link: "L",
		});
		expect(m.subject).toBe("Your login");
		expect(m.text).toBe("Open this link to sign in to Acme: L");
	});
});

describe("SMTP sender", () => {
	it("builds a TLS-upgrading transport from settings and the SMTP_PASSWORD env var", async () => {
		vi.stubEnv("SMTP_PASSWORD", "pw");
		const sendMail = vi.fn(async () => ({}));
		const options: unknown[] = [];
		const send = createEmailSender(
			settings({ provider: "smtp", host: "smtp.example.com", port: 587, user: "me", from: "Acme <a@example.com>" }),
			(o) => {
				options.push(o);
				return { sendMail } as never;
			},
		);
		await send({ to: "x@example.com", subject: "S", text: "T" });
		expect(options[0]).toMatchObject({
			host: "smtp.example.com",
			port: 587,
			secure: false,
			requireTLS: true,
			auth: { user: "me", pass: "pw" },
		});
		expect(sendMail).toHaveBeenCalledWith({
			from: "Acme <a@example.com>",
			to: "x@example.com",
			subject: "S",
			text: "T",
		});
	});

	it("uses implicit TLS on 465, requires a host, and reads settings fresh on every send", async () => {
		let current = settings({ provider: "smtp", host: "", port: 465 });
		const sent: unknown[] = [];
		const send = createEmailSender(
			async () => current,
			(o) => ({ sendMail: async () => void sent.push(o) }) as never,
		);
		await expect(send({ to: "x@example.com", subject: "S" })).rejects.toThrow(/SMTP host/);
		current = settings({ provider: "smtp", host: "mail.example.com", port: 465 });
		await send({ to: "x@example.com", subject: "S" });
		expect(sent[0]).toMatchObject({ secure: true, requireTLS: false });
	});
});
