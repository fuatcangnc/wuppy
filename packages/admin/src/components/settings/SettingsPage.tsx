import {
	DatabaseBackup,
	FileText,
	Image as ImageIcon,
	Mail,
	MessageSquare,
	Search,
	Send,
	Settings2,
	Share2,
	ShieldCheck,
} from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { useEffect, useState } from "react";
import { apiData } from "../../lib/api.ts";
import { $data, $dataErrors, loadData, saveData } from "../../stores/dashboard.ts";
import { WorkspaceLayout, WorkspacePanel, WorkspaceSidebar } from "../shared/WorkspaceLayout.tsx";
import { Button, Card, CardHeader, Checkbox, ErrorText, Input, Select, Textarea, toast } from "../../ui/index.tsx";

interface Settings {
	siteName: string;
	siteUrl: string;
	description: string;
	logo: string;
	locale: string;
	timezone: string;
	seo: {
		title: string;
		description: string;
		image: string;
		noindex: boolean;
		titleTemplate: string;
		sitemap: { exclude: string[]; priority: Record<string, number> };
	};
	social: Record<string, string>;
	email: {
		from: string;
		provider: "console" | "smtp" | "resend";
		host: string;
		port: number;
		user: string;
		templates: Partial<Record<EmailKind, { subject?: string; text?: string }>>;
	};
	media: { maxBytes: number; allowed: string[] };
	comments: { enabled: boolean; moderated: boolean; notifyEmail?: string };
	security: { allowedDomains: string[] };
	backup: { enabled: boolean; intervalHours: number; keep: number };
}

type EmailKind = "invite" | "reset" | "magic";
const KIND_LABEL: Record<EmailKind, string> = {
	invite: "Invitation",
	reset: "Password reset",
	magic: "Magic link",
};
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const SOCIALS = ["twitter", "github", "linkedin", "facebook", "instagram", "youtube", "mastodon"];
const SECTIONS = [
	{
		id: "general",
		label: "General",
		description: "Site identity and defaults.",
		group: "Site",
		icon: Settings2,
	},
	{ id: "seo", label: "SEO", description: "Search and social defaults.", group: "Site", icon: Search },
	{
		id: "social",
		label: "Social accounts",
		description: "Theme links.",
		group: "Site",
		icon: Share2,
	},
	{
		id: "comments",
		label: "Comments",
		description: "Moderation and notifications.",
		group: "Site",
		icon: MessageSquare,
	},
	{
		id: "media",
		label: "Media usage",
		description: "Upload limits and formats.",
		group: "Media",
		icon: ImageIcon,
	},
	{
		id: "security",
		label: "Security",
		description: "Invitation domain rules.",
		group: "Security Settings",
		icon: ShieldCheck,
	},
	{
		id: "backups",
		label: "Backups",
		description: "Snapshot schedule.",
		group: "Security Settings",
		icon: DatabaseBackup,
	},
	{ id: "email", label: "Email", description: "Provider and sender.", group: "Email Settings", icon: Mail },
	{
		id: "delivery",
		label: "Email delivery",
		description: "Send a test message.",
		group: "Email Settings",
		icon: Send,
	},
	{
		id: "templates",
		label: "Email templates",
		description: "Override the built-in texts.",
		group: "Email Settings",
		icon: FileText,
	},
] as const;
const GROUPS = ["Site", "Media", "Security Settings", "Email Settings"] as const;

interface TemplateInfo {
	defaults: Record<EmailKind, { subject: string; text: string }>;
	variables: Record<EmailKind, string[]>;
}

/** `posts=0.8, pages=0.5` as a record; entries that are not a number from 0 to 1 are ignored. */
export function parsePriorities(text: string): Record<string, number> {
	const out: Record<string, number> = {};
	for (const part of text.split(",")) {
		const [name, raw] = part.split("=").map((s) => s.trim());
		const n = Number(raw);
		if (name && raw && Number.isFinite(n) && n >= 0 && n <= 1) out[name] = n;
	}
	return out;
}

