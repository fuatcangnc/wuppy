import { ArrowUp, FileText, History, MousePointer2, Plus, Trash2, Undo2, Upload, X } from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { useEffect, useRef, useState } from "react";
import { apiData } from "../../lib/api.ts";
import { IconButton, toast } from "../../ui/index.tsx";
import {
	$aiChats,
	$aiDesignSystem,
	$aiPicking,
	$aiPicks,
	aiTargets,
	askAi,
	clearDesignSystem,
	pickKey,
	pickLabel,
	saveChat,
	setDesignSystem,
	togglePick,
	undoAiEdits,
	type AiTurn,
} from "./ai-edit.ts";
import { $selected, $tree } from "./store.ts";
import { $themeElement } from "./theme-element.ts";

interface AiConfig {
	enabled: boolean;
	models: string[];
}

const togglePicking = () => $aiPicking.set(!$aiPicking.get());

/**
 * The Agent panel: pick elements with Select (Ctrl+Alt+A; picking one again drops it), describe the change, and
 * the AI edits them on the canvas. Without picks it works on the selected element.
 */
export function AiPanel() {
	const picks = useStore($aiPicks);
	const picking = useStore($aiPicking);
	// Re-render when the selection (the fallback target) changes.
	useStore($selected);
	useStore($themeElement);
	useStore($tree);
	const [config, setConfig] = useState<AiConfig | null>(null);
	const [model, setModel] = useState("");
	const [draft, setDraft] = useState("");
	const [turns, setTurns] = useState<AiTurn[]>([]);
	const [chatId, setChatId] = useState<string>(() => crypto.randomUUID());
	const [showHistory, setShowHistory] = useState(false);
	const chats = useStore($aiChats);
	const designSystem = useStore($aiDesignSystem);
	const [busy, setBusy] = useState(false);
	const end = useRef<HTMLDivElement>(null);
	const designInput = useRef<HTMLInputElement>(null);

	useEffect(() => {
		apiData<AiConfig>("GET", "/api/ai/config")
			.then((c) => {
				setConfig(c);
				setModel(c.models[0] ?? "");
			})
			.catch((e: Error) => toast(e.message, "error"));
	}, []);
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "a") {
				e.preventDefault();
				togglePicking();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);
	// Braces: newer Chromium returns a Promise from scrollIntoView, which React would take for a cleanup.
	useEffect(() => {
		end.current?.scrollIntoView({ block: "end" });
	}, [turns]);
	useEffect(() => {
		const first = turns.find((t) => t.role === "user");
		if (first) saveChat({ id: chatId, title: first.content.slice(0, 80), turns, at: Date.now() });
	}, [turns, chatId]);
	const newChat = () => {
		setTurns([]);
		setChatId(crypto.randomUUID());
		setShowHistory(false);
	};

	const undoTurn = async (i: number) => {
		const undo = turns[i]?.undo;
		if (!undo) return;
		setBusy(true);
		try {
			await undoAiEdits(undo);
			setTurns((t) => t.map((x, j) => (j === i ? { ...x, undone: true } : x)));
		} catch (e) {
			toast((e as Error).message, "error");
		} finally {
			setBusy(false);
		}
	};
	const uploadDesignSystem = async (file?: File | null) => {
		if (!file) return;
		if (!/\.(md|markdown)$/i.test(file.name)) {
			toast("Upload a Markdown (.md) design system file", "error");
			return;
		}
		if (file.size > 100_000) {
			toast("The design system file must be at most 100 KB", "error");
			return;
		}
		try {
			const content = await file.text();
			if (!content.trim()) {
				toast("The design system file is empty", "error");
				return;
			}
			setDesignSystem({ name: file.name, content });
			toast("Design system loaded");
		} catch (e) {
			toast((e as Error).message, "error");
		} finally {
			if (designInput.current) designInput.current.value = "";
		}
	};

	const targets = aiTargets();
	const send = async () => {
		const prompt = draft.trim();
		if (!prompt || busy || !model) return;
		setBusy(true);
		setDraft("");
		const history = turns;
		setTurns((t) => [...t, { role: "user", content: prompt }]);
		try {
			const out = await askAi(model, prompt, history);
			const note = [
				out.changed ? `Changed ${out.changed} element${out.changed === 1 ? "" : "s"}` : "",
				out.inserted ? `Added ${out.inserted} section${out.inserted === 1 ? "" : "s"}` : "",
				...out.failed,
			]
				.filter(Boolean)
				.join("\n");
			setTurns((t) => [
				...t,
				{
					role: "assistant",
					content: out.reply || "Done.",
					note,
					failed: out.failed.length > 0,
					...(out.undo.blocks.length || out.undo.files.length || out.undo.inserted.length ? { undo: out.undo } : {}),
				},
			]);
		} catch (e) {
			setTurns((t) => [...t, { role: "assistant", content: (e as Error).message, note: "Failed", failed: true }]);
		} finally {
			setBusy(false);
		}
	};

	if (config && !config.enabled)
		return (
			<p className="p-3 text-sm text-muted-foreground">
				AI is not set up on this server. Set WUPPY_AI_BASE_URL, WUPPY_AI_API_KEY and WUPPY_AI_MODELS, then restart.
			</p>
		);
	return (
		<div className="flex h-full flex-col gap-3 p-3">
			<div className="flex items-center justify-between">
				<h2 className="text-sm font-semibold">AI</h2>
				<div className="flex gap-1">
					<IconButton
						label={designSystem ? "Replace design system (.md)" : "Upload design system (.md)"}
						size="icon-sm"
						onClick={() => designInput.current?.click()}
					>
						<Upload size={14} />
					</IconButton>
					<IconButton
						label="Chat history"
						size="icon-sm"
						aria-pressed={showHistory}
						onClick={() => setShowHistory(!showHistory)}
					>
						<History size={14} />
					</IconButton>
					<IconButton label="New chat" size="icon-sm" onClick={newChat}>
						<Plus size={14} />
					</IconButton>
				</div>
			</div>
			<input
				ref={designInput}
				type="file"
				accept=".md,.markdown,text/markdown,text/plain"
				className="hidden"
				aria-label="Upload design system file"
				onChange={(e) => void uploadDesignSystem(e.target.files?.[0])}
			/>
			{showHistory && (
				<ul className="grid gap-1 text-sm">
					{chats.map((c) => (
						<li key={c.id} className="flex items-center gap-1">
							<button
								type="button"
								onClick={() => {
									setChatId(c.id);
									setTurns(c.turns);
									setShowHistory(false);
								}}
								className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-left hover:bg-[#2c2c31] ${c.id === chatId ? "text-white" : "text-[#c4c4cc]"}`}
							>
								{c.title}
								<span className="ml-2 text-[11px] text-muted-foreground">{new Date(c.at).toLocaleString()}</span>
							</button>
							<IconButton
								label={`Delete chat ${c.title}`}
								size="icon-sm"
								onClick={() => {
									$aiChats.set(chats.filter((x) => x.id !== c.id));
									if (c.id === chatId) newChat();
								}}
							>
								<Trash2 size={12} />
							</IconButton>
						</li>
					))}
					{!chats.length && <li className="text-xs text-muted-foreground">No chats yet</li>}
				</ul>
			)}
			<div className="grid gap-2 text-sm">
				{turns.map((t, i) => (
					<div
						key={i}
						className={`rounded-lg px-3 py-2 whitespace-pre-wrap ${t.role === "user" ? "ml-6 bg-[#2c2c31]" : "mr-6 bg-[#19191c]"}`}
					>
						{t.content}
						{t.note && (
							<p className={`mt-1 text-[11px] ${t.failed ? "text-red-400" : "text-muted-foreground"}`}>{t.note}</p>
						)}
						{t.undo && !t.undone && (
							<button
								type="button"
								disabled={busy}
								onClick={() => void undoTurn(i)}
								className="mt-1 inline-flex items-center gap-1 text-[11px] text-sky-300 hover:underline"
							>
								<Undo2 size={12} /> Undo
							</button>
						)}
						{t.undone && <p className="mt-1 text-[11px] text-muted-foreground">Undone</p>}
					</div>
				))}
				{busy && <p className="text-xs text-muted-foreground">Thinking…</p>}
				<div ref={end} />
			</div>
			<div className="grid gap-2 rounded-xl border border-[#34343a] bg-[#19191c] p-2">
				<div className="flex flex-wrap gap-1">
					{targets.map((p) => (
						<span
							key={pickKey(p)}
							className="inline-flex items-center gap-1 rounded bg-sky-500/15 px-1.5 py-0.5 text-xs text-sky-300"
						>
							{pickLabel(p)}
							{picks.length > 0 && (
								<button type="button" aria-label={`Deselect ${pickLabel(p)}`} onClick={() => togglePick(p)}>
									<X size={10} />
								</button>
							)}
						</span>
					))}
					{!targets.length && (
						<span className="text-xs text-muted-foreground">No element picked · the AI can add a section</span>
					)}
				</div>
				{designSystem ? (
					<div className="flex items-center gap-1.5 rounded-md border border-emerald-400/20 bg-emerald-400/[0.08] px-2 py-1 text-[11px] text-emerald-300/80">
						<FileText size={12} className="shrink-0" />
						<span className="min-w-0 flex-1 truncate" title={designSystem.name}>
							{designSystem.name}
						</span>
						<span className="shrink-0 text-[10px] text-emerald-300/50">design system</span>
						<button
							type="button"
							aria-label="Remove design system"
							title="Remove the design system from the AI"
							onClick={clearDesignSystem}
							className="shrink-0 text-emerald-300/60 hover:text-white"
						>
							<X size={10} />
						</button>
					</div>
				) : (
					<button
						type="button"
						onClick={() => designInput.current?.click()}
						className="inline-flex w-fit items-center gap-1 text-[11px] text-muted-foreground hover:text-white"
					>
						<Upload size={11} /> Upload design system (.md)
					</button>
				)}
				<textarea
					aria-label="Ask the AI"
					rows={3}
					value={draft}
					placeholder="Change the title, or add an about section…"
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							void send();
						}
					}}
					className="resize-none bg-transparent text-sm outline-none"
				/>
				<div className="flex items-center gap-1">
					<select
						aria-label="Model"
						value={model}
						onChange={(e) => setModel(e.target.value)}
						className="min-w-0 flex-1 truncate bg-transparent text-xs text-muted-foreground outline-none"
					>
						{config?.models.map((m) => (
							<option key={m} value={m}>
								{m}
							</option>
						))}
					</select>
					<button
						type="button"
						aria-pressed={picking}
						title="Pick elements on the canvas (Ctrl+Alt+A); picking one again drops it"
						onClick={togglePicking}
						className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs ${picking ? "bg-sky-500/20 text-sky-300" : "bg-[#2c2c31] text-[#c4c4cc] hover:text-white"}`}
					>
						<MousePointer2 size={12} /> Select
					</button>
					<IconButton label="Send (Enter)" size="icon-sm" disabled={busy || !draft.trim()} onClick={() => void send()}>
						<ArrowUp size={14} />
					</IconButton>
				</div>
			</div>
		</div>
	);
}
