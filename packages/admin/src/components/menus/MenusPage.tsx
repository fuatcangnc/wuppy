import { ResourcePage } from "../shared/ResourcePage.tsx";

export function MenusPage() {
	return (
		<ResourcePage
			name="menus"
			title="Menus"
			description="Navigation groups rendered by the site theme."
			itemLabel="menu"
			template={{ name: "", label: "", location: "header", items: [] }}
			columns={[
				{ key: "label", label: "Label" },
				{ key: "name", label: "Key" },
				{ key: "location", label: "Location" },
			]}
			fields={[
				{ key: "name", label: "Key (a-z, 0-9, -)" },
				{ key: "label", label: "Label" },
				{ key: "location", label: "Location" },
				{ key: "items", label: "Items (JSON)", type: "json" },
			]}
		/>
	);
}