const EMPTY: Settings = {
	siteName: "Wuppy",
	siteUrl: "",
	description: "",
	logo: "",
	locale: "en",
	timezone: "UTC",
	seo: {
		title: "",
		description: "",
		image: "",
		noindex: false,
		titleTemplate: "{title} | {site}",
		sitemap: { exclude: [], priority: {} },
	},
	social: {},
	email: { from: "", provider: "console", host: "", port: 587, user: "", templates: {} },
	media: { maxBytes: 5 * 1024 * 1024, allowed: IMAGE_TYPES },
	comments: { enabled: true, moderated: true, notifyEmail: "" },
	security: { allowedDomains: [] },
	backup: { enabled: false, intervalHours: 24, keep: 14 },
};

export function SettingsPage() {
	const stored = useStore($data)["settings"] as Settings | undefined;
	const error = useStore($dataErrors)["settings"];
	const [value, setValue] = useState<Settings>(EMPTY);
	const [saving, setSaving] = useState(false);
	const [templateInfo, setTemplateInfo] = useState<TemplateInfo | null>(null);
	const [testTo, setTestTo] = useState("");
	// Raw text, so typing a comma or space is not swallowed by the parsed list.
	const [domainsText, setDomainsText] = useState("");
	const [sitemapExclude, setSitemapExclude] = useState("");
	const [sitemapPriority, setSitemapPriority] = useState("");
	const [activeSection, setActiveSection] = useState<(typeof SECTIONS)[number]["id"]>("general");

	useEffect(() => {
		void loadData<Settings>("settings").catch(() => undefined);
	}, []);
	useEffect(() => {
		void apiData<TemplateInfo>("GET", "/api/email/templates")
			.then(setTemplateInfo)
			.catch(() => undefined);
	}, []);
	useEffect(() => {
		if (stored) {
			setDomainsText((stored.security?.allowedDomains ?? []).join(", "));
			setSitemapExclude((stored.seo?.sitemap?.exclude ?? []).join(", "));
			setSitemapPriority(
				Object.entries(stored.seo?.sitemap?.priority ?? {})
					.map(([k, v]) => `${k}=${v}`)
					.join(", "),
			);
			setValue({
				...EMPTY,
				...stored,
				seo: { ...EMPTY.seo, ...stored.seo, sitemap: { ...EMPTY.seo.sitemap, ...stored.seo?.sitemap } },
				email: { ...EMPTY.email, ...stored.email },
				media: { ...EMPTY.media, ...stored.media },
				comments: { ...EMPTY.comments, ...stored.comments },
				security: { ...EMPTY.security, ...stored.security },
				backup: { ...EMPTY.backup, ...stored.backup },
			});
		}
	}, [stored]);

	const setTemplate = (kind: EmailKind, field: "subject" | "text", text: string) => {
		const current = { ...value.email.templates[kind], [field]: text };
		if (!text) delete current[field];
		const templates = { ...value.email.templates, [kind]: current };
		if (!current.subject && !current.text) delete templates[kind];
		setValue({ ...value, email: { ...value.email, templates } });
	};

	const save = async () => {
		setSaving(true);
		try {
			await saveData("settings", value);
			toast("Settings saved");
		} catch (e) {
			toast((e as Error).message, "error");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="grid gap-4">
			<WorkspaceLayout sidebarWidth={300}>
				<WorkspaceSidebar>
					<div className="border-b border-border px-4 py-3">
						<h1 className="text-base font-semibold">Settings</h1>
						<p className="mt-0.5 text-[11px] text-muted-foreground">Site identity, content and delivery.</p>
					</div>
					<nav className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2" aria-label="Settings sections">
						{GROUPS.map((group) => (
							<div key={group} className="grid gap-0.5 pt-2 first:pt-1">
								<p className="px-2.5 pb-1 text-[11px] font-semibold text-muted-foreground">{group}</p>
								{SECTIONS.filter((section) => section.group === group).map((section) => {
									const Icon = section.icon;
									const active = activeSection === section.id;
									return (
										<button
											key={section.id}
											type="button"
											aria-current={active ? "true" : undefined}
											onClick={() => {
												setActiveSection(section.id);
												document
													.getElementById(`settings-${section.id}`)
													?.scrollIntoView({ behavior: "smooth", block: "start" });
											}}
											className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
												active
													? "bg-tab text-foreground"
													: "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
											}`}
										>
											<span
												className={`grid size-7 shrink-0 place-items-center rounded-md border transition-colors ${
													active
														? "border-border bg-background text-foreground"
														: "border-border/70 bg-background/60 text-muted-foreground group-hover:text-foreground"
												}`}
											>
												<Icon size={14} />
											</span>
											<span className="truncate text-sm font-medium">{section.label}</span>
										</button>
									);
								})}
							</div>
						))}
					</nav>
				</WorkspaceSidebar>
				<WorkspacePanel className="grid-rows-[auto_minmax(0,1fr)]">
					<header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
						<div>
							<h2 className="text-lg font-semibold">
								{SECTIONS.find((section) => section.id === activeSection)?.label}
							</h2>
							<p className="text-xs text-muted-foreground">
								{SECTIONS.find((section) => section.id === activeSection)?.description}
							</p>
						</div>
						<Button onClick={() => void save()} disabled={saving}>
							{saving ? "Saving…" : "Save settings"}
						</Button>
					</header>
					<div className="custom-scrollbar min-h-0 overflow-y-auto">
						<div className="grid gap-4 p-5">
							<ErrorText>{error}</ErrorText>
							<div id="settings-general" className="scroll-mt-4" />
							<Card>
								<CardHeader title="General" />
								<div className="grid gap-3 p-4 md:grid-cols-2">
									<Input
										label="Site name"
										value={value.siteName}
										onChange={(e) => setValue({ ...value, siteName: e.target.value })}
									/>
									<Input
										label="Site URL"
										value={value.siteUrl}
										onChange={(e) => setValue({ ...value, siteUrl: e.target.value })}
									/>
									<Input
										label="Logo URL"
										value={value.logo}
										onChange={(e) => setValue({ ...value, logo: e.target.value })}
									/>
									<Input
										label="Locale"
										value={value.locale}
										onChange={(e) => setValue({ ...value, locale: e.target.value })}
									/>
									<Input
										label="Timezone"
										value={value.timezone}
										onChange={(e) => setValue({ ...value, timezone: e.target.value })}
									/>
									<Textarea
										label="Description"
										value={value.description}
										onChange={(e) => setValue({ ...value, description: e.target.value })}
									/>
								</div>
							</Card>

							<div id="settings-seo" className="scroll-mt-4" />
							<Card>
								<CardHeader title="SEO defaults" />
								<div className="grid gap-3 p-4 md:grid-cols-2">
									<Input
										label="Default title"
										value={value.seo.title}
										onChange={(e) => setValue({ ...value, seo: { ...value.seo, title: e.target.value } })}
									/>
									<Input
										label="Default image"
										value={value.seo.image}
										onChange={(e) => setValue({ ...value, seo: { ...value.seo, image: e.target.value } })}
									/>
									<Textarea
										label="Default description"
										value={value.seo.description}
										onChange={(e) => setValue({ ...value, seo: { ...value.seo, description: e.target.value } })}
									/>
									<Input
										label="Title template"
										hint="{title} is the page title, {site} the site name."
										value={value.seo.titleTemplate}
										onChange={(e) => setValue({ ...value, seo: { ...value.seo, titleTemplate: e.target.value } })}
									/>
									<Input
										label="Sitemap: leave out collections"
										hint="Comma separated collection names."
										value={sitemapExclude}
										onChange={(e) => {
											setSitemapExclude(e.target.value);
											setValue({
												...value,
												seo: {
													...value.seo,
													sitemap: {
														...value.seo.sitemap,
														exclude: e.target.value
															.split(",")
															.map((s) => s.trim())
															.filter(Boolean),
													},
												},
											});
										}}
									/>
									<Input
										label="Sitemap: priority per collection"
										hint="For example posts=0.8, pages=0.5 (0 to 1)."
										value={sitemapPriority}
										onChange={(e) => {
											setSitemapPriority(e.target.value);
											setValue({
												...value,
												seo: {
													...value.seo,
													sitemap: { ...value.seo.sitemap, priority: parsePriorities(e.target.value) },
												},
											});
										}}
									/>
									<Checkbox
										label="Noindex entire site"
										checked={value.seo.noindex}
										onChange={(e) => setValue({ ...value, seo: { ...value.seo, noindex: e.target.checked } })}
									/>
								</div>
							</Card>

							<div id="settings-email" className="scroll-mt-4" />
							<Card>
								<CardHeader title="Email" />
								<div className="grid gap-3 p-4 md:grid-cols-2">
									<Select
										label="Provider"
										value={value.email.provider}
										onChange={(e) =>
											setValue({
												...value,
												email: { ...value.email, provider: e.target.value as "console" | "smtp" | "resend" },
											})
										}
									>
										<option value="console">Console (development)</option>
										<option value="smtp">SMTP</option>
										<option value="resend">Resend (RESEND_API_KEY)</option>
									</Select>
									<Input
										label="From address"
										value={value.email.from}
										onChange={(e) => setValue({ ...value, email: { ...value.email, from: e.target.value } })}
									/>
									<Input
										label="SMTP host"
										value={value.email.host}
										onChange={(e) => setValue({ ...value, email: { ...value.email, host: e.target.value } })}
									/>
									<Input
										label="SMTP port"
										type="number"
										value={value.email.port}
										onChange={(e) => setValue({ ...value, email: { ...value.email, port: Number(e.target.value) } })}
									/>
									<Input
										label="SMTP user"
										value={value.email.user}
										onChange={(e) => setValue({ ...value, email: { ...value.email, user: e.target.value } })}
									/>
								</div>
							</Card>

							<div id="settings-delivery" className="scroll-mt-4" />
							<Card>
								<CardHeader
									title="Email delivery"
									description="Passwords for SMTP/Resend stay in environment variables (SMTP_PASSWORD, RESEND_API_KEY)."
								/>
								<div className="flex flex-wrap items-end gap-2 p-4">
									<Input
										label="Send a test email to"
										type="email"
										value={testTo}
										onChange={(e) => setTestTo(e.target.value)}
									/>
									<Button
										variant="secondary"
										disabled={!testTo.includes("@")}
										onClick={() =>
											void apiData("POST", "/api/email/test", { to: testTo })
												.then(() => toast(`Test email sent to ${testTo}`))
												.catch((e: Error) => toast(e.message, "error"))
										}
									>
										Send test email
									</Button>
									<p className="basis-full text-xs text-muted-foreground">
										Save your settings first; the test uses what is saved.
									</p>
								</div>
							</Card>

							<div id="settings-templates" className="scroll-mt-4" />
							<Card>
								<CardHeader title="Email templates" description="Leave a field empty to use the built-in text." />
								<div className="grid gap-4 p-4">
									{(Object.keys(KIND_LABEL) as EmailKind[]).map((kind) => (
										<fieldset key={kind} className="grid gap-2">
											<legend className="text-sm font-medium">{KIND_LABEL[kind]}</legend>
											<Input
												label={`${KIND_LABEL[kind]} subject`}
												placeholder={templateInfo?.defaults[kind].subject}
												value={value.email.templates[kind]?.subject ?? ""}
												onChange={(e) => setTemplate(kind, "subject", e.target.value)}
											/>
											<Textarea
												label={`${KIND_LABEL[kind]} message`}
												placeholder={templateInfo?.defaults[kind].text}
												value={value.email.templates[kind]?.text ?? ""}
												onChange={(e) => setTemplate(kind, "text", e.target.value)}
												hint={
													templateInfo
														? `Placeholders: ${templateInfo.variables[kind].map((v) => `{{${v}}}`).join(" ")}`
														: undefined
												}
											/>
										</fieldset>
									))}
								</div>
							</Card>

							<div id="settings-media" className="scroll-mt-4" />
							<Card>
								<CardHeader title="Media" />
								<div className="grid gap-3 p-4 md:grid-cols-2">
									<Input
										label="Max upload bytes"
										type="number"
										value={value.media.maxBytes}
										onChange={(e) =>
											setValue({ ...value, media: { ...value.media, maxBytes: Number(e.target.value) } })
										}
										hint="Cannot exceed the built-in 5 MB cap."
									/>
									<fieldset className="grid gap-1">
										<legend className="text-sm font-medium">Allowed image types</legend>
										{IMAGE_TYPES.map((type) => (
											<Checkbox
												key={type}
												label={type}
												checked={value.media.allowed.includes(type)}
												onChange={(e) =>
													setValue({
														...value,
														media: {
															...value.media,
															allowed: e.target.checked
																? [...value.media.allowed, type]
																: value.media.allowed.filter((t) => t !== type),
														},
													})
												}
											/>
										))}
									</fieldset>
								</div>
							</Card>

							<div id="settings-comments" className="scroll-mt-4" />
							<Card>
								<CardHeader title="Comments" />
								<div className="grid gap-3 p-4 md:grid-cols-2">
									<Checkbox
										label="Comments enabled"
										checked={value.comments.enabled}
										onChange={(e) => setValue({ ...value, comments: { ...value.comments, enabled: e.target.checked } })}
									/>
									<Checkbox
										label="Moderate new comments"
										checked={value.comments.moderated}
										onChange={(e) =>
											setValue({ ...value, comments: { ...value.comments, moderated: e.target.checked } })
										}
									/>
									<Input
										label="Email me about new comments"
										type="email"
										value={value.comments.notifyEmail ?? ""}
										onChange={(e) =>
											setValue({ ...value, comments: { ...value.comments, notifyEmail: e.target.value } })
										}
									/>
								</div>
							</Card>

							<div id="settings-social" className="scroll-mt-4" />
							<Card>
								<CardHeader title="Social accounts" description="Handles or URLs your theme can link to." />
								<div className="grid gap-3 p-4 md:grid-cols-2">
									{SOCIALS.map((name) => (
										<Input
											key={name}
											label={name}
											value={value.social[name] ?? ""}
											onChange={(e) => {
												const social = { ...value.social, [name]: e.target.value };
												if (!e.target.value) delete social[name];
												setValue({ ...value, social });
											}}
										/>
									))}
								</div>
							</Card>

							<div id="settings-security" className="scroll-mt-4" />
							<Card>
								<CardHeader title="Security" />
								<div className="p-4">
									<Input
										label="Allowed email domains for invitations"
										placeholder="example.com, example.org"
										value={domainsText}
										onChange={(e) => {
											setDomainsText(e.target.value);
											setValue({
												...value,
												security: {
													allowedDomains: e.target.value
														.split(",")
														.map((d) => d.trim().toLowerCase())
														.filter(Boolean),
												},
											});
										}}
										hint="Empty means any domain can be invited."
									/>
								</div>
							</Card>

							<div id="settings-backups" className="scroll-mt-4" />
							<Card>
								<CardHeader
									title="Backups"
									description="Content snapshots under .wuppy/backups. Schedule changes apply after a restart."
								/>
								<div className="grid gap-3 p-4 md:grid-cols-3">
									<Checkbox
										label="Back up automatically"
										checked={value.backup.enabled}
										onChange={(e) => setValue({ ...value, backup: { ...value.backup, enabled: e.target.checked } })}
									/>
									<Input
										label="Every (hours)"
										type="number"
										min={1}
										value={value.backup.intervalHours}
										onChange={(e) =>
											setValue({ ...value, backup: { ...value.backup, intervalHours: Number(e.target.value) } })
										}
									/>
									<Input
										label="Keep the newest"
										type="number"
										min={1}
										value={value.backup.keep}
										onChange={(e) => setValue({ ...value, backup: { ...value.backup, keep: Number(e.target.value) } })}
									/>
								</div>
							</Card>
						</div>
					</div>
				</WorkspacePanel>
			</WorkspaceLayout>
		</div>
	);
}
