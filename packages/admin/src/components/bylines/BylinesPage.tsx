import { ResourcePage } from "../shared/ResourcePage.tsx";

export function BylinesPage() {
	return (
		<ResourcePage
			name="bylines"
			title="Bylines"
			description="Author profiles and credits."
			itemLabel="byline"
			template={{ slug: "", name: "", bio: "", avatar: "", email: "", website: "", credits: [] }}
			columns={[
				{ key: "name", label: "Name" },
				{ key: "slug", label: "Slug" },
				{ key: "email", label: "Email" },
			]}
			fields={[
				{ key: "slug", label: "Slug" },
				{ key: "name", label: "Name" },
				{ key: "bio", label: "Bio", type: "textarea" },
				{ key: "avatar", label: "Avatar URL" },
				{ key: "email", label: "Email" },
				{ key: "website", label: "Website" },
				{ key: "credits", label: "Credits (JSON)", type: "json" },
			]}
		/>
	);
}
