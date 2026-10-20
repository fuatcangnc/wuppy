import type { HTMLAttributes } from "react";
import { cn } from "./utils.ts";

export function Separator({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return <div role="separator" className={cn("h-px w-full shrink-0 bg-border", className)} {...props} />;
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return <div data-slot="skeleton" className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

export function Spinner({ className, label = "Loading…" }: { className?: string; label?: string }) {
	return (
		<p role="status" className={cn("text-sm text-muted-foreground", className)}>
			{label}
		</p>
	);
}
