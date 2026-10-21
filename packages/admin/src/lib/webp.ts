/**
 * Re-encodes an image as WebP in the browser. Nothing is sent to the server
 * for conversion; only the resulting file is uploaded.
 */
export async function imageToWebp(url: string, quality = 0.85): Promise<File> {
	const image = new Image();
	image.decoding = "async";
	image.src = url;
	await image.decode();
	if (!image.naturalWidth || !image.naturalHeight) throw new Error("Could not read this image.");

	const canvas = document.createElement("canvas");
	canvas.width = image.naturalWidth;
	canvas.height = image.naturalHeight;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Canvas is not available in this browser.");
	context.drawImage(image, 0, 0);

	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
	if (!blob || blob.type !== "image/webp") {
		throw new Error("This browser cannot encode WebP images.");
	}

	const path = new URL(url, window.location.origin).pathname;
	const source = decodeURIComponent(path.split("/").pop() || "image");
	const name = `${source.replace(/\.[^.]+$/, "") || "image"}.webp`;
	return new File([blob], name, { type: "image/webp" });
}
