import type { ButtonHTMLAttributes } from "react";
import { cn } from "./utils.ts";

const variants = {
	default:
		"border border-transparent bg-[linear-gradient(to_bottom,var(--button-primary-grad-top),var(--button-primary-grad-bottom))] text-primary-foreground shadow-[inset_0_1px_0_var(--button-primary-gloss)] ring-1 ring-[var(--button-primary-ring)] hover:bg-[linear-gradient(to_bottom,var(--button-primary-grad-top-hover),var(--button-primary-grad-bottom))]",
	destructive:
		"border border-transparent bg-[linear-gradient(to_bottom,var(--button-danger-grad-top),var(--button-danger-grad-bottom))] text-destructive-foreground shadow-[inset_0_1px_0_var(--button-danger-gloss)] ring-1 ring-[var(--button-danger-ring)] hover:bg-[linear-gradient(to_bottom,var(--button-danger-grad-top-hover),var(--button-danger-grad-bottom))]",
	outline: "border border-border bg-background hover:bg-accent hover:text-accent-foreground",
	secondary: "border border-input bg-transparent hover:bg-muted",
	ghost: "border border-transparent hover:bg-muted",
	link: "border border-transparent text-primary underline-offset-4 hover:underline",
} as const;

const sizes = {
	default: "h-9 px-4 py-2 has-[>svg]:px-3",
	sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
	lg: "h-10 px-6 has-[>svg]:px-4",
	icon: "size-9",
	"icon-sm": "size-8",
	"icon-lg": "size-10",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: keyof typeof variants;
	size?: keyof typeof sizes;
	asChild?: boolean;
}

export function Button({ className, variant = "default", size = "default", ...props }: ButtonProps) {
	return (
		<button
			data-slot="button"
			className={cn(
				"inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				variants[variant],
				sizes[size],
				className,
			)}
			{...props}
		/>
	);
}
