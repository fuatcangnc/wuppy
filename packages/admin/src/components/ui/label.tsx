import type { LabelHTMLAttributes } from "react";
import { cn } from "./utils.ts";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
	return (
		<label
			data-slot="label"
			className={cn(
				"flex items-center gap-2 text-xs leading-none font-medium tracking-wide text-zinc-400 uppercase select-none",
				className,
			)}
			{...props}
		/>
	);
}
