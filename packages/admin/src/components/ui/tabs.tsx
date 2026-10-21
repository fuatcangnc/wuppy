import { createContext, useContext, useId, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "./utils.ts";

type TabsContextValue = {
	value: string;
	onChange: (value: string) => void;
	baseId: string;
	/** False for the compact `items` API, which has no tab panels of its own. */
	hasPanels: boolean;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
	const context = useContext(TabsContext);
	if (!context) throw new Error("TabsList, TabsTrigger and TabsContent must be used inside Tabs");
	return context;
}

const idFor = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "-");

/**
 * Accessible tabs with the shadcn visual language. Both the compact `items`
 * API and the composable TabsList/TabsTrigger/TabsContent API are supported.
 */
export function Tabs<T extends string>({
	value,
	onChange,
	items,
	children,
	className,
	stretch = false,
}: {
	value: T;
	onChange: (value: T) => void;
	items?: Array<{ value: T; label: ReactNode }>;
	children?: ReactNode;
	className?: string;
	/** Fill the available width with equal-width tabs. */
	stretch?: boolean;
}) {
	const baseId = useId();
	const context: TabsContextValue = {
		value,
		onChange: (next) => onChange(next as T),
		baseId,
		hasPanels: !items,
	};

	if (items) {
		return (
			<TabsContext.Provider value={context}>
				<div data-slot="tabs" className={cn("grid gap-2", className)}>
					<TabsList stretch={stretch}>
						{items.map((item) => (
							<TabsTrigger key={item.value} value={item.value}>
								{item.label}
							</TabsTrigger>
						))}
					</TabsList>
				</div>
			</TabsContext.Provider>
		);
	}

	return <TabsContext.Provider value={context}>{children}</TabsContext.Provider>;
}

export function TabsList({
	children,
	className,
	stretch = false,
}: {
	children: ReactNode;
	className?: string;
	/** Fill the available width with equal-width tabs. */
	stretch?: boolean;
}) {
	return (
		<div
			data-slot="tabs-list"
			role="tablist"
			aria-orientation="horizontal"
			className={cn(
				"inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
				stretch ? "w-full" : "w-fit",
				className,
			)}
		>
			{children}
		</div>
	);
}

function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
	const list = event.currentTarget.closest('[role="tablist"]');
	if (!list) return;
	const tabs = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]')).filter((tab) => !tab.disabled);
	const index = tabs.indexOf(event.currentTarget);
	if (index < 0) return;
	let next: number | null = null;
	if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % tabs.length;
	else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + tabs.length) % tabs.length;
	else if (event.key === "Home") next = 0;
	else if (event.key === "End") next = tabs.length - 1;
	if (next === null) return;
	event.preventDefault();
	const target = tabs[next];
	if (target) {
		target.focus();
		target.click();
	}
}

export function TabsTrigger({
	value,
	children,
	className,
	disabled = false,
}: {
	value: string;
	children: ReactNode;
	className?: string;
	disabled?: boolean;
}) {
	const { value: active, onChange, baseId, hasPanels } = useTabsContext();
	const selected = active === value;
	const id = idFor(value);

	return (
		<button
			type="button"
			id={`${baseId}-tab-${id}`}
			role="tab"
			aria-selected={selected}
			aria-controls={hasPanels ? `${baseId}-panel-${id}` : undefined}
			data-state={selected ? "active" : "inactive"}
			tabIndex={selected ? 0 : -1}
			disabled={disabled}
			className={cn(
				"inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-tab data-[state=active]:text-foreground data-[state=active]:shadow-sm",
				className,
			)}
			onClick={() => onChange(value)}
			onKeyDown={onTabKeyDown}
		>
			{children}
		</button>
	);
}

/**
 * A tab panel. Use `forceMount` when switching tabs must preserve local state;
 * inactive panels are hidden and removed from the accessibility tree.
 */
export function TabsContent({
	value,
	children,
	className,
	forceMount = false,
}: {
	value: string;
	children: ReactNode;
	className?: string;
	forceMount?: boolean;
}) {
	const { value: active, baseId } = useTabsContext();
	const selected = active === value;
	const id = idFor(value);
	if (!selected && !forceMount) return null;
	return (
		<div
			id={`${baseId}-panel-${id}`}
			role="tabpanel"
			aria-labelledby={`${baseId}-tab-${id}`}
			data-state={selected ? "active" : "inactive"}
			hidden={!selected}
			tabIndex={0}
			className={cn("outline-none", className)}
		>
			{children}
		</div>
	);
}
