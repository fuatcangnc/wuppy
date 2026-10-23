import { useState } from "react";
import { apiUrl } from "../../lib/api.ts";
import { Button, Card, CardHeader, ErrorText, Input, PageHeader, Select, Textarea, toast } from "../../ui/index.tsx";
import { WordpressImport } from "./WordpressImport.tsx";

export function ImportPage() {
	const [mode, setMode] = useState<"json" | "wordpress">("json");
	const [file, setFile] = useState<File | null>(null);
	const [result, setResult] = useState<unknown>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const run = async () => {
		if (!file) return;
		setBusy(true);
		setError(null);
		try {
			const text = await file.text();
			if (mode === "json") {
				const parsed = JSON.parse(text) as unknown;
				const res = await fetch(apiUrl("/api/import"), {
					method: "POST",
					credentials: "same-origin",
					headers: { "X-Wuppy-Request": "1", "Content-Type": "application/json" },
					body: JSON.stringify(parsed),
				});
				const json = (await res.json()) as { data?: unknown; error?: { message?: string } };
				if (!res.ok) throw new Error(json.error?.message ?? res.statusText);
				setResult(json.data);
			}
			toast("Import finished");
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="grid gap-4">
			<PageHeader title="Import" description="Bring content in from a Wuppy backup or WordPress." />
			<ErrorText>{error}</ErrorText>
			<Card>
				<CardHeader title="Source" />
				<div className="grid gap-3 p-4">
					<Select label="Format" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
						<option value="json">Wuppy JSON backup</option>
						<option value="wordpress">WordPress WXR</option>
					</Select>
					<Input
						type="file"
						accept={mode === "json" ? "application/json,.json" : ".xml,text/xml"}
						onChange={(e) => setFile(e.target.files?.[0] ?? null)}
					/>
					{mode === "json" && (
						<Button onClick={() => void run()} disabled={!file || busy}>
							{busy ? "Importing…" : "Start import"}
						</Button>
					)}
				</div>
			</Card>
			{mode === "wordpress" && <WordpressImport file={file} />}
			{result !== null && (
				<Card>
					<CardHeader title="Result" />
					<Textarea label="Report" readOnly value={JSON.stringify(result, null, 2)} className="min-h-48" />
				</Card>
			)}
		</div>
	);
}
