import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";
import { cn } from "./utils.ts";
import { Label } from "./label.tsx";
import { Input, Textarea } from "./input.tsx";

export function Field({
	label,
	hint,
	error,
	children,
	className,
}: {
	label?: string;
	hint?: string;
	error?: string | null;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div data-slot="field" className={cn("grid gap-2", className)}>
			{label && <Label>{label}</Label>}
			{children}
			{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
			{error && (
				<p role="alert" className="text-xs text-destructive">
					{error}
				</p>
			)}
		</div>
	);
}

/** Labelled shadcn controls kept for the existing screens. */
export function FieldInput({
	label,
	hint,
	error,
	className,
	...props
}: ComponentProps<typeof Input> & { label?: string; hint?: string; error?: string | null }) {
	const id = useId();
	return (
		<Field label={undefined} hint={hint} error={error}>
			{label && <Label htmlFor={id}>{label}</Label>}
			<Input id={id} className={className} {...props} />
		</Field>
	);
}

export function FieldTextarea({
	label,
	hint,
	error,
	className,
	...props
}: ComponentProps<typeof Textarea> & { label?: string; hint?: string; error?: string | null }) {
	const id = useId();
	return (
		<Field label={undefined} hint={hint} error={error}>
			{label && <Label htmlFor={id}>{label}</Label>}
			<Textarea id={id} className={className} {...props} />
		</Field>
	);
}
