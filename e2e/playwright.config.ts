import { defineConfig } from "@playwright/test";

const launchOptions = { executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium" };

export default defineConfig({
	workers: 1,
	projects: [
		{ name: "built", testDir: "tests", use: { baseURL: "http://127.0.0.1:4444", launchOptions } },
		{ name: "dev", testDir: "tests-dev", use: { baseURL: "http://127.0.0.1:4555", launchOptions } },
	],
	webServer: [
		{
			command: "node utils/start-fixture.mjs",
			url: "http://127.0.0.1:4444/admin/",
			reuseExistingServer: false,
			timeout: 60_000,
		},
		{
			command: "node utils/start-fixture.mjs dev",
			url: "http://127.0.0.1:4555/admin/",
			reuseExistingServer: false,
			timeout: 90_000,
		},
	],
});
