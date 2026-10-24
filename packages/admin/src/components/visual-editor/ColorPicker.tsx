import { Pipette } from "@react-zero-ui/icon-sprite";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** `#rrggbb` → hue 0–360, saturation and value 0–1; null when it is not a 6-digit hex colour. */
export function hexToHsv(hex: string): [number, number, number] | null {
	const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return null;
	const n = parseInt(m[1]!, 16);
	const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255) as [number, number, number];
	const max = Math.max(r, g, b);
	const d = max - Math.min(r, g, b);
	const h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
	return [(h * 60 + 360) % 360, max === 0 ? 0 : d / max, max];
}

export function hsvToHex(h: number, s: number, v: number): string {
	const f = (n: number) => {
		const k = (n + h / 60) % 6;
		return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
	};
	return `#${[f(5), f(3), f(1)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

declare global {
	interface Window {
		EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
	}
}

/**
 * A swatch that opens a colour picker kept inside the window (the browser's own picker can open off-screen). Each change
 * applies at once (callers merge quick changes into one undo step or one file write); Escape puts the old colour back.
 */
export function ColorPicker({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
}) {
	const button = useRef<HTMLButtonElement>(null);
	const panel = useRef<HTMLDivElement>(null);
	const [open, setOpen] = useState(false);
	const [hsv, setHsv] = useState<[number, number, number]>([0, 0, 0]);
	const [hex, setHex] = useState("");
	const [pos, setPos] = useState({ left: 0, top: 0 });
	// The colour before opening, for Escape; the latest props, for listeners added once.
	const before = useRef("");
	const latest = useRef({ value, onChange });
	latest.current = { value, onChange };
	const apply = (next: string) => {
		if (next.toLowerCase() !== latest.current.value.toLowerCase()) latest.current.onChange(next);
	};

	const show = () => {
		const start = hexToHsv(value) ?? [0, 0, 0];
		before.current = value;
		setHsv(start);
		setHex(hsvToHex(...start));
		setOpen(true);
	};
	const close = () => setOpen(false);
	const set = (next: [number, number, number]) => {
		const h = hsvToHex(...next);
		setHsv(next);
		setHex(h);
		apply(h);
	};

	useEffect(() => {
		if (!open) return;
		const outside = (e: Event) => {
			const t = e.target as Node;
			if (!panel.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
		};
		const key = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				if (before.current !== latest.current.value) latest.current.onChange(before.current);
				setOpen(false);
			}
		};
		document.addEventListener("pointerdown", outside, true);
		document.addEventListener("keydown", key, true);
		return () => {
			document.removeEventListener("pointerdown", outside, true);
			document.removeEventListener("keydown", key, true);
		};
	}, [open]);

	// Below the swatch, right-aligned with it, and moved so it stays fully inside the window.
	useLayoutEffect(() => {
		if (!open || !button.current || !panel.current) return;
		const b = button.current.getBoundingClientRect();
		const p = panel.current.getBoundingClientRect();
		const below = b.bottom + 6 + p.height <= innerHeight - 8;
		setPos({
			left: Math.max(8, Math.min(b.right - p.width, innerWidth - p.width - 8)),
			top: Math.max(8, below ? b.bottom + 6 : b.top - 6 - p.height),
		});
	}, [open]);

	const drag = (e: React.PointerEvent<HTMLDivElement>) => {
		const area = e.currentTarget;
		const move = (x: number, y: number) => {
			const r = area.getBoundingClientRect();
			const s = Math.min(1, Math.max(0, (x - r.left) / r.width));
			const v = 1 - Math.min(1, Math.max(0, (y - r.top) / r.height));
			set([hsv[0], s, v]);
		};
		move(e.clientX, e.clientY);
		area.setPointerCapture(e.pointerId);
		const onMove = (m: PointerEvent) => move(m.clientX, m.clientY);
		area.addEventListener("pointermove", onMove);
		area.addEventListener("pointerup", () => area.removeEventListener("pointermove", onMove), { once: true });
	};

	const shown = open ? hex : value;
	return (
		<>
			<button
				ref={button}
				type="button"
				aria-label={`${label} picker`}
				aria-expanded={open}
				onClick={() => (open ? close() : show())}
				className="h-8 w-8 shrink-0 rounded border border-[#34343a]"
				style={{ background: hexToHsv(shown) ? shown : "transparent" }}
			/>
			{open &&
				createPortal(
					<div
						ref={panel}
						role="dialog"
						aria-label={`${label} colour`}
						className="fixed z-[100] grid w-56 gap-2 rounded-xl border border-[#2f2f31] bg-[#1c1c1f] p-2 shadow-2xl"
						style={pos}
					>
						<div
							role="slider"
							aria-label="Saturation and brightness"
							aria-valuetext={hex}
							aria-valuenow={Math.round(hsv[1] * 100)}
							tabIndex={0}
							onPointerDown={drag}
							className="relative h-32 cursor-crosshair touch-none rounded-lg"
							style={{
								background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv[0]} 100% 50%))`,
							}}
						>
							<span
								aria-hidden="true"
								className="pointer-events-none absolute size-3 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-white shadow"
								style={{ left: `${hsv[1] * 100}%`, bottom: `${hsv[2] * 100}%` }}
							/>
						</div>
						<input
							type="range"
							aria-label="Hue"
							min={0}
							max={359}
							value={Math.round(hsv[0])}
							onChange={(e) => set([Number(e.target.value), hsv[1], hsv[2]])}
							className="h-3 w-full cursor-pointer appearance-none rounded-full"
							style={{
								background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
							}}
						/>
						<div className="flex items-center gap-1">
							{window.EyeDropper && (
								<button
									type="button"
									aria-label="Pick a colour from the screen"
									onClick={() => {
										const Picker = window.EyeDropper!;
										new Picker()
											.open()
											.then((r) => set(hexToHsv(r.sRGBHex) ?? hsv))
											.catch((e: Error) => {
												if (e.name !== "AbortError") throw e;
											});
									}}
									className="grid size-7 shrink-0 place-items-center rounded-md text-[#c4c4cc] hover:bg-white/[0.07]"
								>
									<Pipette size={13} />
								</button>
							)}
							<input
								aria-label="Hex"
								value={hex}
								onChange={(e) => {
									setHex(e.target.value);
									const next = hexToHsv(e.target.value);
									if (next) {
										setHsv(next);
										apply(e.target.value);
									}
								}}
								onKeyDown={(e) => e.key === "Enter" && close()}
								className="h-7 min-w-0 flex-1 rounded-md border border-[#34343a] bg-[#19191c] px-2 font-mono text-xs text-white outline-none"
							/>
							<button
								type="button"
								onClick={close}
								className="h-7 rounded-md bg-[#2c2c31] px-2 text-xs text-white hover:bg-[#3a3a40]"
							>
								Done
							</button>
						</div>
					</div>,
					document.body,
				)}
		</>
	);
}
