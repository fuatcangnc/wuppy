import type { InputHTMLAttributes } from "react";
import { cn } from "./utils.ts";

export function Checkbox({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
	return (
		<input
			type="checkbox"
			data-slot="checkbox"
			className={cn("size-4 shrink-0 rounded-[4px] border border-input accent-primary shadow-xs", className)}
			{...props}
		/>
	);
}

export function Switch({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
	return (
		<input
			type="checkbox"
			role="switch"
			data-slot="switch"
			className={cn("size-4 shrink-0 rounded-full border border-input accent-primary shadow-xs", className)}
			{...props}
		/>
	);
}
