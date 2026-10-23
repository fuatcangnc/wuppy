import {
	Check,
	CircleAlert,
	Copy,
	ExternalLink,
	Plus,
	SendHorizontal,
	Sparkles,
	Trash2,
} from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { api, apiData, setApiSite, slugPath } from "../../lib/api.ts";
import { $sites, type ManagedSite } from "../../stores/sites.ts";
import { Button, EmptyState, ErrorText, Select, Spinner, Switch, Textarea, toast } from "../../ui/index.tsx";
import { ContextNote } from "../sites/ContextNote.tsx";
import { WorkspaceLayout, WorkspacePanel, WorkspaceSidebar } from "../shared/WorkspaceLayout.tsx";

interface Config {
	enabled: boolean;
	models: string[];
	agents: { id: string; name: string; description: string }[];
}
interface Step {
	tool: string;
	args: unknown;
	ok: boolean;
	result: string;
}
interface Turn {
	role: "user" | "assistant";
	content: string;
	steps?: Step[];
}
interface ChatSummary {
	id: string;
	title: string;
	agent: string;
	site: string | null;
	updatedAt: string;
}
interface Change {
	siteId: string;
	siteName: string;
	collection: string;
	slug: string;
}

/** POST /api/ai/chat as a stream: text and steps arrive as the assistant works. */
async function streamChat(body: Record<string, unknown>, onEvent: (type: string, data: unknown) => void) {
	const res = await fetch("/api/ai/chat", {
		method: "POST",
		credentials: "same-origin",
		headers: { "X-Wuppy-Request": "1", "Content-Type": "application/json" },
		body: JSON.stringify({ ...body, stream: true }),
	});
	if (!res.ok || !res.body) {
		const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
		throw new Error(json?.error?.message ?? res.statusText);
	}
	const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
	let buffer = "";
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += value;
		let end: number;
		while ((end = buffer.indexOf("\n\n")) >= 0) {
			const block = buffer.slice(0, end);
			buffer = buffer.slice(end + 2);
			const type = /^event: (.*)$/m.exec(block)?.[1];
			const data = /^data: (.*)$/m.exec(block)?.[1];
			if (type && data) onEvent(type, JSON.parse(data));
		}
	}
}

