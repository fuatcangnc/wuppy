import { describe, expect, it } from "vitest";
import { resolveOAuthProviders } from "../../src/config/oauth.ts";

const env = (values: Record<string, string>): NodeJS.ProcessEnv => values as NodeJS.ProcessEnv;

describe("OAuth provider configuration", () => {
	it("enables nothing without credentials", () => {
		expect(resolveOAuthProviders(env({}))).toEqual({ socialProviders: {}, enabled: [] });
	});

	it("enables fully configured providers and preserves Microsoft tenant", () => {
		expect(
			resolveOAuthProviders(
				env({
					GITHUB_CLIENT_ID: "gh-id",
					GITHUB_CLIENT_SECRET: "gh-secret",
					GOOGLE_CLIENT_ID: "google-id",
					GOOGLE_CLIENT_SECRET: "google-secret",
					GOOGLE_HOSTED_DOMAIN: "example.com",
					MICROSOFT_CLIENT_ID: "ms-id",
					MICROSOFT_CLIENT_SECRET: "ms-secret",
					MICROSOFT_TENANT_ID: "tenant-1",
				}),
			),
		).toEqual({
			socialProviders: {
				github: { clientId: "gh-id", clientSecret: "gh-secret" },
				google: { clientId: "google-id", clientSecret: "google-secret", hd: "example.com" },
				microsoft: { clientId: "ms-id", clientSecret: "ms-secret", tenantId: "tenant-1" },
			},
			enabled: ["github", "google", "microsoft"],
		});
	});

	it("defaults the Microsoft tenant to common", () => {
		expect(
			resolveOAuthProviders(env({ MICROSOFT_CLIENT_ID: "ms-id", MICROSOFT_CLIENT_SECRET: "ms-secret" })).socialProviders
				.microsoft,
		).toEqual({ clientId: "ms-id", clientSecret: "ms-secret", tenantId: "common" });
	});

	it("rejects a partial credential pair instead of silently disabling it", () => {
		expect(() => resolveOAuthProviders(env({ GITHUB_CLIENT_ID: "gh-id" }))).toThrow(
			"Set both GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET",
		);
		expect(() => resolveOAuthProviders(env({ GOOGLE_CLIENT_SECRET: "google-secret" }))).toThrow(
			"Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET",
		);
		expect(() => resolveOAuthProviders(env({ GOOGLE_HOSTED_DOMAIN: "example.com" }))).toThrow(
			"GOOGLE_HOSTED_DOMAIN requires",
		);
	});
});
