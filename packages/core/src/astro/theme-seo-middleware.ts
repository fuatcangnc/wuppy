import { createThemeSeoMiddleware } from "./theme-seo.ts";

export const onRequest = createThemeSeoMiddleware(process.env.WUPPY_BASE_ROOT ?? process.cwd(), process.cwd());
