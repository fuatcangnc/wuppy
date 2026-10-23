import { siteRoot } from "../themes/site.ts";
import { createPageCacheMiddleware } from "./page-cache.ts";

// Dev server and `astro preview` show drafts and edits immediately; only a production build caches.
export const onRequest = createPageCacheMiddleware(
	siteRoot(),
	undefined,
	(import.meta as { env?: { PROD?: boolean } }).env?.PROD ?? process.env.NODE_ENV === "production",
);
