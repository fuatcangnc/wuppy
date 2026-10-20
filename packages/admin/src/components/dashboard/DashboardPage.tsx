import { Plus, Upload } from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { $dashboard, $dashboardError, loadDashboard } from "../../stores/dashboard.ts";
import {
	Badge,
	Button,
	Card,
	CardHeader,
	EmptyState,
	ErrorText,
	PageHeader,
	Spinner,
	StatCard,
} from "../../ui/index.tsx";

const relative = (iso: string) => {
	const diff = Date.now() - new Date(iso).getTime();
	const mins = Math.round(diff / 60000);
	if (mins < 1) return "now";
	if (mins < 60) return `${mins}m`;
	const hours = Math.round(mins / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.round(hours / 24)}d`;
};

const statusTone = { draft: "warning", scheduled: "accent", published: "success" } as const;

export function DashboardPage() {
	const data = useStore($dashboard);
	const error = useStore($dashboardError);
	useEffect(() => void loadDashboard(), []);

	if (error) return <ErrorText>{error}</ErrorText>;
	if (!data) return <Spinner label="Loading dashboard…" />;

	return (
		<div className="grid gap-5">
			<PageHeader
				title="Dashboard"
				description="What needs attention and what changed recently."
				actions={
					<>
						{data.collections.map((c) => (
							<Link key={c.name} to="/c/$collection" params={{ collection: c.name }} className="contents">
								<Button variant="secondary">
									<Plus size={14} /> {c.name.charAt(0).toUpperCase() + c.name.slice(1).replace(/s$/, "")}
								</Button>
							</Link>
						))}
						<Link to="/media" className="contents">
							<Button variant="secondary">
								<Upload size={14} /> Upload media
							</Button>
						</Link>
					</>
				}
			/>

			<div className="grid gap-3 md:grid-cols-3">
				<StatCard label="Draft" value={data.drafts} hint="Drafts and scheduled entries" />
				<StatCard label="Media files" value={data.media} hint="Images in the library" />
				<StatCard label="Users" value={data.users} hint="Accounts with access" />
			</div>

			<div className="grid gap-4 lg:grid-cols-2">
				<Card>
					<CardHeader title="Content" description="Entries by collection" />
					<div className="divide-y divide-border">
						{data.collections.length === 0 && (
							<div className="p-4">
								<EmptyState title="No collections" description="Add a collection in wuppy.config." />
							</div>
						)}
						{data.collections.map((c) => (
							<Link
								key={c.name}
								to="/c/$collection"
								params={{ collection: c.name }}
								className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-secondary"
							>
								<span className="font-medium capitalize">{c.name}</span>
								<span className="flex gap-2">
									<Badge tone="success">{c.published} published</Badge>
									{(c.draft > 0 || c.scheduled > 0) && <Badge tone="warning">{c.draft + c.scheduled} drafts</Badge>}
								</span>
							</Link>
						))}
					</div>
				</Card>

				<Card>
					<CardHeader title="Recent activity" description="Latest content changes" />
					<div className="divide-y divide-border">
						{data.recent.length === 0 && (
							<div className="p-4">
								<EmptyState title="No activity yet" description="Create your first entry to get started." />
							</div>
						)}
						{data.recent.map((entry) => (
							<Link
								key={`${entry.collection}:${entry.slug}`}
								to="/e/$collection/$"
								params={{ collection: entry.collection, _splat: entry.slug }}
								className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-secondary"
							>
								<span className="flex min-w-0 items-center gap-2">
									<Badge tone={statusTone[entry.status]}>{entry.status}</Badge>
									<span className="truncate">{entry.title}</span>
									<span className="text-xs text-muted-foreground">{entry.collection}</span>
								</span>
								<span className="shrink-0 text-xs text-muted-foreground">{relative(entry.modified)}</span>
							</Link>
						))}
					</div>
				</Card>
			</div>
		</div>
	);
}
