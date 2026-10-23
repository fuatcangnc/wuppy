import { useStore } from "@nanostores/react";
import {
	ArrowRightLeft,
	Blocks,
	CalendarDays,
	DatabaseBackup,
	Globe,
	ExternalLink,
	FileText,
	Image as ImageIcon,
	Layers,
	LayoutDashboard,
	LogOut,
	Menu as MenuIcon,
	MessageSquare,
	Monitor,
	Newspaper,
	Palette,
	Puzzle,
	Settings,
	ShieldCheck,
	Sparkles,
	Tags,
	Upload,
	UserRound,
	Webhook,
} from "@react-zero-ui/icon-sprite";
import {
	createRootRoute,
	createRoute,
	createRouter,
	Link,
	Outlet,
	useParams,
	useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { AssistantPage } from "../components/assistant/AssistantPage.tsx";
import { LoginPage } from "../components/auth/LoginPage.tsx";
import { SecurityPage } from "../components/auth/SecurityPage.tsx";
import { AuditPage } from "../components/content/AuditPage.tsx";
import { EntriesPage } from "../components/content/EntriesPage.tsx";
import { ContentWorkspacePage } from "../components/content/pages/PagesPage.tsx";
import { EditorPage } from "../components/content/EditorPage.tsx";
import { VisualEditorPage } from "../components/visual-editor/VisualEditorPage.tsx";
import { SitePage } from "../components/visual-editor/SitePage.tsx";
import { AiPage } from "../components/ai/AiPage.tsx";
import { TranslationsPage } from "../components/content/TranslationsPage.tsx";
import { TrashPage } from "../components/content/TrashPage.tsx";
import { TransferPage } from "../components/content/TransferPage.tsx";
import { DashboardPage } from "../components/dashboard/DashboardPage.tsx";
import { CalendarPage } from "../components/calendar/CalendarPage.tsx";
import { CommentsPage } from "../components/comments/CommentsPage.tsx";
import { MediaPage } from "../components/media/MediaPage.tsx";
import { MenusPage } from "../components/menus/MenusPage.tsx";
import { RedirectsPage } from "../components/redirects/RedirectsPage.tsx";
import { WidgetsPage } from "../components/widgets/WidgetsPage.tsx";
import { SectionsPage } from "../components/sections/SectionsPage.tsx";
import { TaxonomiesPage } from "../components/taxonomies/TaxonomiesPage.tsx";
import { BylinesPage } from "../components/bylines/BylinesPage.tsx";
import { BylineSchemaPage } from "../components/bylines/BylineSchemaPage.tsx";
import { ContentTypesPage } from "../components/content-types/ContentTypesPage.tsx";
import { UsersPage } from "../components/users/UsersPage.tsx";
import { PluginsPage } from "../components/plugins/PluginsPage.tsx";
import { PluginPage } from "../components/plugins/PluginPage.tsx";
import { ImportPage } from "../components/import/ImportPage.tsx";
import { SettingsPage } from "../components/settings/SettingsPage.tsx";
import { WebhooksPage } from "../components/settings/WebhooksPage.tsx";
import { ThemesPage } from "../components/settings/ThemesPage.tsx";
import { GlobalSearch } from "../components/shared/GlobalSearch.tsx";
import { SiteSwitcher } from "../components/sites/SiteSwitcher.tsx";
import { SitesPage } from "../components/sites/SitesPage.tsx";
import { apiData } from "../lib/api.ts";
import { $collections, collectionOfKind, kindOf, loadCollections } from "../stores/content.ts";
import { $session, loadSession, signOut } from "../stores/session.ts";
import { $sites, activeManagedSite, loadSites } from "../stores/sites.ts";
import { ThemeSwitcher, Button, GhostButton, Spinner, ToastHost } from "../ui/index.tsx";

function NavLink({
	to,
	params,
	icon,
	children,
}: {
	to: string;
	params?: Record<string, string>;
	icon?: ReactNode;
	children: ReactNode;
}) {
	return (
		<Link
			to={to}
			params={params}
			className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
			activeProps={{
				className:
					"flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium bg-sidebar-accent text-sidebar-foreground",
			}}
		>
			{icon && <span className="grid size-4 place-items-center text-sidebar-foreground opacity-40">{icon}</span>}
			{children}
		</Link>
	);
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div className="grid gap-0.5">
			<p className="px-2.5 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">{title}</p>
			{children}
		</div>
	);
}

