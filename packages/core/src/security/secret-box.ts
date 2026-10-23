import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const VERSION = "v1";
const key = (secret: string, info: string) => Buffer.from(hkdfSync("sha256", secret, "wuppy-secret-box", info, 32));

/**
 * AES-256-GCM with a key derived from `secret` (HKDF, per-purpose `info`).
 * `aad` binds the ciphertext to its owner (e.g. a site id) so rows cannot be swapped.
 */
export function seal(secret: string, plaintext: string, aad: string, info = "wuppy-sites-v1"): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key(secret, info), iv);
	cipher.setAAD(Buffer.from(aad));
	const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	return [VERSION, iv, cipher.getAuthTag(), data]
		.map((p) => (typeof p === "string" ? p : p.toString("base64url")))
		.join(".");
}

/** The plaintext, or null when the box was tampered with, sealed for another owner or under another secret. */
export function open(secret: string, sealed: string, aad: string, info = "wuppy-sites-v1"): string | null {
	const [version, iv, tag, data] = sealed.split(".");
	if (version !== VERSION || !iv || !tag || data === undefined) return null;
	try {
		const decipher = createDecipheriv("aes-256-gcm", key(secret, info), Buffer.from(iv, "base64url"));
		decipher.setAAD(Buffer.from(aad));
		decipher.setAuthTag(Buffer.from(tag, "base64url"));
		return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
	} catch {
		return null;
	}
}
