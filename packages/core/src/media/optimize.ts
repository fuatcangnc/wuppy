import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Widths a client may ask for; a closed list keeps anyone from filling the cache with arbitrary sizes. */
export const WIDTHS = [320, 480, 640, 768, 1024, 1280, 1600, 1920, 2560] as const;
export const FORMATS = { webp: "image/webp", avif: "image/avif", jpeg: "image/jpeg", png: "image/png" } as const;
export type Format = keyof typeof FORMATS;
/** Crop shapes a client may ask for (`?ar=16:9`), again a closed list. */
export const ASPECT_RATIOS = ["1:1", "4:3", "3:2", "16:9", "3:4", "2:3", "9:16"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

type Sharp = typeof import("sharp");
let sharpPromise: Promise<Sharp["default"] | null> | undefined;
/** `sharp` is optional: without it uploads still work, they just are not resized or analysed. */
const loadSharp = () => (sharpPromise ??= import("sharp").then((m) => m.default).catch(() => null));

export interface ImageInfo {
	width: number;
	height: number;
	/** ~16px WebP as a data URL, for blur-up placeholders. */
	lqip: string;
}

export async function imageInfo(bytes: Uint8Array): Promise<ImageInfo | null> {
	const sharp = await loadSharp();
	if (!sharp) return null;
	try {
		const image = sharp(bytes, { limitInputPixels: 100_000_000 });
		const { width, height } = await image.metadata();
		if (!width || !height) return null;
		const tiny = await image.resize({ width: 16 }).webp({ quality: 40 }).toBuffer();
		return { width, height, lqip: `data:image/webp;base64,${tiny.toString("base64")}` };
	} catch {
		return null;
	}
}

export interface Variant {
	width?: number;
	format?: Format;
	/** Crop to this shape around the focal point. */
	ratio?: AspectRatio;
	/** Focal point in percent, 0 to 100 (default 50). */
	focalX?: number;
	focalY?: number;
}

const clamp = (n: number, max: number) => Math.min(Math.max(Math.round(n), 0), max);

/**
 * The largest box of shape `ratio` inside a `width` x `height` image, placed so the focal point
 * (percent) sits at its centre where the image allows, otherwise pushed against the nearest edge.
 */
export function cropBox(width: number, height: number, ratio: AspectRatio, focalX = 50, focalY = 50) {
	const [rw, rh] = ratio.split(":").map(Number) as [number, number];
	const boxW = Math.min(width, Math.round((height * rw) / rh));
	const boxH = Math.min(height, Math.round((width * rh) / rw));
	return {
		width: boxW,
		height: boxH,
		left: clamp((width * focalX) / 100 - boxW / 2, width - boxW),
		top: clamp((height * focalY) / 100 - boxH / 2, height - boxH),
	};
}

/** Parses `?w=640&format=webp&ar=16:9&fx=30&fy=40`. Returns null when nothing is requested, `"invalid"` for values outside the allowlist. */
export function parseVariant(params: URLSearchParams): Variant | null | "invalid" {
	const w = params.get("w");
	const f = params.get("format");
	const ar = params.get("ar");
	if (w === null && f === null && ar === null) return null;
	const width = w === null ? undefined : Number(w);
	if (width !== undefined && !(WIDTHS as readonly number[]).includes(width)) return "invalid";
	if (f !== null && !(f in FORMATS)) return "invalid";
	if (ar !== null && !(ASPECT_RATIOS as readonly string[]).includes(ar)) return "invalid";
	const focal = (name: string) => {
		const v = params.get(name);
		return v === null ? undefined : /^\d{1,3}$/.test(v) && Number(v) <= 100 ? Number(v) : ("invalid" as const);
	};
	const fx = focal("fx");
	const fy = focal("fy");
	if (fx === "invalid" || fy === "invalid") return "invalid";
	return {
		...(width ? { width } : {}),
		...(f ? { format: f as Format } : {}),
		...(ar
			? {
					ratio: ar as AspectRatio,
					...(fx === undefined ? {} : { focalX: fx }),
					...(fy === undefined ? {} : { focalY: fy }),
				}
			: {}),
	};
}

/** Resized/re-encoded copy, cached on disk under `.wuppy/cache/images` keyed by source path, mtime and variant. */
export async function renderVariant(
	root: string,
	sourcePath: string,
	mtimeMs: number,
	variant: Variant,
): Promise<{ bytes: Uint8Array; mime: string } | null> {
	const sharp = await loadSharp();
	if (!sharp) return null;
	const format = variant.format ?? "webp";
	const key = createHash("sha256")
		.update(
			`${sourcePath}\n${mtimeMs}\n${variant.width ?? ""}\n${format}\n${variant.ratio ?? ""}\n${variant.focalX ?? ""}\n${variant.focalY ?? ""}`,
		)
		.digest("hex");
	const cached = join(root, ".wuppy", "cache", "images", `${key}.${format}`);
	try {
		return { bytes: await readFile(cached), mime: FORMATS[format] };
	} catch {
		// not cached yet
	}
	try {
		let image = sharp(await readFile(sourcePath), { limitInputPixels: 100_000_000 }).rotate();
		if (variant.ratio) {
			// Crop on the orientation-corrected pixels, then resize the cropped part.
			const { data, info } = await image.toBuffer({ resolveWithObject: true });
			const box = cropBox(info.width, info.height, variant.ratio, variant.focalX, variant.focalY);
			image = sharp(data, { limitInputPixels: 100_000_000 }).extract(box);
		}
		if (variant.width) image = image.resize({ width: variant.width, withoutEnlargement: true });
		const bytes = await image.toFormat(format, { quality: 80 }).toBuffer();
		await mkdir(join(root, ".wuppy", "cache", "images"), { recursive: true });
		await writeFile(cached, bytes);
		return { bytes, mime: FORMATS[format] };
	} catch {
		return null;
	}
}
