import { BlockList, isIP } from "node:net";

export interface ClientIPInput {
	/** Immediate peer address reported by the runtime (Astro `clientAddress`). */
	peer?: string;
	/** Forwarded chain, only consulted when the peer is a configured trusted proxy. */
	forwarded?: string | null;
	trustedProxies?: readonly string[];
}

const familyOf = (ip: string): "ipv4" | "ipv6" | null => {
	const version = isIP(ip);
	return version === 4 ? "ipv4" : version === 6 ? "ipv6" : null;
};

/** Builds a matcher for exact proxy IPs and CIDR ranges; malformed entries are ignored. */
function proxyList(entries: readonly string[]): BlockList | null {
	const list = new BlockList();
	let added = 0;
	for (const entry of entries) {
		const trimmed = entry.trim();
		if (!trimmed) continue;
		const slash = trimmed.lastIndexOf("/");
		const address = slash === -1 ? trimmed : trimmed.slice(0, slash);
		const family = familyOf(address);
		if (!family) continue;
		if (slash === -1) {
			list.addAddress(address, family);
			added++;
			continue;
		}
		const prefix = Number(trimmed.slice(slash + 1));
		const max = family === "ipv4" ? 32 : 128;
		if (!Number.isInteger(prefix) || prefix < 0 || prefix > max) continue;
		list.addSubnet(address, prefix, family);
		added++;
	}
	return added > 0 ? list : null;
}

/**
 * Resolves the client IP without trusting a client-supplied forwarded header.
 * The immediate peer is used unless it is a configured proxy; only then is the
 * forwarded chain walked right-to-left to the first untrusted hop.
 */
export function resolveClientIP({ peer, forwarded, trustedProxies = [] }: ClientIPInput): string | null {
	if (!peer) return null;
	const peerFamily = familyOf(peer);
	if (!peerFamily) return null;
	const proxies = proxyList(trustedProxies);
	if (!proxies || !proxies.check(peer, peerFamily)) return peer;
	const chain = (forwarded ?? "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
	for (let i = chain.length - 1; i >= 0; i--) {
		const candidate = chain[i];
		if (!candidate) continue;
		const family = familyOf(candidate);
		// A malformed forwarded chain cannot identify a client. Falling back to
		// the trusted peer keeps rate limiting safe without using client input.
		if (!family) return peer;
		if (proxies.check(candidate, family)) continue;
		return candidate;
	}
	// No usable forwarded hop: the proxy itself is the only trustworthy peer.
	return peer;
}

/** Comma-separated `WUPPY_TRUSTED_PROXIES` (exact IPs or CIDR ranges). */
export function trustedProxiesFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
	return (env.WUPPY_TRUSTED_PROXIES ?? "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
}
