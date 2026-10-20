import { ResourcePage } from "../shared/ResourcePage.tsx";
import { MenuItemsEditor } from "./MenuItemsEditor.tsx";
import type { MenuItem } from "./tree.ts";

export function MenusPage() {
	return (
		<ResourcePage
			name="menus"
			title="Menus"
			description="Navigation groups rendered by the site theme. A language variant replaces the menu of the same key."
			itemLabel="menu"
			template={{ name: "", label: "", location: "header", locale: "", items: [] }}
			columns={[
				{ key: "label", label: "Label" },
				{ key: "name", label: "Key" },
				{ key: "location", label: "Location" },
				{ key: "locale", label: "Language" },
			]}
			fields={[
				{ key: "name", label: "Key (a-z, 0-9, -)" },
				{ key: "label", label: "Label" },
				{ key: "location", label: "Location (header, footer, sidebar)" },
				{ key: "locale", label: "Language (empty = every language)" },
				{
					key: "items",
					label: "Links",
					type: "custom",
					render: (value, onChange) => (
						<MenuItemsEditor items={Array.isArray(value) ? (value as MenuItem[]) : []} onChange={onChange} />
					),
				},
			]}
		/>
	);
}
