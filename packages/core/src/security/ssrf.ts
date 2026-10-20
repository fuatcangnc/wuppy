import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class UnsafeUrlError extends Error {}

/** Loopback, private, link-local (cloud metadata), CGNAT, multicast and unspecified addresses. */
export function isPrivateAddress(ip: string): boolean {
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
	if (mapped) return isPrivateAddress(mapped[1]!);
	if (isIP(ip) === 4) {
		const [a, b] = ip.split(".").map(Number) as [number, number];
		return (
			a === 0 ||
			a === 10 ||
			a === 127 ||
			a >= 224 ||
			(a === 100 && b >= 64 && b <= 127) ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168)
		);
	}
	const v6 = ip.toLowerCase();
	return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith("ff");
}

type Resolver = (host: string) => Promise<string[]>;
const resolveAll: Resolver = async (host) => (await lookup(host, { all: true })).map((r) => r.address);

/**
 * Throws unless `url` is http(s) and every address its host resolves to is public.
 * shortcut: resolving here and again inside fetch leaves a DNS-rebinding window; pin the address with a custom dispatcher if the URL is attacker-chosen.
 */
export async function assertPublicUrl(url: string, resolve: Resolver = resolveAll): Promise<URL> {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new UnsafeUrlError("Invalid URL");
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
		throw new UnsafeUrlError("Only http(s) URLs are allowed");
	if (parsed.username || parsed.password) throw new UnsafeUrlError("Credentials in URLs are not allowed");
	const host = parsed.hostname.replace(/^\[|\]$/g, "");
	const addresses = isIP(host) ? [host] : await resolve(host);
	if (addresses.length === 0 || addresses.some(isPrivateAddress))
		throw new UnsafeUrlError("URL points to a private address");
	return parsed;
}

/** GET a public URL with no redirects, a timeout and a hard byte cap. */
export async function fetchPublic(
	url: string,
	{
		maxBytes = 10 * 1024 * 1024,
		timeoutMs = 10_000,
		resolve,
	}: { maxBytes?: number; timeoutMs?: number; resolve?: Resolver } = {},
): Promise<{ bytes: Uint8Array; contentType: string }> {
	const parsed = await assertPublicUrl(url, resolve);
	const res = await fetch(parsed, { redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
	if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
	const chunks: Uint8Array[] = [];
	let size = 0;
	for await (const chunk of res.body) {
		size += chunk.byteLength;
		if (size > maxBytes) throw new Error("Download exceeds the size limit");
		chunks.push(chunk);
	}
	return { bytes: Buffer.concat(chunks), contentType: res.headers.get("content-type") ?? "" };
}
