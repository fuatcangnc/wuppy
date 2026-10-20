import { ResourcePage } from "../shared/ResourcePage.tsx";

export function ContentTypesPage() {
	return (
		<ResourcePage
			name="content-types"
			title="Content types"
			description="Collections and their fields. Changes apply after the server restarts."
			itemLabel="content type"
			template={{ name: "", dir: "content/", format: "md", route: "/{slug}", fields: {} }}
			columns={[
				{ key: "name", label: "Name" },
				{ key: "dir", label: "Directory" },
				{ key: "format", label: "Format" },
				{ key: "route", label: "Route" },
			]}
			fields={[
				{ key: "name", label: "Name" },
				{ key: "dir", label: "Directory" },
				{ key: "format", label: "Format (md/mdx)" },
				{ key: "route", label: "Route template" },
				{ key: "fields", label: "Fields (JSON)", type: "json" },
			]}
		/>
	);
}
