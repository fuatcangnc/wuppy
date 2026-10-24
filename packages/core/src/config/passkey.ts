import type { AuthOptions } from "@wuppycms/auth";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * WebAuthn identifies a site by RP ID, not by URL. IP literals are not valid
 * RP IDs, so local development must use the `localhost` spelling. Production
 * normally uses the hostname from WUPPY_URL; both values can be overridden for
 * proxies or custom admin origins.
 */
export function resolvePasskeyOptions(baseURL: string, siteName: string): NonNullable<AuthOptions["passkey"]> {
	const hostname = new URL(baseURL).hostname;
	const configuredRpID = process.env.WUPPY_PASSKEY_RP_ID?.trim();
	const configuredOrigin = process.env.WUPPY_PASSKEY_ORIGIN?.trim();
	const rpID = configuredRpID || (LOOPBACK.has(hostname) ? "localhost" : hostname);
	const origins = configuredOrigin
		? configuredOrigin
				.split(",")
				.map((value) => value.trim())
				.filter(Boolean)
		: [];
	return {
		rpID,
		rpName: siteName,
		...(origins.length === 0 ? {} : { origin: origins.length === 1 ? origins[0] : origins }),
	};
}
