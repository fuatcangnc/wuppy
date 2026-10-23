import { createVisualMiddleware } from "./visual.ts";

export const onRequest = createVisualMiddleware(process.cwd());
