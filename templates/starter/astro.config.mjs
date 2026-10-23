import mdx from "@astrojs/mdx";
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import wuppy from "wuppy/astro";

export default defineConfig({
	output: "server",
	adapter: node({ mode: "standalone" }),
	integrations: [mdx(), wuppy()],
	vite: { plugins: [tailwindcss()] },
});
