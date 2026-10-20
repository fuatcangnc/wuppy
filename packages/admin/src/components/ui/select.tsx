import { Check, ChevronDown } from "@react-zero-ui/icon-sprite";
import * as SelectPrimitive from "@radix-ui/react-select";
import {
	Children,
	Fragment,
	isValidElement,
	useId,
	type ChangeEvent,
	type ComponentProps,
	type ReactNode,
} from "react";
import { Label } from "./label.tsx";
import { cn } from "./utils.ts";

/**
 * Radix Select items cannot use an empty string as a value. The app treats ""
 * as "no filter / none", so it maps to a private sentinel and back on change.
 */
const EMPTY_VALUE = "__wuppy_empty_select__";

interface SelectOption {
	value: string;
	label: ReactNode;
	disabled?: boolean;
}

interface OptionProps {
	value?: string | number;
	disabled?: boolean;
	children?: ReactNode;
}

const textOf = (node: ReactNode): string => {
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(textOf).join("");
	if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
	return "";
};

function optionsOf(children: ReactNode, out: SelectOption[] = []): SelectOption[] {
	Children.forEach(children, (child) => {
		if (!isValidElement<{ children?: ReactNode }>(child)) return;
		if (child.type === Fragment) {
			optionsOf(child.props.children, out);
			return;
		}
		if (child.type !== "option") return;
		const props = child.props as OptionProps;
		const fallback = textOf(props.children);
		out.push({
			value: props.value === undefined ? fallback : String(props.value),
			label: props.children ?? fallback,
			disabled: props.disabled,
		});
	});
	return out;
}

const normalize = (value?: string) => (value === "" ? EMPTY_VALUE : value);
const denormalize = (value: string) => (value === EMPTY_VALUE ? "" : value);

export interface SelectProps extends Omit<
	ComponentProps<typeof SelectPrimitive.Trigger>,
	"children" | "onChange" | "value" | "defaultValue" | "size"
> {
	label?: string;
	hint?: string;
	error?: string | null;
	value?: string;
	defaultValue?: string;
	onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
	children?: ReactNode;
	size?: "sm" | "default";
	placeholder?: string;
	required?: boolean;
}

export type { SelectOption };

/** Radix-backed shadcn Select with the app's existing `<option>` call sites. */
export function Select({
	label,
	hint,
	error,
	id,
	className,
	children,
	value,
	defaultValue,
	onChange,
	size = "default",
	placeholder = "Select…",
	disabled,
	name,
	required,
	...props
}: SelectProps) {
	const generatedId = useId();
	const selectId = id ?? generatedId;
	const options = optionsOf(children);
	const emit = (next: string) => {
		const actual = denormalize(next);
		onChange?.({
			target: { value: actual },
			currentTarget: { value: actual },
		} as unknown as ChangeEvent<HTMLSelectElement>);
	};

	return (
		<div data-slot="field" className="grid gap-2">
			{label && <Label htmlFor={selectId}>{label}</Label>}
			<SelectPrimitive.Root
				value={normalize(value)}
				defaultValue={normalize(defaultValue)}
				onValueChange={emit}
				disabled={disabled}
				required={required}
				name={name}
			>
				<SelectPrimitive.Trigger
					id={selectId}
					data-slot="select-trigger"
					data-size={size}
					className={cn(
						"flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-base whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[size=sm]:h-8 data-[placeholder]:text-muted-foreground aria-invalid:border-destructive md:text-sm *:data-[slot=select-value]:flex *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2",
						className,
					)}
					{...props}
				>
					<SelectPrimitive.Value data-slot="select-value" placeholder={placeholder} />
					<SelectPrimitive.Icon>
						<ChevronDown size={14} className="shrink-0 opacity-50" aria-hidden="true" />
					</SelectPrimitive.Icon>
				</SelectPrimitive.Trigger>
				<SelectPrimitive.Portal>
					<SelectPrimitive.Content
						data-slot="select-content"
						position="popper"
						sideOffset={4}
						className="relative z-[60] max-h-[min(24rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md"
					>
						<SelectPrimitive.ScrollUpButton className="flex h-7 cursor-default items-center justify-center bg-popover">
							<ChevronDown size={14} className="rotate-180 opacity-50" />
						</SelectPrimitive.ScrollUpButton>
						<SelectPrimitive.Viewport className="p-1">
							{options.map((option, index) => (
								<SelectPrimitive.Item
									key={`${option.value}:${index}`}
									value={option.value === "" ? EMPTY_VALUE : option.value}
									disabled={option.disabled}
									className="relative flex w-full cursor-default items-center rounded-md py-1.5 pr-8 pl-2 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
								>
									<span className="pointer-events-none absolute right-2 flex size-3.5 items-center justify-center">
										<SelectPrimitive.ItemIndicator>
											<Check size={14} />
										</SelectPrimitive.ItemIndicator>
									</span>
									<SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
								</SelectPrimitive.Item>
							))}
						</SelectPrimitive.Viewport>
						<SelectPrimitive.ScrollDownButton className="flex h-7 cursor-default items-center justify-center bg-popover">
							<ChevronDown size={14} className="opacity-50" />
						</SelectPrimitive.ScrollDownButton>
					</SelectPrimitive.Content>
				</SelectPrimitive.Portal>
			</SelectPrimitive.Root>
			{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
			{error && (
				<p role="alert" className="text-xs text-destructive">
					{error}
				</p>
			)}
		</div>
	);
}

export const SelectGroup = SelectPrimitive.Group;
export const SelectLabel = SelectPrimitive.Label;
export const SelectSeparator = SelectPrimitive.Separator;
