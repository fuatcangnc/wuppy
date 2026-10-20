import type { APIRoute } from "astro";
import { serveUpload } from "../../media/index.ts";

export const prerender = false;

export const GET: APIRoute = ({ params, url }) => serveUpload(process.cwd(), params.path ?? "", url.searchParams);
