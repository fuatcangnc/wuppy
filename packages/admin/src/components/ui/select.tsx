import type { SelectHTMLAttributes } from "react";
import { cn } from "./utils.ts";

export function NativeSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
	return (
		<select
			data-slot="native-select"
			className={cn(
				"flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm",
				className,
			)}
			{...props}
		/>
	);
}

/** Compatibility alias used by older screens. */
export const Select = NativeSelect;
