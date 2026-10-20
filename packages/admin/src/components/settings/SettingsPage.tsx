import { useStore } from "@nanostores/react";
import { useEffect, useState } from "react";
import { $data, $dataErrors, loadData, saveData } from "../../stores/dashboard.ts";
import { Button, Card, CardHeader, Checkbox, ErrorText, Input, PageHeader, Select, Textarea, toast } from "../../ui/index.tsx";

interface Settings {
	siteName: string;
	siteUrl: string;
	description: string;
	logo: string;
	locale: string;
	timezone: string;
	seo: { title: string; description: string; image: string; noindex: boolean };
	social: Record<string, string>;
	email: { from: string; provider: "console" | "smtp" | "resend"; host: string; port: number; user: string };
	media: { maxBytes: number; allowed: string[] };
	comments: { enabled: boolean; moderated: boolean };
}

const EMPTY: Settings = {
	siteName: "Wuppy",
	siteUrl: "",
	description: "",
	logo: "",
	locale: "en",
	timezone: "UTC",
	seo: { title: "", description: "", image: "", noindex: false },
	social: {},
	email: { from: "", provider: "console", host: "", port: 587, user: "" },
	media: { maxBytes: 5 * 1024 * 1024, allowed: [] },
	comments: { enabled: true, moderated: true },
};

export function SettingsPage() {
	const stored = useStore($data)["settings"] as Settings | undefined;
	const error = useStore($dataErrors)["settings"];
	const [value, setValue] = useState<Settings>(EMPTY);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		void loadData<Settings>("settings").catch(() => undefined);
	}, []);
	useEffect(() => {
		if (stored) setValue({ ...EMPTY, ...stored, seo: { ...EMPTY.seo, ...stored.seo } });
	}, [stored]);

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
			<PageHeader
				title="Settings"
				description="Site identity, SEO, email, media and comments."
				actions={
					<Button onClick={() => void save()} disabled={saving}>
						{saving ? "Saving…" : "Save settings"}
					</Button>
				}
			/>
			<ErrorText>{error}</ErrorText>

			<Card>
				<CardHeader title="General" />
				<div className="grid gap-3 p-4 md:grid-cols-2">
					<Input label="Site name" value={value.siteName} onChange={(e) => setValue({ ...value, siteName: e.target.value })} />
					<Input label="Site URL" value={value.siteUrl} onChange={(e) => setValue({ ...value, siteUrl: e.target.value })} />
					<Input label="Logo URL" value={value.logo} onChange={(e) => setValue({ ...value, logo: e.target.value })} />
					<Input label="Locale" value={value.locale} onChange={(e) => setValue({ ...value, locale: e.target.value })} />
					<Input label="Timezone" value={value.timezone} onChange={(e) => setValue({ ...value, timezone: e.target.value })} />
					<Textarea
						label="Description"
						value={value.description}
						onChange={(e) => setValue({ ...value, description: e.target.value })}
					/>
				</div>
			</Card>

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
					<Checkbox
						label="Noindex entire site"
						checked={value.seo.noindex}
						onChange={(e) => setValue({ ...value, seo: { ...value.seo, noindex: e.target.checked } })}
					/>
				</div>
			</Card>

			<Card>
				<CardHeader title="Email" />
				<div className="grid gap-3 p-4 md:grid-cols-2">
					<Select
						label="Provider"
						value={value.email.provider}
						onChange={(e) =>
							setValue({ ...value, email: { ...value.email, provider: e.target.value as "console" | "smtp" | "resend" } })
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

			<Card>
				<CardHeader title="Media and comments" />
				<div className="grid gap-3 p-4 md:grid-cols-2">
					<Input
						label="Max upload bytes"
						type="number"
						value={value.media.maxBytes}
						onChange={(e) => setValue({ ...value, media: { ...value.media, maxBytes: Number(e.target.value) } })}
					/>
					<Checkbox
						label="Comments enabled"
						checked={value.comments.enabled}
						onChange={(e) => setValue({ ...value, comments: { ...value.comments, enabled: e.target.checked } })}
					/>
					<Checkbox
						label="Moderate new comments"
						checked={value.comments.moderated}
						onChange={(e) => setValue({ ...value, comments: { ...value.comments, moderated: e.target.checked } })}
					/>
				</div>
			</Card>
		</div>
	);
}
