import { useEffect, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "./utils.ts";
import { Button } from "./button.tsx";

export function Dialog({
	open,
	title,
	description,
	children,
	onClose,
	footer,
	size = "default",
}: {
	open: boolean;
	title: string;
	/** A second line under the title, e.g. the file name. */
	description?: string;
	children: ReactNode;
	onClose: () => void;
	footer?: ReactNode;
	/** `medium` and `wide` have a ruled header and footer; their bodies set their own padding. */
	size?: "default" | "medium" | "wide";
}) {
	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		addEventListener("keydown", onKey);
		return () => removeEventListener("keydown", onKey);
	}, [open, onClose]);
	if (!open) return null;
	const framed = size !== "default";
	const width = size === "wide" ? "max-w-[min(68rem,94vw)]" : size === "medium" ? "max-w-2xl" : "max-w-lg";
	return (
		<div
			className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
			role="presentation"
			onMouseDown={onClose}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-label={title}
				data-slot="dialog-content"
				className={cn(
					"relative grid w-full rounded-xl border border-border bg-popover text-popover-foreground shadow-lg",
					framed ? `${width} max-h-[92vh] grid-rows-[auto_1fr_auto]` : `${width} gap-4 p-6`,
				)}
				onMouseDown={(event) => event.stopPropagation()}
			>
				<header className={cn("flex items-start justify-between gap-3", framed && "border-b border-border px-8 py-5")}>
					<div className="grid min-w-0 gap-1">
						<h2 className="text-lg leading-none font-semibold">{title}</h2>
						{description && <p className="truncate text-sm text-muted-foreground">{description}</p>}
					</div>
					<Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
						×
					</Button>
				</header>
				<div className={cn("custom-scrollbar overflow-y-auto", framed ? "min-h-0" : "max-h-[70vh]")}>{children}</div>
				{footer && (
					<footer className={cn("flex justify-end gap-2", framed && "border-t border-border px-8 py-4")}>
						{footer}
					</footer>
				)}
			</div>
		</div>
	);
}

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return <div className={cn("grid gap-1.5", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
	return <h2 className={cn("text-lg font-semibold", className)} {...props} />;
}
