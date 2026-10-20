import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "./utils.ts";

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
	return (
		<div data-slot="table-container" className="relative w-full overflow-x-auto">
			<table data-slot="table" className={cn("w-full caption-bottom text-sm", className)} {...props} />
		</div>
	);
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
	return <thead data-slot="table-header" className={cn("[&_tr]:border-b", className)} {...props} />;
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
	return <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
	return (
		<tr
			data-slot="table-row"
			className={cn("border-b border-border/70 transition-colors last:border-0 hover:bg-muted/35 data-[state=selected]:bg-muted/60", className)}
			{...props}
		/>
	);
}

export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
	return (
		<th
			data-slot="table-head"
			className={cn("h-11 px-4 text-start align-middle text-[11px] font-medium tracking-wider text-muted-foreground uppercase whitespace-nowrap", className)}
			{...props}
		/>
	);
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
	return <td data-slot="table-cell" className={cn("px-4 py-3 align-middle", className)} {...props} />;
}

/** Compatibility aliases used by older screens. */
export const Th = TableHead;
export const Td = TableCell;
