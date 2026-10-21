import { Blocks } from "@react-zero-ui/icon-sprite";
import { ResourceWorkspacePage } from "../shared/ResourceWorkspacePage.tsx";
import { WidgetListEditor, type Widget } from "./WidgetListEditor.tsx";

export function WidgetsPage() {
	return (
		<ResourceWorkspacePage
			name="widgets"
			title="Widgets"
			description="Reusable blocks for sidebars and footers."
			itemLabel="widget area"
			template={{ name: "", label: "", description: "", widgets: [] }}
			icon={<Blocks size="1em" />}
			columns={[
				{ key: "label", label: "Label" },
				{ key: "name", label: "Key" },
				{ key: "widgets", label: "Widgets" },
			]}
			fields={[
				{ key: "name", label: "Key" },
				{ key: "label", label: "Label" },
				{ key: "description", label: "Description" },
				{
					key: "widgets",
					label: "Widgets",
					type: "custom",
					render: (value, onChange) => (
						<WidgetListEditor
							widgets={((Array.isArray(value) ? value : []) as Widget[]).map((w) => ({
								...w,
								locales: w.locales ?? [],
								collections: w.collections ?? [],
								paths: w.paths ?? [],
							}))}
							onChange={onChange}
						/>
					),
				},
			]}
		/>
	);
}
