import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	base: "/admin/",
	plugins: [react(), tailwindcss()],
	build: { outDir: "dist", sourcemap: true },
	server: { proxy: { "/api": "http://localhost:4321" } },
	test: { environment: "jsdom", setupFiles: ["tests/setup.ts"], include: ["tests/**/*.test.{ts,tsx}"] },
});
