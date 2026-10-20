import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useContainedSize } from "./useContainedSize.ts";

export interface Focal {
	/** 0 to 1 from the left and from the top of the image. */
	x: number;
	y: number;
}

const MOVES: Record<string, [number, number]> = {
	ArrowLeft: [-1, 0],
	ArrowRight: [1, 0],
	ArrowUp: [0, -1],
	ArrowDown: [0, 1],
};
const clamp = (n: number) => Math.min(1, Math.max(0, Math.round(n * 10_000) / 10_000));
const position = (p: Focal) => `${p.x * 100}% ${p.y * 100}%`;

/** The three crops themes commonly make from one image, so the focal point can be judged by eye. */
export function FocalPreviews({ src, point }: { src: string; point: Focal }) {
	return (
		<div className="grid grid-cols-3 items-end gap-2" data-testid="focal-previews">
			{(
				[
					["Portrait", "aspect-[4/5]"],
					["Square", "aspect-square"],
					["Landscape", "aspect-video"],
				] as const
			).map(([label, ratio]) => (
				<figure key={label} className="grid min-w-0 gap-1">
					<div className={`wuppy-checkerboard overflow-hidden rounded-lg ring-1 ring-border ${ratio}`}>
						<img src={src} alt="" className="h-full w-full object-cover" style={{ objectPosition: position(point) }} />
					</div>
					<figcaption className="truncate text-center text-xs text-muted-foreground">{label}</figcaption>
				</figure>
			))}
		</div>
	);
}

/** Click or drag on the image to set the point that stays visible when it is cropped; arrow keys nudge it. */
export function FocalPointEditor({
	src,
	point,
	onChange,
}: {
	src: string;
	point: Focal;
	onChange: (p: Focal) => void;
}) {
	const frameRef = useRef<HTMLDivElement>(null);
	const [source, setSource] = useState<{ width: number; height: number } | null>(null);
	const display = useContainedSize(frameRef, source);
	const dragging = useRef<number | null>(null);

	const set = (e: PointerEvent<HTMLButtonElement>) => {
		const box = e.currentTarget.getBoundingClientRect();
		if (box.width && box.height)
			onChange({ x: clamp((e.clientX - box.left) / box.width), y: clamp((e.clientY - box.top) / box.height) });
	};
	const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
		const move = MOVES[e.key];
		if (!move) return;
		e.preventDefault();
		const step = e.shiftKey ? 0.05 : 0.01;
		onChange({ x: clamp(point.x + move[0] * step), y: clamp(point.y + move[1] * step) });
	};

	return (
		<div
			ref={frameRef}
			className="wuppy-checkerboard flex h-64 items-center justify-center overflow-hidden rounded-xl ring-1 ring-border md:h-80"
		>
			<div className="relative inline-flex max-h-full max-w-full" style={display ?? undefined}>
				<img
					src={src}
					alt=""
					draggable={false}
					data-testid="focal-image"
					className="block max-h-64 max-w-full object-contain md:max-h-80"
					style={display ? { width: "100%", height: "100%" } : undefined}
					onLoad={(e) => setSource({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
				/>
				{source && (
					<button
						type="button"
						aria-label="Focal point. Use arrow keys to move it."
						className="absolute inset-0 cursor-crosshair touch-none rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
						onPointerDown={(e) => {
							dragging.current = e.pointerId;
							e.currentTarget.setPointerCapture(e.pointerId);
							set(e);
						}}
						onPointerMove={(e) => dragging.current === e.pointerId && set(e)}
						onPointerUp={(e) => {
							if (dragging.current === e.pointerId) set(e);
							dragging.current = null;
						}}
						onPointerCancel={() => (dragging.current = null)}
						onKeyDown={onKey}
					>
						<span
							aria-hidden="true"
							className="absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-background"
							style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
						/>
					</button>
				)}
			</div>
		</div>
	);
}
