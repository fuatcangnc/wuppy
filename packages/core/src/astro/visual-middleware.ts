import { siteRoot } from "../themes/site.ts";
import { createVisualMiddleware } from "./visual.ts";

export const onRequest = createVisualMiddleware(siteRoot());
