import type { APIRoute } from "astro";
import { serveUpload } from "../../media/index.ts";
import { siteRoot } from "../../themes/site.ts";

export const prerender = false;

export const GET: APIRoute = ({ params, url }) => serveUpload(siteRoot(), params.path ?? "", url.searchParams);
