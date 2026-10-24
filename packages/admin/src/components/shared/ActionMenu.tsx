import { EllipsisVertical } from "@react-zero-ui/icon-sprite";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../ui/index.tsx";
import { cn } from "../ui/utils.ts";

export interface ActionMenuItem {
	label: string;
	icon?: ReactNode;
	onSelect?: () => void;
	href?: string;
	external?: boolean;
	destructive?: boolean;
}

interface MenuPosition {
	top?: number;
	bottom?: number;
	right: number;
}

/** Small, keyboard-closable action menu used by page rows and the detail header. */
export function ActionMenu({
	items,
	label = "More actions",
	className,
	trigger,
}: {
	items: ActionMenuItem[];
	label?: string;
	className?: string;
	/** What the button shows instead of the ⋮ icon. */
	trigger?: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const [position, setPosition] = useState<MenuPosition | null>(null);
	const root = useRef<HTMLDivElement>(null);
	const menu = useRef<HTMLDivElement>(null);

	const place = () => {
		const box = root.current?.getBoundingClientRect();
		if (!box) return;
		const spaceBelow = window.innerHeight - box.bottom;
		setPosition({
			right: Math.max(8, window.innerWidth - box.right),
			...(spaceBelow < 240 ? { bottom: window.innerHeight - box.top + 4 } : { top: box.bottom + 4 }),
		});
	};

	useEffect(() => {
		if (!open) return;
		const focus = requestAnimationFrame(() => {
			menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
		});
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as Node;
			if (!root.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setOpen(false);
				root.current?.querySelector<HTMLElement>("button")?.focus();
			}
		};
		const close = () => setOpen(false);
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		window.addEventListener("resize", close);
		window.addEventListener("scroll", close, true);
		return () => {
			cancelAnimationFrame(focus);
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("resize", close);
			window.removeEventListener("scroll", close, true);
		};
	}, [open]);

	return (
		<div ref={root} className={cn("relative", className)}>
			<Button
				type="button"
				variant="ghost"
				size={trigger ? "sm" : "icon-sm"}
				aria-label={label}
				title={label}
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={() => {
					place();
					setOpen((value) => !value);
				}}
			>
				{trigger ?? <EllipsisVertical size="1em" />}
			</Button>
			{open &&
				position &&
				createPortal(
					<div
						ref={menu}
						role="menu"
						style={{ top: position.top, bottom: position.bottom, right: position.right }}
						className="fixed z-[70] grid min-w-40 gap-0.5 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
					>
						{items.map((item) => {
							const content = (
								<>
									{item.icon && <span className="grid size-4 shrink-0 place-items-center">{item.icon}</span>}
									<span className="truncate">{item.label}</span>
								</>
							);
							const itemClass = cn(
								"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm transition-colors hover:bg-muted",
								item.destructive && "text-destructive",
							);
							if (item.href) {
								return (
									<a
										key={item.label}
										role="menuitem"
										href={item.href}
										target={item.external ? "_blank" : undefined}
										rel={item.external ? "noreferrer" : undefined}
										className={itemClass}
										onClick={() => setOpen(false)}
									>
										{content}
									</a>
								);
							}
							return (
								<button
									key={item.label}
									type="button"
									role="menuitem"
									className={itemClass}
									onClick={() => {
										setOpen(false);
										item.onSelect?.();
									}}
								>
									{content}
								</button>
							);
						})}
					</div>,
					document.body,
				)}
		</div>
	);
}
