import { ResourcePage } from "../shared/ResourcePage.tsx";

export function TaxonomiesPage() {
	return (
		<ResourcePage
			name="taxonomies"
			title="Categories and tags"
			description="Term groups used by collections."
			itemLabel="taxonomy"
			template={{ name: "", label: "", hierarchical: false, collections: [], terms: [] }}
			columns={[
				{ key: "label", label: "Label" },
				{ key: "name", label: "Key" },
				{ key: "hierarchical", label: "Hierarchical" },
				{ key: "terms", label: "Terms" },
			]}
			fields={[
				{ key: "name", label: "Key" },
				{ key: "label", label: "Label" },
				{ key: "hierarchical", label: "Hierarchical", type: "checkbox" },
				{ key: "collections", label: "Collections (JSON)", type: "json" },
				{ key: "terms", label: "Terms (JSON)", type: "json" },
			]}
		/>
	);
}
