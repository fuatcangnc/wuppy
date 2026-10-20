export default {
	site: { url: "http://127.0.0.1:4444", name: "Wuppy Starter" },
	locales: ["en"],
	redirects: [{ from: "/old-hello", to: "/posts/hello" }],
	collections: [
		{
			name: "posts",
			dir: "content/posts",
			route: "/posts/{slug}",
			fields: {
				title: "string",
				date: "date",
				draft: "boolean",
				publishAt: "date",
				tags: "list",
				author: "byline",
				categories: { type: "taxonomy", taxonomy: "categories", multiple: true },
				cover: "image",
				seoTitle: "string",
				seoDescription: "text",
				canonical: "string",
				noindex: "boolean",
			},
		},
		{
			name: "pages",
			dir: "content/pages",
			route: "/{slug}",
			fields: {
				title: "string",
				draft: "boolean",
				seoTitle: "string",
				seoDescription: "text",
				canonical: "string",
				noindex: "boolean",
			},
		},
	],
};
