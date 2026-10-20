import { ResourcePage } from "../shared/ResourcePage.tsx";

export function BylineSchemaPage() {
	return (
		<ResourcePage
			name="byline-schema"
			title="Byline schema"
			description="Extra fields stored on every byline."
			itemLabel="field"
			template={{ name: "", label: "", type: "string", required: false, order: 0 }}
			columns={[
				{ key: "label", label: "Label" },
				{ key: "name", label: "Key" },
				{ key: "type", label: "Type" },
				{ key: "required", label: "Required" },
				{ key: "order", label: "Order" },
			]}
			fields={[
				{ key: "name", label: "Key" },
				{ key: "label", label: "Label" },
				{ key: "type", label: "Type (string/text/image/url)" },
				{ key: "required", label: "Required", type: "checkbox" },
				{ key: "order", label: "Order", type: "number" },
			]}
		/>
	);
}
