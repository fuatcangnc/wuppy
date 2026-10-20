import type { HTMLAttributes } from "react";
import { cn } from "./utils.ts";

const variants = {
	default: "border-transparent bg-primary text-primary-foreground",
	secondary: "border-transparent bg-secondary text-secondary-foreground",
	destructive: "border-transparent bg-destructive/10 text-destructive",
	outline: "text-foreground",
	success: "border-transparent bg-success/15 text-success",
	warning: "border-transparent bg-warning/15 text-warning",
} as const;

export function Badge({
	className,
	variant = "default",
	...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof variants }) {
	return (
		<span
			data-slot="badge"
			className={cn(
				"inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium",
				variants[variant],
				className,
			)}
			{...props}
		/>
	);
}
