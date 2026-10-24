import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// The public address is set only here (LANDING_SITE), like DOCS_SITE for the docs.
export default defineConfig({
	site: process.env.LANDING_SITE ?? "https://wuppycms.com",
	vite: { plugins: [tailwindcss()] },
});
