import { useEffect, useState } from "react";
import { apiData } from "../../lib/api.ts";
import { ResourcePage } from "../shared/ResourcePage.tsx";

type Usage = Record<string, Array<{ collection: string; slug: string }>>;

export function SectionsPage() {
	const [usage, setUsage] = useState<Usage>({});
	useEffect(() => {
		void apiData<Usage>("GET", "/api/sections/usage")
			.then(setUsage)
			.catch(() => undefined);
	}, []);
	const where = (slug: unknown) => (usage[String(slug)] ?? []).map((u) => `${u.collection}/${u.slug}`);

	return (
		<ResourcePage
			name="sections"
			title="Sections"
			description="Reusable content sections. Entries pick them with a `section` field."
			itemLabel="section"
			template={{ slug: "", title: "", body: "", draft: false, locale: "" }}
			columns={[
				{ key: "title", label: "Title" },
				{ key: "slug", label: "Slug" },
				{ key: "draft", label: "Draft" },
			]}
			extraColumn={{ label: "Used in", value: (s) => `${where(s.slug).length} entries` }}
			deleteNote={(s) => {
				const list = where(s.slug);
				return list.length
					? `Still used by ${list.length} entries: ${list.slice(0, 5).join(", ")}${list.length > 5 ? "…" : ""}`
					: undefined;
			}}
			fields={[
				{ key: "slug", label: "Slug" },
				{ key: "title", label: "Title" },
				{ key: "body", label: "Body", type: "textarea" },
				{ key: "locale", label: "Locale (empty = every language)" },
				{ key: "draft", label: "Draft", type: "checkbox" },
			]}
		/>
	);
}
