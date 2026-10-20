import { ResourcePage } from "../shared/ResourcePage.tsx";

export function WebhooksPage() {
	return (
		<ResourcePage
			name="webhooks"
			title="Webhooks"
			description="Signed POST requests when content or media changes."
			itemLabel="webhook"
			template={{ url: "https://example.com/hook", secret: "", events: [] }}
			columns={[
				{ key: "url", label: "URL" },
				{ key: "events", label: "Events" },
			]}
			fields={[
				{ key: "url", label: "Endpoint URL" },
				{ key: "secret", label: "Signing secret (8+ chars)" },
				{ key: "events", label: "Events (JSON, empty = all)", type: "json" },
			]}
		/>
	);
}
