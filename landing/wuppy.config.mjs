// wuppycms.com runs on WuppyCMS: the landing copy is edited at /admin (Pages → Landing).
export default {
	site: { url: "https://wuppycms.com", name: "WuppyCMS" },
	locales: ["en"],
	// `en` is served at `/`, so the admin's "View" link for it lands on the home page.
	redirects: [{ from: "/en", to: "/" }],
	collections: [
		{
			name: "landing",
			kind: "pages",
			dir: "content/landing",
			format: "md",
			route: "/{slug}",
			fields: {
				title: "string",
				description: "text",
				eyebrow: "string",
				headline: "string",
				lead: "text",
				featuresTitle: "string",
				features: { type: "repeater", max: 12, fields: { title: "string", text: "text" } },
				howTitle: "string",
				steps: { type: "repeater", max: 6, fields: { title: "string", code: "string", text: "text" } },
				ctaTitle: "string",
				ctaText: "text",
				footer: "string",
			},
		},
	],
};
