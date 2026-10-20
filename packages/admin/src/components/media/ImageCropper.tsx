import { useCallback, useEffect, useRef, useState } from "react";
import ReactCrop, {
	centerCrop,
	convertToPixelCrop,
	makeAspectCrop,
	type PercentCrop,
	type PixelCrop as DisplayPixelCrop,
} from "react-image-crop";
import type { PixelCrop } from "../../lib/crop-image.ts";
import "./image-crop.css";
import { useContainedSize } from "./useContainedSize.ts";

const HANDLE = 24;

function initialCrop(width: number, height: number, aspect?: number): PercentCrop {
	if (!aspect) return { unit: "%", x: 0, y: 0, width: 100, height: 100 };
	return centerCrop(makeAspectCrop({ unit: "%", width: 100 }, aspect, width, height), width, height);
}

/** The selection in pixels of the original image, whatever size the image is shown at. */
function naturalPixelCrop(image: HTMLImageElement, crop: DisplayPixelCrop): PixelCrop {
	const bounds = image.getBoundingClientRect();
	const scaleX = image.naturalWidth / bounds.width;
	const scaleY = image.naturalHeight / bounds.height;
	const x = Math.min(image.naturalWidth - 1, Math.max(0, Math.round(crop.x * scaleX)));
	const y = Math.min(image.naturalHeight - 1, Math.max(0, Math.round(crop.y * scaleY)));
	return {
		x,
		y,
		width: Math.max(1, Math.min(image.naturalWidth - x, Math.round(crop.width * scaleX))),
		height: Math.max(1, Math.min(image.naturalHeight - y, Math.round(crop.height * scaleY))),
	};
}

export function ImageCropper({
	src,
	crop,
	aspect,
	disabled = false,
	onCropChange,
	onCropComplete,
	onImageReady,
	onSourceReady,
}: {
	src: string;
	crop?: PercentCrop;
	aspect?: number;
	disabled?: boolean;
	onCropChange: (crop: PercentCrop) => void;
	onCropComplete: (crop: PixelCrop) => void;
	onImageReady: (image: HTMLImageElement | null) => void;
	onSourceReady: (size: { width: number; height: number }) => void;
}) {
	const imageRef = useRef<HTMLImageElement | null>(null);
	const frameRef = useRef<HTMLDivElement>(null);
	const [source, setSource] = useState<{ width: number; height: number } | null>(null);
	const display = useContainedSize(frameRef, source);
	const span = HANDLE * (aspect ? 2 : 3);

	const complete = useCallback(
		(displayCrop: DisplayPixelCrop) => {
			const image = imageRef.current;
			if (image && displayCrop.width > 0 && displayCrop.height > 0)
				onCropComplete(naturalPixelCrop(image, displayCrop));
		},
		[onCropComplete],
	);

	// Start with a selection as soon as the picture is laid out, and again when the ratio changes.
	useEffect(() => {
		if (crop || !display || !source || !imageRef.current) return;
		const bounds = imageRef.current.getBoundingClientRect();
		const next = initialCrop(bounds.width, bounds.height, aspect);
		onCropChange(next);
		complete(convertToPixelCrop(next, bounds.width, bounds.height));
	}, [aspect, complete, crop, display, onCropChange, source]);

	return (
		<div
			ref={frameRef}
			className="wuppy-checkerboard flex h-64 min-w-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-border md:h-80"
			data-testid="image-cropper"
			inert={disabled || undefined}
		>
			<ReactCrop
				crop={crop}
				aspect={aspect}
				disabled={disabled}
				keepSelection
				ruleOfThirds
				minWidth={display ? Math.max(1, Math.min(display.width, span)) : 1}
				minHeight={display ? Math.max(1, Math.min(display.height, span)) : 1}
				className="wuppy-image-crop max-h-full max-w-full"
				style={display ?? undefined}
				onChange={(displayCrop, percent) => {
					onCropChange(percent);
					complete(displayCrop);
				}}
				onComplete={complete}
			>
				<img
					ref={(node) => {
						imageRef.current = node;
						onImageReady(node);
					}}
					src={src}
					alt=""
					draggable={false}
					className="block max-h-64 max-w-full object-contain md:max-h-80"
					style={display ? { width: "100%", height: "100%" } : undefined}
					onLoad={(e) => {
						const { naturalWidth: width, naturalHeight: height } = e.currentTarget;
						if (width <= 0 || height <= 0) return;
						setSource({ width, height });
						onSourceReady({ width, height });
					}}
					onError={() => onImageReady(null)}
				/>
			</ReactCrop>
		</div>
	);
}
