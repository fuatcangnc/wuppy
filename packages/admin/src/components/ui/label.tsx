import type { LabelHTMLAttributes } from "react";
import { cn } from "./utils.ts";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
	return (
		<label
			data-slot="label"
			className={cn(
				"flex items-center gap-2 text-[10px] leading-none font-medium text-zinc-400 select-none",
				className,
			)}
			{...props}
		/>
	);
}
