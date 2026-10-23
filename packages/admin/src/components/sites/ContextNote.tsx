import { useEffect, useState } from "react";
import { apiData } from "../../lib/api.ts";
import { Button, ErrorText, Textarea, toast } from "../../ui/index.tsx";

interface Note {
	text: string;
	updatedAt: string | null;
}

/** A note the assistant reads before working: the agency playbook (`path` = /api/ai/context) or one client's brief. */
export function ContextNote({ path, label, hint }: { path: string; label: string; hint: string }) {
	const [saved, setSaved] = useState<Note | null>(null);
	const [text, setText] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		let live = true;
		apiData<Note>("GET", path)
			.then((note) => {
				if (!live) return;
				setSaved(note);
				setText(note.text);
			})
			.catch((e: Error) => live && setError(e.message));
		return () => {
			live = false;
		};
	}, [path]);

	const save = async () => {
		setBusy(true);
		setError(null);
		try {
			const note = await apiData<Note>("PUT", path, { text });
			setSaved(note);
			toast("Saved");
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};

	return (
		<form
			className="grid gap-2"
			onSubmit={(event) => {
				event.preventDefault();
				void save();
			}}
		>
			<Textarea
				label={label}
				hint={hint}
				rows={5}
				maxLength={20_000}
				value={text}
				disabled={!saved}
				onChange={(event) => setText(event.target.value)}
			/>
			<ErrorText>{error}</ErrorText>
			<div className="flex items-center justify-between gap-2">
				<span className="text-xs text-muted-foreground">
					{saved?.updatedAt ? `Updated ${new Date(saved.updatedAt).toLocaleString()}` : "Not written yet"}
				</span>
				<Button type="submit" size="sm" variant="secondary" disabled={busy || !saved || text === saved.text}>
					Save
				</Button>
			</div>
		</form>
	);
}
