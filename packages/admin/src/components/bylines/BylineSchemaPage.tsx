import { ResourcePage } from "../shared/ResourcePage.tsx";

export function BylineSchemaPage() {
	return (
		<ResourcePage
			name="byline-schema"
			title="Byline schema"
			description="Extra fields stored on every byline."
			itemLabel="field"
			template={{ name: "", label: "", type: "string", required: false }}
			columns={[
				{ key: "label", label: "Label" },
				{ key: "name", label: "Key" },
				{ key: "type", label: "Type" },
				{ key: "required", label: "Required" },
			]}
			fields={[
				{ key: "name", label: "Key" },
				{ key: "label", label: "Label" },
				{ key: "type", label: "Type (string/text/image/url)" },
				{ key: "required", label: "Required", type: "checkbox" },
			]}
		/>
	);
}
