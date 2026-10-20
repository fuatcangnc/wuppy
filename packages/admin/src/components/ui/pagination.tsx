import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "@react-zero-ui/icon-sprite";
import { Button } from "./button.tsx";
import { Select } from "./select.tsx";
import { cn } from "./utils.ts";

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

function pageNumbers(page: number, pageCount: number): Array<number | "ellipsis"> {
	if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
	const out: Array<number | "ellipsis"> = [1];
	if (page > 4) out.push("ellipsis");
	const from = Math.max(2, page - 1);
	const to = Math.min(pageCount - 1, page + 1);
	for (let number = from; number <= to; number++) out.push(number);
	if (page < pageCount - 3) out.push("ellipsis");
	out.push(pageCount);
	return out;
}

/**
 * Footer shared by data tables: range summary, page-size control and numbered
 * pagination. Callers render it whenever there is at least one row, so even a
 * single-row table still exposes the page-size and page controls.
 */
export function DataPagination({
	page,
	pageCount,
	pageSize,
	total,
	onPageChange,
	onPageSizeChange,
	className,
}: {
	page: number;
	pageCount: number;
	pageSize: number;
	total: number;
	onPageChange: (page: number) => void;
	onPageSizeChange: (pageSize: number) => void;
	className?: string;
}) {
	const safePage = Math.min(Math.max(page, 1), Math.max(pageCount, 1));
	const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
	const end = Math.min(safePage * pageSize, total);
	return (
		<div
			data-slot="pagination"
			className={cn(
				"flex flex-col gap-3 border-t border-border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between",
				className,
			)}
		>
			<div className="flex flex-wrap items-center gap-3 text-muted-foreground">
				<span className="tabular-nums">
					Showing {start}-{end} of {total}
				</span>
				<span aria-hidden="true" className="hidden h-4 w-px bg-border sm:block" />
				<label className="flex items-center gap-2">
					<span>Per page</span>
					<Select
						aria-label="Per page"
						size="sm"
						className="w-[4.75rem]"
						value={String(pageSize)}
						onChange={(event) => onPageSizeChange(Number(event.target.value))}
					>
						{PAGE_SIZE_OPTIONS.map((size) => (
							<option key={size} value={size}>
								{size}
							</option>
						))}
					</Select>
				</label>
			</div>
			<nav aria-label="Pagination" className="flex items-center gap-1 self-end sm:self-auto">
				<Button
					variant="outline"
					size="icon-sm"
					aria-label="First page"
					title="First page"
					disabled={safePage <= 1}
					onClick={() => onPageChange(1)}
				>
					<ChevronsLeft size={14} />
				</Button>
				<Button
					variant="outline"
					size="icon-sm"
					aria-label="Previous page"
					title="Previous page"
					disabled={safePage <= 1}
					onClick={() => onPageChange(safePage - 1)}
				>
					<ChevronLeft size={14} />
				</Button>
				{pageNumbers(safePage, Math.max(pageCount, 1)).map((number, index) =>
					number === "ellipsis" ? (
						<span key={`ellipsis-${index}`} className="grid size-8 place-items-center text-muted-foreground">
							…
						</span>
					) : (
						<Button
							key={number}
							variant={number === safePage ? "default" : "outline"}
							size="icon-sm"
							aria-label={`Page ${number}`}
							aria-current={number === safePage ? "page" : undefined}
							onClick={() => onPageChange(number)}
						>
							{number}
						</Button>
					),
				)}
				<Button
					variant="outline"
					size="icon-sm"
					aria-label="Next page"
					title="Next page"
					disabled={safePage >= pageCount}
					onClick={() => onPageChange(safePage + 1)}
				>
					<ChevronRight size={14} />
				</Button>
				<Button
					variant="outline"
					size="icon-sm"
					aria-label="Last page"
					title="Last page"
					disabled={safePage >= pageCount}
					onClick={() => onPageChange(pageCount)}
				>
					<ChevronsRight size={14} />
				</Button>
			</nav>
		</div>
	);
}
