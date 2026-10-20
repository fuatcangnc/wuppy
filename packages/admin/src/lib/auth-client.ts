import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/client";

/** Better Auth's browser client handles the WebAuthn ceremony and its cookies. */
export const authClient = createAuthClient({
	plugins: [passkeyClient()],
	fetchOptions: { credentials: "same-origin" },
});
