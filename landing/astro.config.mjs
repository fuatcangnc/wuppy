import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import wuppycms from "wuppycms/astro";

// The public address is set only here (LANDING_SITE), like DOCS_SITE for the docs.
// wuppycms.com runs on WuppyCMS itself: the copy lives in content/landing and is edited at /admin.
export default defineConfig({
	site: process.env.LANDING_SITE ?? "https://wuppycms.com",
	output: "server",
	adapter: node({ mode: "standalone" }),
	integrations: [wuppycms()],
	vite: { plugins: [tailwindcss()] },
});