function Shell() {
	const session = useStore($session);
	const sites = useStore($sites);
	const collections = useStore($collections);
	const [mobileOpen, setMobileOpen] = useState(false);
	const [pluginLinks, setPluginLinks] = useState<Array<{ id: string; index: number; label: string }>>([]);
	const fullWidth = useRouterState({
		select: (state) =>
			state.location.pathname === "/media" ||
			state.location.pathname === "/c/pages" ||
			state.location.pathname === "/c/posts" ||
			state.location.pathname === "/redirects" ||
			state.location.pathname === "/widgets" ||
			state.location.pathname === "/sections" ||
			state.location.pathname === "/taxonomies" ||
			state.location.pathname === "/users" ||
			state.location.pathname === "/bylines" ||
			state.location.pathname === "/content-types" ||
			state.location.pathname === "/webhooks" ||
			state.location.pathname === "/settings" ||
			state.location.pathname === "/security",
	});
	const localAllowed = session.status === "authed" && session.user.role !== "client";
	useEffect(() => {
		if (session.status === "authed") void loadSites(localAllowed);
	}, [session.status, localAllowed]);
	// Content requests wait until the active site is settled, so they never hit the wrong site.
	const siteReady = sites.status === "ready" && (sites.active !== "local" || sites.localAllowed);
	useEffect(() => {
		if (session.status !== "authed" || !siteReady) return;
		void loadCollections();
		// Pages contributed by active plugins; users without plugins:manage simply get none.
		void apiData<{
			plugins: Array<{ id: string | null; state: string; manifest?: { adminPages: Array<{ label: string }> } }>;
		}>("GET", "/api/plugins")
			.then((d) =>
				setPluginLinks(
					d.plugins.flatMap((p) =>
						p.state === "active" && p.id
							? (p.manifest?.adminPages ?? []).map((page, index) => ({ id: p.id!, index, label: page.label }))
							: [],
					),
				),
			)
			.catch(() => setPluginLinks([]));
	}, [session.status, siteReady]);

	if (session.status === "loading")
		return (
			<div className="grid min-h-screen place-items-center">
				<Spinner />
			</div>
		);
	if (session.status === "error") {
		return (
			<main className="mx-auto grid max-w-md gap-3 p-6">
				<h1 className="text-xl font-semibold">Can't reach the server</h1>
				<p role="alert" className="text-destructive">
					{session.message}
				</p>
				<p className="text-sm text-muted-foreground">
					Check the terminal running Wuppy; WUPPY_SECRET must be set (32+ characters).
				</p>
				<GhostButton onClick={() => void loadSession()}>Try again</GhostButton>
			</main>
		);
	}
	if (session.status === "anon") return <LoginPage />;
	if (sites.status !== "ready")
		return (
			<div className="grid min-h-screen place-items-center">
				<Spinner />
			</div>
		);
	if (!siteReady)
		return (
			<main className="mx-auto grid max-w-md gap-3 p-6">
				<h1 className="text-xl font-semibold">No sites yet</h1>
				<p className="text-sm text-muted-foreground">
					No site has been shared with you yet. Ask the person who invited you to give you access.
				</p>
				<GhostButton onClick={() => void signOut()}>Sign out</GhostButton>
			</main>
		);
	const remote = activeManagedSite(sites);
	// On a managed site the menu follows what the hub may do there; on Local it follows this account's role.
	const can = (permission: string) =>
		remote ? (sites.permissions ?? []).includes(permission) : session.user.role === "admin";
	const isAdmin = can("site:settings");
	const siteHref = remote ? remote.url : "/";

	const nav = (
		<>
			<Group title="Overview">
				<NavLink to="/" icon={<LayoutDashboard size={16} />}>
					Dashboard
				</NavLink>
				<NavLink to="/calendar" icon={<CalendarDays size={16} />}>
					Calendar
				</NavLink>
			</Group>
			<Group title="Content">
				{(["posts", "pages"] as const).map((kind) => {
					const name = collectionOfKind(collections, kind);
					return (
						name && (
							<NavLink key={kind} to="/c/$collection" params={{ collection: name }}>
								<span aria-label={name}>{kind === "posts" ? "Posts" : "Pages"}</span>
							</NavLink>
						)
					);
				})}
				{collections
					.filter(
						(c) =>
							c.name !== collectionOfKind(collections, "posts") && c.name !== collectionOfKind(collections, "pages"),
					)
					.map((c) => (
						<NavLink key={c.name} to="/c/$collection" params={{ collection: c.name }}>
							<span aria-label={c.name}>{c.name.charAt(0).toUpperCase() + c.name.slice(1)}</span>
						</NavLink>
					))}
				<NavLink to="/site" icon={<Monitor size={16} />}>
					Site
				</NavLink>
				<NavLink to="/trash" icon={<FileText size={16} />}>
					Trash
				</NavLink>
			</Group>
			<Group title="Library">
				<NavLink to="/media" icon={<ImageIcon size={16} />}>
					Media
				</NavLink>
			</Group>
			<Group title="Manage">
				<NavLink to="/comments" icon={<MessageSquare size={16} />}>
					Comments
				</NavLink>
				<NavLink to="/menus" icon={<MenuIcon size={16} />}>
					Menus
				</NavLink>
				<NavLink to="/redirects" icon={<ArrowRightLeft size={16} />}>
					Redirects
				</NavLink>
				<NavLink to="/widgets" icon={<Blocks size={16} />}>
					Widgets
				</NavLink>
				<NavLink to="/sections" icon={<Layers size={16} />}>
					Sections
				</NavLink>
				<NavLink to="/taxonomies" icon={<Tags size={16} />}>
					Categories &amp; tags
				</NavLink>
				<NavLink to="/bylines" icon={<UserRound size={16} />}>
					Bylines
				</NavLink>
			</Group>
			{pluginLinks.length > 0 && (
				<Group title="Plugins">
					{pluginLinks.map((l) => (
						<NavLink key={`${l.id}:${l.index}`} to="/p/$id/$index" params={{ id: l.id, index: String(l.index) }}>
							{l.label}
						</NavLink>
					))}
				</Group>
			)}
			{isAdmin && (
				<Group title="Admin">
					<NavLink to="/content-types" icon={<Newspaper size={16} />}>
						Content types
					</NavLink>
					<NavLink to="/byline-schema" icon={<UserRound size={16} />}>
						Byline schema
					</NavLink>
					{!remote && (
						<NavLink to="/users" icon={<UserRound size={16} />}>
							Users
						</NavLink>
					)}
					<NavLink to="/plugins" icon={<Puzzle size={16} />}>
						Plugins
					</NavLink>
					<NavLink to="/import" icon={<Upload size={16} />}>
						Import
					</NavLink>
					<NavLink to="/ai" icon={<Sparkles size={16} />}>
						AI
					</NavLink>
					<NavLink to="/webhooks" icon={<Webhook size={16} />}>
						Webhooks
					</NavLink>
					<NavLink to="/settings" icon={<Settings size={16} />}>
						Settings
					</NavLink>
					<NavLink to="/themes" icon={<Palette size={16} />}>
						Themes
					</NavLink>
				</Group>
			)}
			<div className="mt-4 border-t border-border pt-2">
				<NavLink to="/assistant" icon={<Sparkles size={16} />}>
					Assistant
				</NavLink>
				{sites.canManage && (
					<NavLink to="/sites" icon={<Globe size={16} />}>
						Sites
					</NavLink>
				)}
				{can("audit:read") && (
					<NavLink to="/audit" icon={<ShieldCheck size={16} />}>
						Security log
					</NavLink>
				)}
				{can("site:transfer") && (
					<NavLink to="/transfer" icon={<DatabaseBackup size={16} />}>
						Backup
					</NavLink>
				)}
				<NavLink to="/security">Account security</NavLink>
			</div>
		</>
	);

	return (
		<div className="min-h-screen bg-background text-foreground">
			<div className="flex min-h-screen">
				<aside
					className={`${mobileOpen ? "block" : "hidden"} w-64 shrink-0 bg-sidebar p-3 text-sidebar-foreground lg:block`}
				>
					<div className="mb-4 flex items-center gap-2 px-2">
						<span className="grid size-8 place-items-center rounded-ui bg-primary text-sm font-bold text-primary-foreground">
							W
						</span>
						<div>
							<p className="text-sm font-semibold">Wuppy</p>
							<p className="text-xs text-muted-foreground">Content studio</p>
						</div>
					</div>
					<SiteSwitcher />
					<nav className="grid gap-1">{nav}</nav>
					<div className="mt-6 border-t border-border px-2 pt-3 text-xs text-muted-foreground">
						<p>Wuppy 0.0.0</p>
						<p className="mt-1">Files + Git</p>
					</div>
				</aside>

				<div className="min-w-0 flex-1">
					<header className="flex items-center justify-between gap-3 bg-background px-4 py-2">
						<div className="flex items-center gap-2">
							<Button
								variant="ghost"
								className="lg:hidden"
								onClick={() => setMobileOpen((v) => !v)}
								aria-label="Toggle navigation"
							>
								<MenuIcon size={18} />
							</Button>
							<a
								href={siteHref}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
							>
								<ExternalLink size={14} /> View site
							</a>
							<span className="flex items-center gap-1 rounded-full border border-border p-0.5 text-xs">
								<span className="rounded-full bg-secondary px-2 py-0.5 font-medium">Edit</span>
								<a
									href={siteHref}
									target="_blank"
									rel="noreferrer"
									className="px-2 py-0.5 text-muted-foreground hover:text-foreground"
								>
									Preview
								</a>
							</span>
						</div>
						<div className="flex items-center gap-2">
							<GlobalSearch />
							<ThemeSwitcher />
							<span className="hidden text-sm text-muted-foreground sm:inline">{session.user.email}</span>
							<Button variant="ghost" size="sm" onClick={() => void signOut()}>
								<LogOut size={14} /> Sign out
							</Button>
						</div>
					</header>
					{remote && (
						<p className="border-y border-border bg-muted/40 px-4 py-1 text-xs text-muted-foreground">
							Managing <span className="font-medium text-foreground">{remote.url.replace(/^https?:\/\//, "")}</span>
							{remote.status === "connection_error" && (
								<span className="text-destructive">
									{" "}
									— connection problem{remote.lastError ? `: ${remote.lastError}` : ""}
								</span>
							)}
						</p>
					)}
					<main className={fullWidth ? "w-full p-2 lg:p-3" : "mx-auto max-w-7xl p-4 lg:p-6"}>
						<Outlet />
					</main>
				</div>
			</div>
			<ToastHost />
		</div>
	);
}

function CollectionPage() {
	const { collection } = useParams({ from: "/c/$collection" });
	const info = useStore($collections).find((c) => c.name === collection);
	return collection === "pages" || collection === "posts" || (info && kindOf(info)) ? (
		<ContentWorkspacePage collection={collection} />
	) : (
		<EntriesPage />
	);
}

const root = createRootRoute({ component: Shell });
const index = createRoute({ getParentRoute: () => root, path: "/", component: DashboardPage });
const calendar = createRoute({ getParentRoute: () => root, path: "/calendar", component: CalendarPage });
const entries = createRoute({ getParentRoute: () => root, path: "/c/$collection", component: CollectionPage });
const translations = createRoute({ getParentRoute: () => root, path: "/t/$collection", component: TranslationsPage });
const trash = createRoute({ getParentRoute: () => root, path: "/trash", component: TrashPage });
const editor = createRoute({ getParentRoute: () => root, path: "/e/$collection/$", component: EditorPage });
const visualEditor = createRoute({
	getParentRoute: () => root,
	path: "/v/$collection/$",
	component: VisualEditorPage,
});
const media = createRoute({ getParentRoute: () => root, path: "/media", component: MediaPage });
const site = createRoute({ getParentRoute: () => root, path: "/site", component: SitePage });
const ai = createRoute({ getParentRoute: () => root, path: "/ai", component: AiPage });
const comments = createRoute({ getParentRoute: () => root, path: "/comments", component: CommentsPage });
const menus = createRoute({ getParentRoute: () => root, path: "/menus", component: MenusPage });
const redirects = createRoute({ getParentRoute: () => root, path: "/redirects", component: RedirectsPage });
const widgets = createRoute({ getParentRoute: () => root, path: "/widgets", component: WidgetsPage });
const sections = createRoute({ getParentRoute: () => root, path: "/sections", component: SectionsPage });
const taxonomies = createRoute({ getParentRoute: () => root, path: "/taxonomies", component: TaxonomiesPage });
const bylines = createRoute({ getParentRoute: () => root, path: "/bylines", component: BylinesPage });
const bylineSchema = createRoute({ getParentRoute: () => root, path: "/byline-schema", component: BylineSchemaPage });
const contentTypes = createRoute({ getParentRoute: () => root, path: "/content-types", component: ContentTypesPage });
const users = createRoute({ getParentRoute: () => root, path: "/users", component: UsersPage });
const pluginPage = createRoute({ getParentRoute: () => root, path: "/p/$id/$index", component: PluginPage });
const plugins = createRoute({ getParentRoute: () => root, path: "/plugins", component: PluginsPage });
const importPage = createRoute({ getParentRoute: () => root, path: "/import", component: ImportPage });
const webhooks = createRoute({ getParentRoute: () => root, path: "/webhooks", component: WebhooksPage });
const settings = createRoute({ getParentRoute: () => root, path: "/settings", component: SettingsPage });
const themes = createRoute({ getParentRoute: () => root, path: "/themes", component: ThemesPage });
const audit = createRoute({ getParentRoute: () => root, path: "/audit", component: AuditPage });
const transfer = createRoute({ getParentRoute: () => root, path: "/transfer", component: TransferPage });
const sitesRoute = createRoute({ getParentRoute: () => root, path: "/sites", component: SitesPage });
const assistant = createRoute({
	getParentRoute: () => root,
	path: "/assistant",
	component: AssistantPage,
	validateSearch: (search: Record<string, unknown>): { site?: string } =>
		typeof search.site === "string" ? { site: search.site } : {},
});
function AccountSecurity() {
	const session = useStore($session);
	return <SecurityPage twoFactorEnabled={session.status === "authed" && session.user.twoFactorEnabled === true} />;
}
const security = createRoute({ getParentRoute: () => root, path: "/security", component: AccountSecurity });

export const router = createRouter({
	routeTree: root.addChildren([
		index,
		calendar,
		entries,
		translations,
		trash,
		editor,
		visualEditor,
		media,
		site,
		ai,
		comments,
		menus,
		redirects,
		widgets,
		sections,
		taxonomies,
		bylines,
		bylineSchema,
		contentTypes,
		users,
		plugins,
		pluginPage,
		importPage,
		webhooks,
		settings,
		themes,
		audit,
		transfer,
		sitesRoute,
		assistant,
		security,
	]),
	basepath: "/admin",
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
