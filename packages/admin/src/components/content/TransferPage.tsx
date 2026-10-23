import { useEffect, useState } from "react";
import { apiData, apiUrl } from "../../lib/api.ts";
import { Button, ErrorText, Input } from "../../ui/index.tsx";

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

interface Backup {
	name: string;
	bytes: number;
	createdAt: string;
}

export function TransferPage() {
	const [backups, setBackups] = useState<Backup[]>([]);
	const loadBackups = () =>
		apiData<Backup[]>("GET", "/api/backups")
			.then((list) => setBackups(Array.isArray(list) ? list : []))
			.catch(() => undefined);
	useEffect(() => void loadBackups(), []);

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
			<a href={apiUrl("/api/export")} download className="text-primary underline">
				Download content (JSON)
			</a>
			<div className="grid gap-2">
				<div className="flex items-center justify-between">
					<h2 className="font-medium">Saved backups</h2>
					<Button
						variant="secondary"
						onClick={() =>
							void apiData("POST", "/api/backups")
								.then(loadBackups)
								.catch((e: Error) => setError(e.message))
						}
					>
						Back up now
					</Button>
				</div>
				{backups.length === 0 ? (
					<p className="text-sm text-muted-foreground">No backups yet.</p>
				) : (
					<ul className="grid gap-1 text-sm">
						{backups.map((b) => (
							<li key={b.name} className="flex justify-between gap-2">
								<a href={apiUrl(`/api/backups/${b.name}`)} download className="text-primary underline">
									{b.name}
								</a>
								<span className="text-muted-foreground">{Math.max(1, Math.round(b.bytes / 1024))} KB</span>
							</li>
						))}
					</ul>
				)}
			</div>
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
