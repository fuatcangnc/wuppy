import type { ReactNode } from "react";
import { cn } from "./utils.ts";

export function Tabs<T extends string>({
	value,
	onChange,
	items,
	className,
}: {
	value: T;
	onChange: (value: T) => void;
	items: Array<{ value: T; label: ReactNode }>;
	className?: string;
}) {
	return (
		<div data-slot="tabs" className={cn("grid gap-2", className)}>
			<div role="tablist" className="inline-flex h-9 w-fit items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
				{items.map((item) => (
					<button
						key={item.value}
						role="tab"
						aria-selected={value === item.value}
						data-state={value === item.value ? "active" : "inactive"}
						className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
						onClick={() => onChange(item.value)}
					>
						{item.label}
					</button>
				))}
			</div>
		</div>
	);
}
