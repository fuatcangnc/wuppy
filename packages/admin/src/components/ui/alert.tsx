import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./utils.ts";

const tones = {
	default: "bg-card text-card-foreground",
	destructive: "border-destructive/40 bg-destructive/10 text-destructive",
	success: "border-success/40 bg-success/10 text-success",
	warning: "border-warning/40 bg-warning/10 text-warning",
} as const;

export function Alert({
	className,
	tone = "default",
	title,
	children,
	...props
}: HTMLAttributes<HTMLDivElement> & { tone?: keyof typeof tones; title?: string; children: ReactNode }) {
	return (
		<div role="alert" className={cn("relative grid w-full gap-1 rounded-lg border px-4 py-3 text-sm", tones[tone], className)} {...props}>
			{title && <p className="font-medium">{title}</p>}
			<div>{children}</div>
		</div>
	);
}
