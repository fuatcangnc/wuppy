import { useEffect, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "./utils.ts";
import { Button } from "./button.tsx";

export function Dialog({
	open,
	title,
	children,
	onClose,
	footer,
}: {
	open: boolean;
	title: string;
	children: ReactNode;
	onClose: () => void;
	footer?: ReactNode;
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
	return (
		<div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="presentation" onMouseDown={onClose}>
			<div
				role="dialog"
				aria-modal="true"
				aria-label={title}
				data-slot="dialog-content"
				className="relative grid w-full max-w-lg gap-4 rounded-xl border border-border bg-popover p-6 text-popover-foreground shadow-lg"
				onMouseDown={(event) => event.stopPropagation()}
			>
				<header className="flex items-start justify-between gap-3">
					<h2 className="text-lg leading-none font-semibold">{title}</h2>
					<Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
						×
					</Button>
				</header>
				<div className="max-h-[70vh] overflow-y-auto">{children}</div>
				{footer && <footer className="flex justify-end gap-2">{footer}</footer>}
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
