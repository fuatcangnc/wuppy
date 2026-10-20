/** Masks credentials before text reaches logs or the audit trail. */
export function redact(text: string, secrets: readonly (string | undefined)[] = [process.env.WUPPY_SECRET]): string {
	let out = text
		.replace(/\bBearer\s+[\w.~+/-]+=*/gi, "Bearer [redacted]")
		.replace(
			/\b(secret|token|password|api[_-]?key|authorization)(["']?\s*[:=]\s*["']?)[^\s"',;&}]+/gi,
			"$1$2[redacted]",
		)
		.replace(/\bre_[A-Za-z0-9_]{10,}/g, "[redacted]");
	for (const s of secrets) if (s && s.length >= 8) out = out.split(s).join("[redacted]");
	return out;
}
