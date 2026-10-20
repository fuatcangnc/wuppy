import type { WuppySettings } from "../data/schemas.ts";

export const EMAIL_KINDS = ["invite", "reset", "magic"] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

/** Variables each template may use as `{{name}}`. */
export const EMAIL_VARIABLES: Record<EmailKind, string[]> = {
	invite: ["siteName", "role", "link", "expiresAt"],
	reset: ["siteName", "link"],
	magic: ["siteName", "link"],
};

export const DEFAULT_TEMPLATES: Record<EmailKind, { subject: string; text: string }> = {
	invite: {
		subject: "You're invited to {{siteName}}",
		text: "You have been invited to {{siteName}} as {{role}}. Choose your password here: {{link}}\n\nThis link expires on {{expiresAt}}.",
	},
	reset: {
		subject: "Reset your {{siteName}} password",
		text: "Open this link to choose a new {{siteName}} password (valid for 30 minutes): {{link}}",
	},
	magic: {
		subject: "Sign in to {{siteName}}",
		text: "Open this link to sign in to {{siteName}}: {{link}}",
	},
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Fills `{{variable}}` placeholders. Unknown placeholders stay visible (so a typo is noticed in the test email),
 * and the HTML version escapes every value; only `link` becomes an anchor.
 */
export function renderEmail(
	kind: EmailKind,
	settings: Pick<WuppySettings, "email">,
	vars: Record<string, string>,
): { subject: string; text: string; html: string } {
	const custom = settings.email.templates?.[kind];
	const template = { ...DEFAULT_TEMPLATES[kind], ...custom };
	const fill = (source: string, wrap: (name: string, value: string) => string) =>
		source.replace(/\{\{(\w+)\}\}/g, (whole, name: string) => (name in vars ? wrap(name, vars[name]!) : whole));
	return {
		subject: fill(template.subject, (_, v) => v),
		text: fill(template.text, (_, v) => v),
		html: template.text
			.split(/\n{2,}/)
			.map(
				(para) =>
					`<p>${esc(para).replace(/\{\{(\w+)\}\}/g, (whole, name: string) =>
						name === "link" && vars.link
							? `<a href="${esc(vars.link)}">${esc(vars.link)}</a>`
							: name in vars
								? esc(vars[name]!)
								: whole,
					)}</p>`,
			)
			.join(""),
	};
}
