import { useState } from "react";
import { apiData } from "../../lib/api.ts";
import { ErrorText, Input } from "../../ui/index.tsx";

const readText = (f: File) =>
	new Promise<string>((resolve, reject) => {
		const r = new FileReader();
		r.addEventListener("load", () => resolve(String(r.result)));
		r.addEventListener("error", () => reject(r.error));
		r.readAsText(f);
	});

interface ImportResult {
	imported: number;
	errors: { entry: string; message: string }[];
}

export function TransferPage() {
	const [result, setResult] = useState<ImportResult | null>(null);
	const [error, setError] = useState<string | null>(null);

	const upload = async (file: File) => {
		setError(null);
		setResult(null);
		let bundle: unknown;
		try {
			bundle = JSON.parse(await readText(file));
		} catch {
			setError("That file is not valid JSON.");
			return;
		}
		try {
			setResult(await apiData<ImportResult>("POST", "/api/import", bundle));
		} catch (e) {
			setError((e as Error).message);
		}
	};

	return (
		<section className="grid max-w-xl gap-4">
			<h1 className="text-xl font-semibold">Backup &amp; import</h1>
			<p className="text-sm text-muted-foreground">
				Your content is plain files in your project. This is a convenient single-file copy for moving between sites.
				Images stay in
				<code> public/uploads</code>.
			</p>
			<a href="/api/export" download className="text-primary underline">
				Download content (JSON)
			</a>
			<Input
				label="Import content"
				type="file"
				accept="application/json,.json"
				aria-label="Import content"
				onChange={(e) => {
					const f = e.target.files?.[0];
					e.target.value = "";
					if (f) void upload(f);
				}}
			/>
			<ErrorText>{error}</ErrorText>
			{result && (
				<div>
					<p>Imported {result.imported} entries</p>
					{result.errors.length > 0 && (
						<ul className="text-sm text-destructive">
							{result.errors.map((e) => (
								<li key={e.entry}>
									{e.entry}: {e.message}
								</li>
							))}
						</ul>
					)}
				</div>
			)}
		</section>
	);
}
