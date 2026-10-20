import { createRequire } from "node:module";
import type { APIRoute } from "astro";
import { adminDist, serveAdmin } from "../admin.ts";

export const prerender = false;

const dist = adminDist(createRequire(import.meta.url).resolve);

export const GET: APIRoute = ({ params }) => serveAdmin(dist, params.path ?? "");
