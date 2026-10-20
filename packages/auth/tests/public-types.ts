// Compile-time check: the hand-written `types/index.d.ts` must describe what `src` really exports.
import type * as published from "../types/index.d.ts";
import * as src from "../src/index.ts";

type Exports = typeof src;
type Published = typeof published;

// Every published value export exists in src with a compatible type...
type Missing = Exclude<keyof Published, keyof Exports>;
export const noMissingExports: Missing extends never ? true : false = true;

// ...and src's functions can stand in for the published ones.
export const sameFunctions: Pick<Published, "createMigratedAuth" | "needsSetup"> = {
	createMigratedAuth: src.createMigratedAuth,
	needsSetup: src.needsSetup,
};
// The real instance satisfies the narrow one, and the real helper returns the published shape.
export const narrowed = (auth: src.WuppyAuth): published.WuppyAuth => auth;
export const user: (a: src.WuppyAuth, r: Request) => ReturnType<Published["userFromRequest"]> = src.userFromRequest;
export const sameRoles: Published["ROLES"] = src.ROLES;
