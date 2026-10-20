import node from "@astrojs/node";
import { defineConfig } from "astro/config";
import wuppy from "wuppy/astro";

export default defineConfig({
	output: "server",
	adapter: node({ mode: "standalone" }),
	integrations: [wuppy()],
});
