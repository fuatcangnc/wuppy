import type { DatabaseSync } from "node:sqlite";

export const LAST_ADMIN_MESSAGE = "Cannot remove, ban or demote the last active admin";

const storesAdminRole = (role: unknown): boolean => {
	const values = (Array.isArray(role) ? role : [role])
		.map((value) => String(value))
		.join(",")
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
	// This app's permission table understands one exact role, not comma lists.
	return values.length === 1 && values[0] === "admin";
};

/**
 * True when this change would leave the site without an active admin. Better
 * Auth already blocks self-removal and self-banning; this covers self-demotion
 * and custom API callers that update the role directly.
 */
export function isLastAdminChange(
	db: DatabaseSync,
	userId: string,
	change: { role?: unknown; banned?: unknown; remove?: boolean },
): boolean {
	const target = db.prepare("SELECT role, banned FROM user WHERE id = ?").get(userId) as
		{ role: string; banned: number | boolean | null } | undefined;
	if (!target || target.role !== "admin" || Number(target.banned) === 1) return false;
	const removesRole = change.role !== undefined && !storesAdminRole(change.role);
	const removesAccess = change.remove === true || removesRole || change.banned === true;
	if (!removesAccess) return false;
	const count = db.prepare("SELECT COUNT(*) AS n FROM user WHERE role = 'admin' AND COALESCE(banned, 0) = 0").get() as {
		n: number;
	};
	return Number(count.n) <= 1;
}
