import { ResourcePage } from "../shared/ResourcePage.tsx";

export function WidgetsPage() {
	return (
		<ResourcePage
			name="widgets"
			title="Widgets"
			description="Reusable blocks for sidebars and footers."
			itemLabel="widget area"
			template={{ name: "", label: "", widgets: [] }}
			columns={[
				{ key: "label", label: "Label" },
				{ key: "name", label: "Key" },
				{ key: "widgets", label: "Widgets" },
			]}
			fields={[
				{ key: "name", label: "Key" },
				{ key: "label", label: "Label" },
				{ key: "widgets", label: "Widgets (JSON)", type: "json" },
			]}
		/>
	);
}
