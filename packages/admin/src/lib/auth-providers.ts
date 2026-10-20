export const socialProviderLabels: Record<string, string> = {
	github: "GitHub",
	google: "Google",
	microsoft: "Microsoft",
};

export const socialProviderLabel = (provider: string): string => socialProviderLabels[provider] ?? provider;