const hostOf = (url: string) => url.replace(/^https?:\/\//, "");
/** Same matching as the server's tools: id, name, host or the host's first label. */
function findSite(sites: ManagedSite[], value: string): { id: string; name: string } | null {
	if (value === "local") return { id: "local", name: "Local" };
	const needle = value.trim().toLowerCase();
	return (
		sites.find((s) => s.id === value) ??
		sites.find((s) => s.name.toLowerCase() === needle || hostOf(s.url) === needle) ??
		sites.find((s) => hostOf(s.url).startsWith(`${needle}.`)) ??
		null
	);
}

/** Entries the assistant created or edited in this chat: the workspace a person reviews and publishes. */
function changesOf(turns: Turn[], sites: ManagedSite[]): Change[] {
	const out = new Map<string, Change>();
	for (const step of turns.flatMap((t) => t.steps ?? [])) {
		if (!step.ok || (step.tool !== "create_draft" && step.tool !== "update_content")) continue;
		const args = step.args as { site?: string; collection?: string; slug?: string } | null;
		const site = args?.site ? findSite(sites, args.site) : null;
		if (!site || !args?.collection || !args.slug) continue;
		out.set(`${site.id}/${args.collection}/${args.slug}`, {
			siteId: site.id,
			siteName: site.name,
			collection: args.collection,
			slug: args.slug,
		});
	}
	return [...out.values()];
}

const STEP_LABELS: Record<string, string> = {
	list_sites: "Listed sites",
	get_context: "Read agency and client notes",
	check_site: "Checked site health",
	site_overview: "Read site overview",
	list_collections: "Read collections",
	list_content: "Listed content",
	read_content: "Read an entry",
	site_activity: "Read recent activity",
	create_draft: "Created a draft",
	update_content: "Edited an entry",
	email_site_member: "Sent an email",
};
const siteOf = (args: unknown) =>
	args && typeof args === "object" && "site" in args && typeof args.site === "string" ? args.site : null;

const STARTERS: Record<string, string[]> = {
	assistant: ["Which of my sites need attention?", "Summarise what changed on my sites this week"],
	"site-care": ["Check all my sites and list any problems", "Which hub tokens expire soon?"],
	reporter: ["Write this month's report for the selected site", "Draft a short update email for this client"],
	editor: ["Suggest three blog post ideas in the client's voice", "Draft a post announcing our summer opening hours"],
};

function openEntry(change: Change) {
	setApiSite(change.siteId);
	window.location.assign(`/admin/e/${encodeURIComponent(change.collection)}/${slugPath(change.slug)}`);
}

export function AssistantPage() {
	const search = useSearch({ strict: false }) as { site?: string };
	const sitesState = useStore($sites);
	const sites = sitesState.status === "ready" ? sitesState.sites : [];
	const canManage = sitesState.status === "ready" && sitesState.canManage;
	const [config, setConfig] = useState<Config | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [agent, setAgent] = useState("assistant");
	const [model, setModel] = useState("");
	const [site, setSite] = useState(search.site ?? "");
	const [allowWrites, setAllowWrites] = useState(false);
	const [turns, setTurns] = useState<Turn[]>([]);
	const [draft, setDraft] = useState("");
	const [busy, setBusy] = useState(false);
	const [chatId, setChatId] = useState<string | null>(null);
	const [savedChats, setSavedChats] = useState<ChatSummary[]>([]);
	const end = useRef<HTMLDivElement>(null);
	const loadHistory = () =>
		apiData<ChatSummary[]>("GET", "/api/ai/chats")
			.then(setSavedChats)
			.catch(() => setSavedChats([]));

	useEffect(() => {
		apiData<Config>("GET", "/api/ai/config")
			.then((c) => {
				setConfig(c);
				setModel(c.models[0] ?? "");
			})
			.catch((e: Error) => setError(e.message));
		void loadHistory();
	}, []);
	// Braces matter: newer browsers return a Promise from scrollIntoView, and React would call it as a cleanup.
	useEffect(() => {
		end.current?.scrollIntoView({ block: "end" });
	}, [turns, busy]);

	const send = async (text: string) => {
		const content = text.trim();
		if (!content || busy) return;
		const asked: Turn[] = [...turns, { role: "user", content }];
		setTurns(asked);
		setDraft("");
		setBusy(true);
		setError(null);
		let live: Turn = { role: "assistant", content: "", steps: [] };
		const show = (turn: Turn) => {
			live = turn;
			setTurns([...asked, turn]);
		};
		try {
			await streamChat(
				{
					agent,
					model,
					site: site || undefined,
					allowWrites,
					chatId: chatId ?? undefined,
					messages: asked.slice(-40),
				},
				(type, data) => {
					if (type === "text") show({ ...live, content: live.content + (data as { text: string }).text });
					if (type === "step") show({ ...live, steps: [...(live.steps ?? []), (data as { step: Step }).step] });
					if (type === "error") throw new Error((data as { message: string }).message);
					if (type === "done") {
						const result = data as { reply: string; steps: Step[]; chatId: string | null };
						show({ role: "assistant", content: result.reply || "(no answer)", steps: result.steps });
						setChatId(result.chatId);
					}
				},
			);
			// One "yes" per message: the next message is read-only again unless allowed again.
			setAllowWrites(false);
			void loadHistory();
		} catch (e) {
			setError((e as Error).message);
			setTurns(turns);
			setDraft(content);
		} finally {
			setBusy(false);
		}
	};

	const openChat = async (id: string) => {
		try {
			const saved = await apiData<ChatSummary & { turns: Turn[] }>("GET", `/api/ai/chats/${id}`);
			setTurns(saved.turns);
			setChatId(saved.id);
			setAgent(saved.agent);
			setSite(saved.site ?? "");
			setError(null);
		} catch (e) {
			setError((e as Error).message);
		}
	};
	const newChat = () => {
		setTurns([]);
		setChatId(null);
		setError(null);
	};
	const deleteChat = async (id: string) => {
		try {
			await api("DELETE", `/api/ai/chats/${id}`);
			if (id === chatId) newChat();
			void loadHistory();
		} catch (e) {
			toast((e as Error).message, "error");
		}
	};
	const changes = changesOf(turns, sites);

	const mcpCommand = `claude mcp add --transport http wuppy ${location.origin}/api/mcp --header "Authorization: Bearer <API token>"`;
	const siteName = (id: string) => sites.find((s) => s.id === id)?.name ?? id;

	return (
		<WorkspaceLayout>
			<WorkspaceSidebar>
				<div className="flex items-center gap-2 border-b border-border px-4 py-3">
					<Sparkles size={16} />
					<h1 className="text-sm font-semibold">Assistant</h1>
				</div>
				<div className="custom-scrollbar grid min-h-0 flex-1 content-start gap-5 overflow-y-auto p-4">
					<div className="grid gap-2">
						<div className="flex items-center justify-between">
							<p className="text-xs font-medium tracking-wider text-zinc-400 uppercase">Chats</p>
							<Button size="sm" variant="ghost" onClick={newChat}>
								<Plus size={13} /> New
							</Button>
						</div>
						{savedChats.length === 0 ? (
							<p className="text-xs text-muted-foreground">Your chats are saved here.</p>
						) : (
							<ul className="grid max-h-56 gap-0.5 overflow-y-auto" aria-label="Saved chats">
								{savedChats
									.filter((h) => !site || h.site === site)
									.slice(0, 30)
									.map((h) => (
										<li key={h.id} className="group flex items-center gap-1">
											<button
												type="button"
												aria-current={h.id === chatId ? "true" : undefined}
												onClick={() => void openChat(h.id)}
												className={`min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-xs ${
													h.id === chatId ? "bg-secondary" : "hover:bg-muted/50"
												}`}
												title={h.title}
											>
												{h.title}
											</button>
											<button
												type="button"
												aria-label={`Delete chat ${h.title}`}
												className="rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive focus:opacity-100"
												onClick={() => void deleteChat(h.id)}
											>
												<Trash2 size={12} />
											</button>
										</li>
									))}
							</ul>
						)}
					</div>
					{changes.length > 0 && (
						<div className="grid gap-2">
							<p className="text-xs font-medium tracking-wider text-zinc-400 uppercase">Changes to review</p>
							<p className="text-xs text-muted-foreground">
								What the assistant drafted or edited in this chat. Open each one to check it and publish.
							</p>
							<ul className="grid gap-1">
								{changes.map((change) => (
									<li key={`${change.siteId}/${change.collection}/${change.slug}`}>
										<button
											type="button"
											onClick={() => openEntry(change)}
											className="flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left text-xs hover:bg-muted/50"
										>
											<span className="grid min-w-0 flex-1">
												<span className="truncate font-medium">{change.slug}</span>
												<span className="truncate text-muted-foreground">
													{change.siteName} · {change.collection}
												</span>
											</span>
											<ExternalLink size={12} />
										</button>
									</li>
								))}
							</ul>
						</div>
					)}
					<div className="grid gap-2">
						<p className="text-xs font-medium tracking-wider text-zinc-400 uppercase">Agent</p>
						<ul className="grid gap-1.5" aria-label="Agent">
							{(config?.agents ?? []).map((a) => (
								<li key={a.id}>
									<button
										type="button"
										aria-pressed={agent === a.id}
										onClick={() => setAgent(a.id)}
										className={`flex w-full items-start gap-2 rounded-lg border p-2.5 text-left transition ${
											agent === a.id ? "border-primary/50 bg-secondary" : "border-border hover:bg-muted/50"
										}`}
									>
										<span className="grid flex-1 gap-0.5">
											<span className="text-xs font-medium">{a.name}</span>
											<span className="text-[11px] text-muted-foreground">{a.description}</span>
										</span>
										{agent === a.id && <Check size={14} className="mt-0.5 text-primary" />}
									</button>
								</li>
							))}
						</ul>
					</div>
					<Select label="Model" value={model} onChange={(event) => setModel(event.target.value)}>
						{(config?.models ?? []).map((m) => (
							<option key={m} value={m}>
								{m}
							</option>
						))}
					</Select>
					<Select label="Focus" value={site} onChange={(event) => setSite(event.target.value)}>
						<option value="">All my sites</option>
						{sitesState.status === "ready" && sitesState.localAllowed && (
							<option value="local">This site (Local)</option>
						)}
						{sites.map((s) => (
							<option key={s.id} value={s.id}>
								{s.name}
							</option>
						))}
					</Select>
					{canManage && (
						<>
							<ContextNote
								path="/api/ai/context"
								label="Agency playbook"
								hint="How your agency works: tone, standards, report format. Every agent reads it."
							/>
							<div className="grid gap-2">
								<p className="text-xs font-medium tracking-wider text-zinc-400 uppercase">
									Use in Claude, Cursor, VS Code
								</p>
								<p className="text-xs text-muted-foreground">
									Create an API token under Users, then add this MCP server. Your tools see the same sites you do.
								</p>
								<code className="rounded-md border border-border bg-secondary p-2 text-[11px] break-all">
									{mcpCommand}
								</code>
								<Button
									size="sm"
									variant="secondary"
									onClick={() =>
										void navigator.clipboard.writeText(mcpCommand).then(
											() => toast("Copied"),
											() => toast("Copy failed", "error"),
										)
									}
								>
									<Copy size={13} /> Copy command
								</Button>
								<p className="text-xs text-muted-foreground">
									Your own apps: any OpenAI client with base URL{" "}
									<code className="break-all">{location.origin}/api/v1</code>, the same API token, and an agent id (
									{(config?.agents ?? []).map((a) => a.id).join(", ")}) as the model. Read-only.
								</p>
							</div>
						</>
					)}
				</div>
			</WorkspaceSidebar>

			<WorkspacePanel className="grid-rows-[minmax(0,1fr)_auto]">
				{config && !config.enabled ? (
					<div className="grid place-items-center p-6">
						<EmptyState
							title="The assistant is not set up"
							description="On the server set WUPPY_AI_BASE_URL (any OpenAI-compatible endpoint, e.g. OpenRouter), WUPPY_AI_API_KEY and WUPPY_AI_MODELS, then restart. MCP works without it."
						/>
					</div>
				) : (
					<>
						<div className="custom-scrollbar min-h-0 overflow-y-auto p-6" aria-live="polite">
							{!config ? (
								<Spinner />
							) : turns.length === 0 ? (
								<div className="mx-auto grid max-w-lg gap-3 pt-10 text-center">
									<p className="text-lg font-semibold">What should we do?</p>
									<p className="text-sm text-muted-foreground">
										The assistant works with the sites you can open, your agency playbook and each client's brief.
									</p>
									<div className="grid gap-2">
										{(STARTERS[agent] ?? []).map((s) => (
											<button
												key={s}
												type="button"
												className="rounded-lg border border-border p-2.5 text-left text-sm hover:bg-muted/50"
												onClick={() => setDraft(s)}
											>
												{s}
											</button>
										))}
									</div>
								</div>
							) : (
								<ol className="mx-auto grid max-w-3xl gap-5">
									{turns.map((turn, i) => (
										<li key={i} className={turn.role === "user" ? "justify-self-end" : ""}>
											{turn.role === "user" ? (
												<p className="max-w-xl rounded-xl border border-border bg-card px-3 py-2 text-sm whitespace-pre-wrap">
													{turn.content}
												</p>
											) : (
												<div className="grid gap-2">
													{turn.steps && turn.steps.length > 0 && (
														<ul className="grid w-fit gap-1 rounded-xl border border-border bg-card p-2.5 text-xs">
															{turn.steps.map((step, j) => (
																<li key={j} className="flex items-center gap-2" title={step.result}>
																	{step.ok ? (
																		<Check size={13} className="text-emerald-600" />
																	) : (
																		<CircleAlert size={13} className="text-destructive" />
																	)}
																	<span>
																		{STEP_LABELS[step.tool] ?? step.tool}
																		{siteOf(step.args) && (
																			<span className="text-muted-foreground"> · {siteName(siteOf(step.args)!)}</span>
																		)}
																	</span>
																</li>
															))}
														</ul>
													)}
													<p className="text-sm leading-relaxed whitespace-pre-wrap">{turn.content}</p>
												</div>
											)}
										</li>
									))}
									{busy && (
										<li className="flex items-center gap-2 text-sm text-muted-foreground">
											<Spinner /> Working…
										</li>
									)}
								</ol>
							)}
							<div ref={end} />
						</div>
						<form
							className="grid gap-2 border-t border-border p-4"
							onSubmit={(event) => {
								event.preventDefault();
								void send(draft);
							}}
						>
							<ErrorText>{error}</ErrorText>
							<Textarea
								aria-label="Message"
								rows={3}
								maxLength={20_000}
								placeholder="Ask about your sites, or give the assistant a job…"
								value={draft}
								onChange={(event) => setDraft(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter" && !event.shiftKey) {
										event.preventDefault();
										void send(draft);
									}
								}}
							/>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<Switch
									label="Allow changes for this message (drafts, edits, emails)"
									checked={allowWrites}
									onChange={(event) => setAllowWrites(event.target.checked)}
								/>
								<Button type="submit" disabled={busy || !draft.trim() || !model}>
									<SendHorizontal size={14} /> Send
								</Button>
							</div>
						</form>
					</>
				)}
			</WorkspacePanel>
		</WorkspaceLayout>
	);
}
