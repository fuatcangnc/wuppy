export interface SessionPolicy {
	/** Absolute session lifetime in seconds. */
	expiresIn: number;
	/** How often an active session is refreshed, in seconds. 0 refreshes on every use. */
	updateAge: number;
}

const DAY = 86_400;
const HOUR = 3_600;

function numberFromEnv(name: string, fallback: number): number {
	const raw = process.env[name];
	if (raw === undefined || raw.trim() === "") return fallback;
	const value = Number(raw);
	if (!Number.isFinite(value)) throw new Error(`${name} must be a number`);
	return value;
}

/**
 * Session lifetime is deployment policy, not runtime content: changing it
 * requires a restart, but it must stay explicit and testable.
 */
export function resolveSessionPolicy(): SessionPolicy {
	const days = numberFromEnv("WUPPY_SESSION_DAYS", 7);
	const hours = numberFromEnv("WUPPY_SESSION_UPDATE_HOURS", 24);
	if (days <= 0) throw new Error("WUPPY_SESSION_DAYS must be greater than 0");
	if (hours < 0) throw new Error("WUPPY_SESSION_UPDATE_HOURS must be 0 or greater");
	const expiresIn = Math.round(days * DAY);
	const updateAge = Math.round(hours * HOUR);
	if (expiresIn < 60) throw new Error("WUPPY_SESSION_DAYS must be at least one minute");
	if (updateAge >= expiresIn) {
		throw new Error("WUPPY_SESSION_UPDATE_HOURS must be less than the session lifetime");
	}
	return { expiresIn, updateAge };
}
