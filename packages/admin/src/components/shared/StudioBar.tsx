import {
	FileText,
	Image,
	LayoutDashboard,
	Monitor,
	Puzzle,
	Settings,
	Sparkles,
	Users,
} from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { $collections, collectionOfKind } from "../../stores/content.ts";

const itemClass = (on: boolean) =>
	`flex shrink-0 items-center gap-1.5 rounded-[5px] px-2 py-1 transition-colors ${
		on ? "bg-[#2b2b2e] text-white" : "text-[#a1a1aa] hover:bg-[#1f1f22] hover:text-[#e4e4e7]"
	}`;

/** Compact studio navigation used by the full-screen Site and AI workspaces. */
export function StudioBar({ active }: { active?: "site" | "ai" }) {
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const pages = collectionOfKind(useStore($collections), "pages") ?? "pages";
	return (
		<header className="flex h-9 shrink-0 items-center gap-1 border-b border-[#2a2a2d] bg-[#111113] px-2 text-[11px] text-[#d4d4d8]">
			<span className="me-2 flex items-center gap-2 px-1">
				<span className="grid size-5 place-items-center rounded-[5px] bg-[#d4a72c] text-[10px] font-bold text-[#18181b]">
					W
				</span>
				<span className="font-semibold text-white">Wuppy</span>
			</span>
			<nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto" aria-label="Studio">
				<Link to="/" className={itemClass(active === undefined && pathname === "/")}>
					<LayoutDashboard size={13} /> Dashboard
				</Link>
				<Link to="/site" className={itemClass(active === "site")}>
					<Monitor size={13} /> Site
				</Link>
				<Link
					to="/c/$collection"
					params={{ collection: pages }}
					className={itemClass(active === undefined && pathname === `/c/${pages}`)}
				>
					<FileText size={13} /> Content
				</Link>
				<Link to="/media" className={itemClass(active === undefined && pathname === "/media")}>
					<Image size={13} /> Media
				</Link>
				<Link to="/plugins" className={itemClass(active === undefined && pathname === "/plugins")}>
					<Puzzle size={13} /> Plugins
				</Link>
				<Link to="/ai" className={itemClass(active === "ai")}>
					<Sparkles size={13} /> AI
				</Link>
				<Link to="/users" className={itemClass(active === undefined && pathname === "/users")}>
					<Users size={13} /> Users
				</Link>
			</nav>
			<div className="ms-auto flex items-center gap-1">
				<Link
					to="/settings"
					aria-label="Settings"
					title="Settings"
					className="grid size-7 place-items-center rounded-[5px] text-[#a1a1aa] hover:bg-[#1f1f22] hover:text-white"
				>
					<Settings size={14} />
				</Link>
				<Link
					to="/security"
					aria-label="Account"
					title="Account"
					className="grid size-6 place-items-center rounded-full bg-gradient-to-br from-[#f97316] to-[#dc2626] text-[10px] font-bold text-white"
				>
					W
				</Link>
			</div>
		</header>
	);
}
