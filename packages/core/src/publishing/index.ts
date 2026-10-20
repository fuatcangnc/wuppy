/** Draft/schedule rule shared by the sitemap, the starter site and anything else that lists public content. */
export function isPublished(data: Record<string, unknown>, now: Date = new Date()): boolean {
	if (data.draft === true) return false;
	const at = data.publishAt;
	if (at === undefined || at === null || at === "") return true;
	const t = (at instanceof Date ? at : new Date(String(at))).getTime();
	return Number.isFinite(t) && t <= now.getTime();
}
