import { ResourcePage } from "../shared/ResourcePage.tsx";

export function ThemesPage() {
	return (
		<ResourcePage
			name="themes"
			title="Themes"
			description="Installed themes. Activate one at a time."
			itemLabel="theme"
			template={{ id: "", name: "", version: "0.0.0", active: false }}
			columns={[
				{ key: "name", label: "Name" },
				{ key: "id", label: "ID" },
				{ key: "version", label: "Version" },
				{ key: "active", label: "Active" },
			]}
			fields={[
				{ key: "id", label: "ID" },
				{ key: "name", label: "Name" },
				{ key: "version", label: "Version" },
				{ key: "active", label: "Active", type: "checkbox" },
			]}
		/>
	);
}
