import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const spriteFile = fileURLToPath(new URL("./public/icons.svg", import.meta.url));
let spriteVersion = "dev";
try {
	spriteVersion = createHash("sha256").update(readFileSync(spriteFile)).digest("hex").slice(0, 10);
} catch {
	// The prebuild step writes icons.svg; a missing file only affects the path version.
}
const spritePath = `/icons.svg?v=${spriteVersion}`;

/**
 * The icon package uses a stable `/icons.svg` URL. Version it with the sprite
 * content so a browser that cached an older sprite immediately requests the
 * new one after a deploy, without requiring a hard refresh.
 */
const versionIconSprite: Plugin = {
	name: "version-icon-sprite",
	enforce: "pre",
	transform(code, id) {
		if (!id.includes("@react-zero-ui/icon-sprite") || !id.endsWith("/sprite-contract.js")) return;
		return {
			code: code.replace('export const SPRITE_PATH = "/icons.svg";', `export const SPRITE_PATH = "${spritePath}";`),
			map: null,
		};
	},
};

export default defineConfig({
	base: "/admin/",
	plugins: [versionIconSprite, react(), tailwindcss()],
	build: { outDir: "dist", sourcemap: true },
	server: { proxy: { "/api": "http://localhost:4321" } },
	test: { environment: "jsdom", setupFiles: ["tests/setup.ts"], include: ["tests/**/*.test.{ts,tsx}"] },
});
