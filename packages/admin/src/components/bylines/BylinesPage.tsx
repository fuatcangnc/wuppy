import { useEffect, useState } from "react";
import { UserRound } from "@react-zero-ui/icon-sprite";
import { apiData } from "../../lib/api.ts";
import { ResourceWorkspacePage, type ResourceField } from "../shared/ResourceWorkspacePage.tsx";

interface SchemaField {
	name: string;
	label: string;
	type: "string" | "text" | "image" | "url";
	required: boolean;
	order: number;
}

export function BylinesPage() {
	const [schema, setSchema] = useState<SchemaField[]>([]);
	const [issues, setIssues] = useState<Array<{ slug: string; message: string }>>([]);
	useEffect(() => {
		void apiData<SchemaField[]>("GET", "/api/data/byline-schema")
			.then(setSchema)
			.catch(() => undefined);
		void apiData<typeof issues>("GET", "/api/bylines/issues")
			.then(setIssues)
			.catch(() => undefined);
	}, []);
	const custom: ResourceField[] = schema
		.toSorted((a, b) => a.order - b.order)
		.map((f) => ({
			key: `extra.${f.name}`,
			label: f.label + (f.required ? " *" : ""),
			type: f.type === "text" ? "textarea" : "text",
		}));

	return (
		<ResourceWorkspacePage
			notice={
				issues.length > 0 ? (
					<p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">
						{issues.length} byline value(s) break the byline schema:{" "}
						{issues.map((i) => `${i.slug}: ${i.message}`).join("; ")}
					</p>
				) : undefined
			}
			icon={<UserRound size="1em" />}
			name="bylines"
			title="Bylines"
			description="Author profiles. Credits are the roles a person can hold (author, editor, photographer)."
			itemLabel="byline"
			template={{
				slug: "",
				name: "",
				bio: "",
				avatar: "",
				email: "",
				website: "",
				credits: [],
				extra: {},
				translations: {},
			}}
			columns={[
				{ key: "name", label: "Name" },
				{ key: "slug", label: "Slug" },
				{ key: "email", label: "Email" },
			]}
			fields={[
				{ key: "slug", label: "Slug" },
				{ key: "name", label: "Name" },
				{ key: "bio", label: "Bio", type: "textarea" },
				{ key: "avatar", label: "Avatar URL" },
				{ key: "email", label: "Email (private)" },
				{ key: "website", label: "Website" },
				{ key: "credits", label: "Credit roles (JSON)", type: "json" },
				...custom,
				{ key: "translations", label: 'Translations (JSON) {"tr": {"name": "…", "bio": "…"}}', type: "json" },
			]}
		/>
	);
}
