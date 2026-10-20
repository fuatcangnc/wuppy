import type { SocialProviderId, SocialProvidersConfig } from "@wuppy/auth";

export interface OAuthConfig {
	socialProviders: SocialProvidersConfig;
	enabled: SocialProviderId[];
}

const pair = (env: NodeJS.ProcessEnv, id: "GITHUB" | "GOOGLE" | "MICROSOFT") => {
	const clientId = env[`${id}_CLIENT_ID`]?.trim();
	const clientSecret = env[`${id}_CLIENT_SECRET`]?.trim();
	if (!!clientId !== !!clientSecret) {
		throw new Error(`Set both ${id}_CLIENT_ID and ${id}_CLIENT_SECRET, or neither.`);
	}
	return clientId && clientSecret ? { clientId, clientSecret } : null;
};

/** Reads OAuth credentials from the environment. Partial pairs fail startup. */
export function resolveOAuthProviders(env: NodeJS.ProcessEnv = process.env): OAuthConfig {
	const socialProviders: SocialProvidersConfig = {};
	const enabled: SocialProviderId[] = [];

	const github = pair(env, "GITHUB");
	if (github) {
		socialProviders.github = github;
		enabled.push("github");
	}

	const google = pair(env, "GOOGLE");
	const googleHostedDomain = env.GOOGLE_HOSTED_DOMAIN?.trim();
	if (googleHostedDomain && !google) {
		throw new Error("GOOGLE_HOSTED_DOMAIN requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
	}
	if (google) {
		socialProviders.google = { ...google, ...(googleHostedDomain ? { hd: googleHostedDomain } : {}) };
		enabled.push("google");
	}

	const microsoft = pair(env, "MICROSOFT");
	if (microsoft) {
		const tenantId = env.MICROSOFT_TENANT_ID?.trim() || "common";
		socialProviders.microsoft = { ...microsoft, tenantId };
		enabled.push("microsoft");
	}

	return { socialProviders, enabled };
}
