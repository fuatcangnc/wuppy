import type { ContentService } from "../content/service.ts";
import type { MediaService } from "../media/index.ts";
import { entryStatus } from "../publishing/index.ts";

export interface DashboardCollection {
	name: string;
	total: number;
	published: number;
	draft: number;
	scheduled: number;
}

export interface RecentEntry {
	collection: string;
	slug: string;
	title: string;
	status: "draft" | "scheduled" | "published";
	modified: string;
}

export interface DashboardData {
	drafts: number;
	media: number;
	users: number;
	collections: DashboardCollection[];
	recent: RecentEntry[];
}

export async function buildDashboard(
	service: ContentService,
	media: MediaService,
	userCount: () => number,
): Promise<DashboardData> {
	const now = new Date();
	const rows: DashboardCollection[] = [];
	const recent: RecentEntry[] = [];
	let drafts = 0;

	for (const collection of service.collections) {
		const entries = await service.listEntries(collection.name);
		let published = 0;
		let scheduled = 0;
		let draft = 0;
		for (const entry of entries) {
			const status = entryStatus(entry.data, now);
			if (status === "published") published++;
			else if (status === "scheduled") scheduled++;
			else draft++;
			recent.push({
				collection: collection.name,
				slug: entry.slug,
				title: typeof entry.data.title === "string" ? entry.data.title : entry.slug,
				status,
				modified: entry.modified,
			});
		}
		drafts += draft + scheduled;
		rows.push({ name: collection.name, total: entries.length, published, draft, scheduled });
	}

	recent.sort((a, b) => b.modified.localeCompare(a.modified));
	return {
		drafts,
		media: (await media.list()).length,
		users: userCount(),
		collections: rows,
		recent: recent.slice(0, 12),
	};
}
