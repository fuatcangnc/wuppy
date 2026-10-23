import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

// The one place the public address lives: set DOCS_SITE when the docs move to the wuppy domain.
const site = process.env.DOCS_SITE ?? "https://docs.cigce.com.tr";

const group = (label, tr, directory) => ({ label, translations: { tr }, items: [{ autogenerate: { directory } }] });

export default defineConfig({
	site,
	integrations: [
		starlight({
			title: "Wuppy",
			description: "A file-based, Git-backed CMS for Astro.",
			defaultLocale: "root",
			locales: {
				root: { label: "English", lang: "en" },
				tr: { label: "Türkçe", lang: "tr" },
			},
			lastUpdated: false,
			sidebar: [
				{ label: "Getting started", translations: { tr: "Başlarken" }, slug: "getting-started" },
				group("Concepts", "Kavramlar", "concepts"),
				group("Using the admin", "Yönetim paneli", "guides"),
				group("Managed sites", "Çoklu site yönetimi", "sites"),
				group("AI and automation", "Yapay zekâ ve otomasyon", "ai"),
				group("Plugins", "Eklentiler", "plugins"),
				group("Deployment", "Yayına alma", "deployment"),
				group("Reference", "Başvuru", "reference"),
			],
		}),
	],
});
