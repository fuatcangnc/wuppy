import { ResourcePage } from "../shared/ResourcePage.tsx";

export function SectionsPage() {
	return (
		<ResourcePage
			name="sections"
			title="Sections"
			description="Reusable content sections referenced from entries."
			itemLabel="section"
			template={{ slug: "", title: "", body: "", draft: false }}
			columns={[
				{ key: "title", label: "Title" },
				{ key: "slug", label: "Slug" },
				{ key: "draft", label: "Draft" },
			]}
			fields={[
				{ key: "slug", label: "Slug" },
				{ key: "title", label: "Title" },
				{ key: "body", label: "Body", type: "textarea" },
				{ key: "draft", label: "Draft", type: "checkbox" },
			]}
		/>
	);
}
