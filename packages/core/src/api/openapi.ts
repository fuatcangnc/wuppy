/** Every `error.code` the API can return, with its HTTP status. Clients map these to their own messages (i18n). */
export const ERROR_CODES = {
	BAD_REQUEST: 400,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	CSRF: 403,
	NOT_FOUND: 404,
	CONFLICT: 409,
	IN_USE: 409,
	USER_EXISTS: 409,
	INVALID_INVITATION: 400,
	NOT_ENABLED: 400,
	SELF: 400,
	DOMAIN_NOT_ALLOWED: 422,
	NOT_CONFIGURED: 500,
	EMAIL_FAILED: 502,
	SLUG_TAKEN: 409,
	PAYLOAD_TOO_LARGE: 413,
	UNSUPPORTED_MEDIA: 415,
	VALIDATION_ERROR: 422,
	DISALLOWED_CONTENT: 422,
	SPAM: 422,
	COMMENTS_CLOSED: 403,
	RATE_LIMITED: 429,
	INTERNAL: 500,
} as const;

interface RouteLike {
	method: string;
	path: string;
}

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

/** OpenAPI 3.1 document built from the routes the app actually registers, so it cannot drift. */
export function buildOpenApi(routes: readonly RouteLike[], info: { title: string; version: string }) {
	const paths: Record<string, Record<string, unknown>> = {};
	for (const r of routes) {
		if (!METHODS.has(r.method) || !r.path.startsWith("/api/")) continue;
		const params = [...r.path.matchAll(/:(\w+)/g)].map((m) => ({
			name: m[1],
			in: "path",
			required: true,
			schema: { type: "string" },
		}));
		const path = r.path.replace(/:(\w+)(\{[^}]*\})?/g, "{$1}");
		(paths[path] ??= {})[r.method.toLowerCase()] = {
			parameters: params,
			responses: {
				"200": { description: "Success" },
				default: { $ref: "#/components/responses/Error" },
			},
		};
	}
	return {
		openapi: "3.1.0",
		info,
		paths,
		components: {
			responses: {
				Error: {
					description: "Error",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									error: {
										type: "object",
										required: ["code", "message"],
										properties: {
											code: { type: "string", enum: Object.keys(ERROR_CODES) },
											message: { type: "string" },
											details: {},
										},
									},
								},
							},
						},
					},
				},
			},
			securitySchemes: {
				session: { type: "apiKey", in: "cookie", name: "better-auth.session_token" },
				bearer: { type: "http", scheme: "bearer" },
			},
		},
		security: [{ session: [] }, { bearer: [] }],
	};
}
