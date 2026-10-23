import type { APIRoute } from "astro";
import { trustedProxiesFromEnv, resolveClientIP } from "../../config/ip.ts";
import { createServer } from "../../server.ts";
import { siteRoot, themeRoot } from "../../themes/site.ts";

export const prerender = false;

let server: ReturnType<typeof createServer> | undefined;
const trustedProxies = trustedProxiesFromEnv();

// shortcut: the site is process.cwd() (or WUPPY_BASE_ROOT under a theme), fine for `astro dev` and the node adapter.
export const ALL: APIRoute = async ({ request, clientAddress }) => {
	// Overwrite any client-supplied value; only the runtime peer (and, when
	// configured, the forwarded chain behind a trusted proxy) may set this.
	const headers = new Headers(request.headers);
	const clientIP = resolveClientIP({
		peer: clientAddress,
		forwarded: request.headers.get("x-forwarded-for"),
		trustedProxies,
	});
	if (clientIP) headers.set("x-wuppy-client-ip", clientIP);
	else headers.delete("x-wuppy-client-ip");
	const forwardedRequest = new Request(request, { headers, duplex: "half" } as RequestInit);

	server ??= createServer({
		root: siteRoot(),
		theme: themeRoot(),
		// Runtime env wins: `.env` is baked into import.meta.env at build time and must not override the deployed origin/secret.
		secret: process.env.WUPPY_SECRET ?? import.meta.env.WUPPY_SECRET ?? "",
		baseURL: process.env.WUPPY_URL ?? import.meta.env.WUPPY_URL ?? new URL(request.url).origin,
	});
	return (await server).fetch(forwardedRequest);
};
