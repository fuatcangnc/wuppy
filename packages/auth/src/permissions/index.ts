export const ROLES = ["admin", "editor", "author", "viewer"] as const;
export type Role = (typeof ROLES)[number];

/** The one list of permission names; routes may only require names from here. */
export const PERMISSIONS = [
	"content:read",
	"content:write",
	"content:delete",
	"content:publish",
	"content:schedule",
	"media:write",
	"media:delete",
	"comments:read",
	"comments:moderate",
	"menus:manage",
	"widgets:manage",
	"sections:manage",
	"taxonomies:manage",
	"bylines:manage",
	"content-types:manage",
	"themes:manage",
	"plugins:manage",
	"users:manage",
	"site:settings",
	"site:transfer",
	"import:run",
	"git:read",
	"git:revert",
	"audit:read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const BY_ROLE: Record<Role, readonly Permission[]> = {
	admin: PERMISSIONS,
	editor: [
		"content:read",
		"content:write",
		"content:delete",
		"content:publish",
		"content:schedule",
		"media:write",
		"media:delete",
		"comments:read",
		"comments:moderate",
		"menus:manage",
		"widgets:manage",
		"sections:manage",
		"taxonomies:manage",
		"bylines:manage",
		"content-types:manage",
		"themes:manage",
		"git:read",
		"import:run",
	],
	author: ["content:read", "content:write", "media:write", "comments:read", "git:read"],
	viewer: ["content:read"],
};

/** Single source for permission names; unknown roles get nothing. */
export function permissionsFor(role: string | null | undefined): Permission[] {
	return role && role in BY_ROLE ? [...BY_ROLE[role as Role]] : [];
}
