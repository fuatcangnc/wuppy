import { ApiError, apiUrl } from "./api.ts";

interface Reply {
	data?: { url?: string };
	error?: { code?: string; message?: string };
}

/** Details stored with the file at upload time. */
export interface UploadMeta {
	alt?: string;
	title?: string;
	caption?: string;
	folder?: string;
}

export interface UploadHandle {
	/** Resolves to the public URL; rejects with an `AbortError` after `cancel()`. */
	done: Promise<string>;
	cancel: () => void;
}

/** Uploads one image with byte progress (0 to 1) and cancellation, which `fetch` cannot offer. */
export function uploadWithProgress(
	file: File,
	meta: UploadMeta = {},
	onProgress: (fraction: number) => void = () => undefined,
): UploadHandle {
	const xhr = new XMLHttpRequest();
	const form = new FormData();
	form.set("file", file);
	for (const [key, value] of Object.entries(meta)) if (value) form.set(key, value);
	const done = new Promise<string>((resolve, reject) => {
		xhr.open("POST", apiUrl("/api/media"));
		xhr.setRequestHeader("X-Wuppy-Request", "1");
		xhr.withCredentials = true;
		xhr.upload.addEventListener("progress", (e) => e.lengthComputable && onProgress(e.loaded / e.total));
		xhr.addEventListener("load", () => {
			let json: Reply | null = null;
			try {
				json = JSON.parse(xhr.responseText) as Reply;
			} catch {
				// not JSON: fall through to the status text
			}
			if (xhr.status >= 200 && xhr.status < 300 && json?.data?.url) {
				onProgress(1);
				resolve(json.data.url);
			} else {
				reject(
					new ApiError(
						xhr.status,
						json?.error?.code ?? "UNKNOWN",
						json?.error?.message ?? (xhr.statusText || "Upload failed"),
					),
				);
			}
		});
		xhr.addEventListener("error", () => reject(new Error("Network error")));
		xhr.addEventListener("abort", () => reject(new DOMException("Upload cancelled", "AbortError")));
		xhr.send(form);
	});
	return { done, cancel: () => xhr.abort() };
}

/** Images from a drop or paste event, in order; anything else is ignored. */
export const imagesFrom = (items: { files: Iterable<File> | null } | null): File[] =>
	[...(items?.files ?? [])].filter((f) => f.type.startsWith("image/"));
