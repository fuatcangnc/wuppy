import { useStore } from "@nanostores/react";
import { atom } from "nanostores";
import type { ComponentProps, InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../components/ui/utils.ts";
import { Button as ShadButton, type ButtonProps } from "../components/ui/button.tsx";
import { Card as ShadCard, CardContent, CardDescription, CardFooter, CardTitle } from "../components/ui/card.tsx";
import { Badge as ShadBadge } from "../components/ui/badge.tsx";
import { Dialog, DialogHeader, DialogTitle } from "../components/ui/dialog.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Td, Th } from "../components/ui/table.tsx";
import { Checkbox as ShadCheckbox, Switch as ShadSwitch } from "../components/ui/checkbox.tsx";
import { Alert } from "../components/ui/alert.tsx";
import { Separator, Skeleton, Spinner } from "../components/ui/feedback.tsx";
import { Field, FieldInput, FieldSelect, FieldTextarea } from "../components/ui/field.tsx";
import { Input as ShadInput, Textarea as ShadTextarea } from "../components/ui/input.tsx";
import { Select as ShadSelect } from "../components/ui/select.tsx";
import { NativeSelect } from "../components/ui/select.tsx";
import { $mode, $radius, $theme, PRESETS, RADII, setMode, setRadius, setTheme } from "../stores/theme.ts";

export {
	cn,
	CardContent,
	CardDescription,
	CardFooter,
	CardTitle,
	Dialog,
	DialogHeader,
	DialogTitle,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
};
export {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
	Td,
	Th,
	Field,
	Alert,
	Separator,
	Skeleton,
	Spinner,
};
export type { ButtonProps };

export function Button({ variant = "default", ...props }: ButtonProps) {
	return <ShadButton variant={variant} {...props} />;
}

export function GhostButton(props: ButtonProps) {
	return <ShadButton variant="ghost" {...props} />;
}

export function IconButton({ label, ...props }: ButtonProps & { label: string }) {
	return <ShadButton variant="ghost" size="icon" aria-label={label} title={label} {...props} />;
}

export function Input({
	label,
	hint,
	error,
	...props
}: ComponentProps<typeof ShadInput> & { label?: string; hint?: string; error?: string | null }) {
	return <FieldInput label={label} hint={hint} error={error} {...props} />;
}

export function Textarea({
	label,
	hint,
	error,
	...props
}: ComponentProps<typeof ShadTextarea> & { label?: string; hint?: string; error?: string | null }) {
	return <FieldTextarea label={label} hint={hint} error={error} {...props} />;
}

export function Select({
	label,
	hint,
	error,
	...props
}: ComponentProps<typeof ShadSelect> & { label?: string; hint?: string; error?: string | null }) {
	return <FieldSelect label={label} hint={hint} error={error} {...props} />;
}

export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
	return (
		<label className="flex items-center gap-2 text-sm">
			<ShadCheckbox {...props} />
			{label && <span>{label}</span>}
		</label>
	);
}

export function Switch({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
	return (
		<label className="flex items-center gap-2 text-sm">
			<ShadSwitch {...props} />
			{label && <span>{label}</span>}
		</label>
	);
}

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";
const toneMap: Record<Tone, "default" | "secondary" | "outline" | "destructive" | "success" | "warning"> = {
	neutral: "secondary",
	accent: "default",
	success: "success",
	warning: "warning",
	danger: "destructive",
};

export function Badge({
	tone = "neutral",
	variant,
	children,
}: {
	tone?: Tone;
	variant?: "default" | "secondary" | "outline" | "destructive" | "success" | "warning";
	children: ReactNode;
}) {
	return <ShadBadge variant={variant ?? toneMap[tone]}>{children}</ShadBadge>;
}

/** App-level card header kept compatible with the existing screens. */
export function CardHeader({
	title,
	description,
	actions,
}: {
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-start justify-between gap-3 border-b px-6 py-4">
			<div className="grid gap-1">
				<h2 className="font-semibold leading-none">{title}</h2>
				{description && <p className="text-sm text-muted-foreground">{description}</p>}
			</div>
			{actions}
		</div>
	);
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
	return <ShadCard className={cn("gap-0 py-0", className)}>{children}</ShadCard>;
}

export function PageHeader({
	title,
	description,
	actions,
	back,
}: {
	title: string;
	description?: string;
	actions?: ReactNode;
	back?: ReactNode;
}) {
	return (
		<div className="mb-5 flex flex-wrap items-end justify-between gap-3">
			<div>
				{back}
				<h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
				{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
			</div>
			{actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
		</div>
	);
}

export function StatCard({
	label,
	value,
	hint,
	href,
}: {
	label: string;
	value: ReactNode;
	hint?: string;
	href?: string;
}) {
	const body = (
		<>
			<p className="text-sm text-muted-foreground">{label}</p>
			<p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
			{hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
		</>
	);
	return href ? (
		<a href={href} className="block rounded-xl border bg-card p-4 text-card-foreground shadow-sm hover:bg-muted/50">
			{body}
		</a>
	) : (
		<div className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm">{body}</div>
	);
}

export function EmptyState({
	title,
	description,
	action,
}: {
	title: string;
	description?: string;
	action?: ReactNode;
}) {
	return (
		<div className="grid place-items-center gap-2 rounded-lg border border-dashed p-10 text-center">
			<p className="font-medium">{title}</p>
			{description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
			{action}
		</div>
	);
}

export function ErrorText({ children }: { children?: string | null }) {
	return children ? (
		<p role="alert" className="text-sm text-destructive">
			{children}
		</p>
	) : null;
}

interface Toast {
	id: number;
	message: string;
	tone: "info" | "error";
}

export const $toasts = atom<Toast[]>([]);
let toastId = 0;

export function toast(message: string, tone: "info" | "error" = "info"): void {
	const id = ++toastId;
	$toasts.set([...$toasts.get(), { id, message, tone }]);
	setTimeout(() => $toasts.set($toasts.get().filter((item) => item.id !== id)), 4000);
}

export function ToastHost() {
	const toasts = useStore($toasts);
	return (
		<div aria-live="polite" className="fixed bottom-4 end-4 z-50 grid gap-2">
			{toasts.map((item) => (
				<div
					key={item.id}
					className={cn(
						"rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg",
						item.tone === "error" && "border-destructive text-destructive",
					)}
				>
					{item.message}
				</div>
			))}
		</div>
	);
}

export function ThemeSwitcher() {
	const theme = useStore($theme);
	const mode = useStore($mode);
	const radius = useStore($radius);
	return (
		<div className="flex items-center gap-1">
			{PRESETS.map((preset) => (
				<ShadButton
					key={preset.id}
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label={`Use ${preset.label} accent`}
					title={preset.label}
					aria-pressed={theme === preset.id}
					onClick={() => setTheme(preset.id)}
					className={cn("rounded-full border-2 p-0", theme === preset.id ? "border-foreground" : "border-transparent")}
					style={{ background: preset.light }}
				/>
			))}
			<NativeSelect
				aria-label="Corner radius"
				className="h-7 w-auto px-2 text-xs"
				value={radius}
				onChange={(event) => setRadius(event.target.value)}
			>
				{RADII.map((item) => (
					<option key={item.value} value={item.value}>
						{item.label}
					</option>
				))}
			</NativeSelect>
			<NativeSelect
				aria-label="Color mode"
				className="h-7 w-auto px-2 text-xs"
				value={mode}
				onChange={(event) => setMode(event.target.value as typeof mode)}
			>
				<option value="system">System</option>
				<option value="light">Light</option>
				<option value="dark">Dark</option>
			</NativeSelect>
		</div>
	);
}
