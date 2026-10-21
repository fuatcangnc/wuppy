import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../ui/utils.ts";

/**
 * The full-width two-pane workspace used by Media and Pages. The sidebar is a
 * fixed-width list and the panel is the detail surface; below 1400px they
 * stack so each pane keeps a usable width.
 */
export function WorkspaceLayout({
	children,
	sidebarWidth = 300,
	className,
}: {
	children: ReactNode;
	sidebarWidth?: 300 | 340;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"grid gap-4 min-[1400px]:h-[calc(100vh-5rem)]",
				sidebarWidth === 340
					? "min-[1400px]:grid-cols-[340px_minmax(0,1fr)]"
					: "min-[1400px]:grid-cols-[300px_minmax(0,1fr)]",
				className,
			)}
		>
			{children}
		</div>
	);
}

export function WorkspaceSidebar({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<aside className={cn("flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card", className)}>
			{children}
		</aside>
	);
}

export function WorkspacePanel({
	children,
	className,
	...props
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				"grid min-h-[520px] gap-0 overflow-hidden rounded-xl border border-border bg-background min-[1400px]:min-h-0",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}
