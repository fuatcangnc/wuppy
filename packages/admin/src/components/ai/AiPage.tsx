import {
	Bot,
	ChartNoAxesColumn,
	ChevronRight,
	Copy,
	Database,
	FileText,
	Link as LinkIcon,
	Settings2,
	Sparkles,
} from "@react-zero-ui/icon-sprite";
import { useEffect, useState } from "react";
import { apiData } from "../../lib/api.ts";
import { Button, Input, toast } from "../../ui/index.tsx";
import { StudioBar } from "../shared/StudioBar.tsx";

type Section = "providers" | "defaults" | "mcp" | "prompts" | "audit";
type ProviderId = "anthropic" | "openai" | "openrouter" | "ollama" | "custom";

const SECTIONS = [
	{ id: "providers", label: "Providers", icon: Database },
	{ id: "defaults", label: "Defaults", icon: Settings2 },
	{ id: "mcp", label: "MCP connections", icon: LinkIcon },
	{ id: "prompts", label: "Theme prompts", icon: FileText },
	{ id: "audit", label: "Audit", icon: ChartNoAxesColumn },
] as const;

const PROVIDERS = [
	{
		id: "anthropic",
		label: "Anthropic",
		short: "Claude models",
		desc: "Claude models with strong tool use and long-context reasoning.",
		auth: "apiKey",
		mark: "A",
		tone: "from-[#d97706] to-[#7c2d12]",
	},
	{
		id: "openai",
		label: "OpenAI",
		short: "GPT models",
		desc: "General-purpose language and multimodal models from OpenAI.",
		auth: "apiKey",
		mark: "O",
		tone: "from-[#0f766e] to-[#134e4a]",
	},
	{
		id: "openrouter",
		label: "OpenRouter",
		short: "Multi-provider models",
		desc: "Route requests to models from multiple providers through one API.",
		auth: "apiKey",
		mark: "O",
		tone: "from-[#4f46e5] to-[#312e81]",
	},
	{
		id: "ollama",
		label: "Ollama",
		short: "Local models",
		desc: "Run local models on infrastructure you control.",
		auth: "baseUrl",
		mark: "O",
		tone: "from-[#0ea5e9] to-[#0c4a6e]",
	},
	{
		id: "custom",
		label: "Custom endpoint",
		short: "OpenAI-compatible API",
		desc: "Connect any OpenAI-compatible API endpoint.",
		auth: "baseUrl",
		mark: "C",
		tone: "from-[#64748b] to-[#1e293b]",
	},
] as const;

const ROUTES = [
	{ id: "site", label: "Site editor", desc: "Visual editor chat and page-building tools.", icon: Bot },
	{ id: "content", label: "Content", desc: "Writing, rewriting and metadata tools.", icon: Sparkles },
	{ id: "data", label: "Data", desc: "Table and row copilot actions.", icon: Database },
	{ id: "plugins", label: "Plugins", desc: "Plugin-provided AI features.", icon: Settings2 },
] as const;

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
	return (
		<div className={`min-h-0 overflow-y-auto border-r border-[#2a2a2d] bg-[#19191b] ${className}`}>{children}</div>
	);
}

function ListHeader({ title, add }: { title: string; add?: string }) {
	return (
		<div className="grid gap-1 px-4 pb-2 pt-4">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold text-white">{title}</h2>
				{add && <span className="text-[10px] font-semibold tracking-wider text-[#a1a1aa]">{add}</span>}
			</div>
		</div>
	);
}

function ProviderMark({ mark, tone }: { mark: string; tone: string }) {
	return (
		<span
			className={`grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${tone} text-sm font-bold text-white`}
		>
			{mark}
		</span>
	);
}

function ProvidersSection({ onDefaults }: { onDefaults: () => void }) {
	const [provider, setProvider] = useState<ProviderId>("anthropic");
	const [connected, setConnected] = useState(false);
	const current = PROVIDERS.find((item) => item.id === provider)!;
	return (
		<div className="flex min-h-0 flex-1">
			<Panel className="w-[300px] shrink-0">
				<ListHeader title="Providers" add="ADD PROVIDER" />
				<div className="grid gap-1 px-3">
					{PROVIDERS.map((item) => (
						<button
							key={item.id}
							type="button"
							onClick={() => {
								setProvider(item.id);
								setConnected(false);
							}}
							className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${provider === item.id ? "bg-[#2b2b2e]" : "hover:bg-[#202023]"}`}
						>
							<ProviderMark mark={item.mark} tone={item.tone} />
							<span className="min-w-0 flex-1">
								<span className="block text-sm font-medium text-white">{item.label}</span>
								<span className="block text-[11px] text-[#a1a1aa]">{item.short}</span>
							</span>
							<ChevronRight size={14} className="text-[#71717a]" />
						</button>
					))}
				</div>
			</Panel>
			<div className="min-h-0 flex-1 overflow-y-auto bg-[#1d1d1f] px-10 py-8">
				<div className="mx-auto grid max-w-3xl gap-6">
					<div className="flex items-start gap-4">
						<ProviderMark mark={current.mark} tone={current.tone} />
						<div className="grid gap-1">
							<p className="text-[10px] font-semibold tracking-[0.12em] text-[#a1a1aa] uppercase">Add provider</p>
							<h2 className="text-2xl font-semibold text-white">Connect {current.label}</h2>
							<p className="text-sm text-[#a1a1aa]">{current.desc}</p>
						</div>
					</div>
					<div className="border-t border-[#2f2f31] pt-5">
						<h3 className="text-base font-semibold text-white">Connection details</h3>
						<p className="mt-1 text-sm text-[#a1a1aa]">
							Wuppy validates and encrypts the credential before storing it.
						</p>
						<div className="mt-6 grid gap-5">
							<label className="grid grid-cols-[130px_1fr] items-start gap-4 text-sm">
								<span className="pt-2 text-[#d4d4d8]">Display label</span>
								<span className="grid gap-1">
									<Input aria-label="Display label" placeholder={`e.g. ${current.label} production`} />
									<span className="text-[11px] text-[#71717a]">
										Use a name teammates will recognize in model pickers.
									</span>
								</span>
							</label>
							<label className="grid grid-cols-[130px_1fr] items-start gap-4 text-sm">
								<span className="pt-2 text-[#d4d4d8]">{current.auth === "apiKey" ? "API key" : "Base URL"}</span>
								<span className="grid gap-1">
									<Input
										aria-label={current.auth === "apiKey" ? "API key" : "Base URL"}
										type={current.auth === "apiKey" ? "password" : "url"}
										placeholder={current.auth === "apiKey" ? "sk-ant-…" : "http://localhost:11434/v1"}
									/>
									<span className="text-[11px] text-[#71717a]">
										{current.auth === "apiKey"
											? "Stored encrypted and never displayed again."
											: "Wuppy calls this endpoint from the server; local URLs stay on this machine."}
									</span>
								</span>
							</label>
						</div>
					</div>
					<div className="flex justify-end border-t border-[#2f2f31] pt-5">
						<Button
							variant="secondary"
							className="rounded-full border-white bg-white text-[#18181b] hover:bg-[#e4e4e7]"
							onClick={() => {
								setConnected(true);
								toast(`${current.label} connection saved (UI preview)`);
								onDefaults();
							}}
						>
							{connected ? "Connected" : `Connect ${current.label}`}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

function DefaultsSection({ onProviders }: { onProviders: () => void }) {
	const [route, setRoute] = useState("site");
	const current = ROUTES.find((item) => item.id === route)!;
	return (
		<div className="flex min-h-0 flex-1">
			<Panel className="w-[300px] shrink-0">
				<ListHeader title="Defaults" add="MODEL ROUTING" />
				<div className="grid gap-1 px-3">
					{ROUTES.map((item) => {
						const Icon = item.icon;
						return (
							<button
								key={item.id}
								type="button"
								onClick={() => setRoute(item.id)}
								className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left ${route === item.id ? "bg-[#2b2b2e]" : "hover:bg-[#202023]"}`}
							>
								<span className="grid size-9 place-items-center rounded-lg bg-[#2b2b2e] text-[#d4d4d8]">
									<Icon size={16} />
								</span>
								<span className="min-w-0 flex-1">
									<span className="block text-sm font-medium text-white">{item.label}</span>
									<span className="block text-[11px] text-[#a1a1aa]">Not configured</span>
								</span>
								<ChevronRight size={14} className="text-[#71717a]" />
							</button>
						);
					})}
				</div>
			</Panel>
			<div className="min-h-0 flex-1 overflow-y-auto bg-[#1d1d1f] px-10 py-8">
				<div className="mx-auto grid max-w-3xl gap-6">
					<div className="flex items-start gap-4">
						<span className="grid size-12 place-items-center rounded-xl bg-[#2b2b2e] text-[#d4d4d8]">
							<current.icon size={22} />
						</span>
						<div className="grid gap-1">
							<p className="text-[10px] font-semibold tracking-[0.12em] text-[#a1a1aa] uppercase">Model routing</p>
							<h2 className="text-2xl font-semibold text-white">{current.label}</h2>
							<p className="text-sm text-[#a1a1aa]">{current.desc}</p>
						</div>
					</div>
					<div className="border-t border-[#2f2f31] pt-5">
						<h3 className="text-base font-semibold text-white">Default model</h3>
						<p className="mt-1 text-sm text-[#a1a1aa]">
							Users can still choose another available model for an individual conversation.
						</p>
						<div className="mt-5 flex items-center justify-between gap-6 rounded-xl bg-[#262628] px-5 py-4">
							<div>
								<p className="text-sm font-semibold text-white">Connect a provider first</p>
								<p className="mt-1 text-xs text-[#a1a1aa]">
									Model routing becomes available after at least one credential is ready.
								</p>
							</div>
							<Button
								variant="secondary"
								className="rounded-full border-white bg-white text-[#18181b] hover:bg-[#e4e4e7]"
								onClick={onProviders}
							>
								Go to Providers
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function McpSection() {
	const [kind, setKind] = useState("oauth");
	const endpoint = `${typeof window === "undefined" ? "" : window.location.origin}/api/mcp`;
	return (
		<div className="flex min-h-0 flex-1">
			<Panel className="w-[300px] shrink-0">
				<ListHeader title="MCP connections" add="ADD CONNECTION" />
				<div className="grid gap-1 px-3">
					{[
						{ id: "oauth", label: "Remote OAuth", desc: "Hosted clients" },
						{ id: "token", label: "Personal token", desc: "Local and CLI clients" },
					].map((item) => (
						<button
							key={item.id}
							type="button"
							onClick={() => setKind(item.id)}
							className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left ${kind === item.id ? "bg-[#2b2b2e]" : "hover:bg-[#202023]"}`}
						>
							<span className="grid size-9 place-items-center rounded-lg bg-[#123b32] text-[#6ee7b7]">
								<LinkIcon size={16} />
							</span>
							<span className="min-w-0 flex-1">
								<span className="block text-sm font-medium text-white">{item.label}</span>
								<span className="block text-[11px] text-[#a1a1aa]">{item.desc}</span>
							</span>
							<ChevronRight size={14} className="text-[#71717a]" />
						</button>
					))}
				</div>
			</Panel>
			<div className="min-h-0 flex-1 overflow-y-auto bg-[#1d1d1f] px-10 py-8">
				<div className="mx-auto grid max-w-3xl gap-6">
					<div className="flex items-start gap-4">
						<span className="grid size-12 place-items-center rounded-xl bg-[#123b32] text-[#6ee7b7]">
							<LinkIcon size={22} />
						</span>
						<div className="grid gap-1">
							<p className="text-[10px] font-semibold tracking-[0.12em] text-[#a1a1aa] uppercase">Hosted OAuth</p>
							<h2 className="text-2xl font-semibold text-white">
								{kind === "oauth" ? "Connect a remote client" : "Create a personal token"}
							</h2>
							<p className="text-sm text-[#a1a1aa]">
								{kind === "oauth"
									? "Claude, ChatGPT, and remote agents authorize through Wuppy."
									: "Use a token for local scripts and CLI tools."}
							</p>
						</div>
					</div>
					<div className="border-t border-[#2f2f31] pt-5">
						<h3 className="text-base font-semibold text-white">
							{kind === "oauth" ? "Remote MCP URL" : "Bearer token"}
						</h3>
						<p className="mt-1 text-sm text-[#a1a1aa]">
							{kind === "oauth"
								? "The client returns here so you can choose permissions and approve access."
								: "The token is shown once. Store it in your client configuration."}
						</p>
						<p className="mt-6 text-[10px] font-semibold tracking-wider text-[#a1a1aa] uppercase">Connector endpoint</p>
						<div className="mt-2 flex items-center gap-2 rounded-lg border border-[#3f3f42] bg-[#262628] px-4 py-2">
							<code className="min-w-0 flex-1 truncate text-sm text-[#d4d4d8]">{endpoint}</code>
							<Button
								size="sm"
								variant="secondary"
								className="shrink-0 rounded-md border-[#3f3f42] bg-[#303033] text-[#e4e4e7]"
								onClick={() => void navigator.clipboard.writeText(endpoint).then(() => toast("URL copied"))}
							>
								<Copy size={13} /> Copy URL
							</Button>
						</div>
						<div className="mt-4 flex items-start gap-3 rounded-xl bg-[#262628] px-4 py-3">
							<span className="grid size-7 place-items-center rounded-full bg-[#d4a72c] text-[#18181b]">◆</span>
							<div>
								<p className="text-sm font-medium text-white">Available on this device only</p>
								<p className="text-xs text-[#a1a1aa]">
									Hosted clients connect from the cloud. Publish Wuppy at a public HTTPS URL before adding this
									connector.
								</p>
							</div>
						</div>
						<div className="mt-6 border-t border-[#2f2f31] pt-5 text-sm text-[#a1a1aa]">
							<h4 className="font-semibold text-white">Connect from the client</h4>
							<p className="mt-1">OAuth Client ID and Secret are discovered automatically.</p>
							<ol className="mt-3 grid list-decimal gap-1 pl-5">
								<li>Open the client's connector settings and choose a custom MCP connector.</li>
								<li>Paste the URL above. Leave OAuth Client ID and Secret empty.</li>
								<li>Choose Connect, then approve the requested capabilities.</li>
							</ol>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

interface ThemePrompts {
	guide: string;
	prompts: { id: string; label: string; prompt: string }[];
}

const copy = (text: string, done: string) =>
	void navigator.clipboard.writeText(text).then(
		() => toast(done),
		() => toast("Copy failed; select the text and copy it by hand"),
	);

/** Prompts for a coding agent (Claude Code, Cursor…) that adapts the theme; each is copied with the guide it follows. */
function PromptsSection() {
	const [data, setData] = useState<ThemePrompts | null>(null);
	const [error, setError] = useState("");
	useEffect(() => {
		void apiData<ThemePrompts>("GET", "/api/ai/theme-prompts").then(setData, (e: Error) => setError(e.message));
	}, []);
	return (
		<div className="min-h-0 flex-1 overflow-y-auto bg-[#1d1d1f] px-10 py-8">
			<div className="mx-auto grid max-w-3xl gap-6">
				<div className="grid gap-1">
					<p className="text-[10px] font-semibold tracking-[0.12em] text-[#a1a1aa] uppercase">Coding agents</p>
					<h2 className="text-2xl font-semibold text-white">Theme prompts</h2>
					<p className="text-sm text-[#a1a1aa]">
						Paste one into Claude Code, Cursor, opencode or ChatGPT inside your theme's repository. Each prompt is
						copied together with the WuppyCMS theme guide, so the agent knows how Wuppy stores menus, settings and
						content. Push the result, then press Rebuild under Themes.
					</p>
				</div>
				{error && <p className="text-sm text-red-400">{error}</p>}
				{data && (
					<>
						<div className="flex items-center justify-between gap-4 rounded-xl bg-[#262628] px-5 py-4">
							<div>
								<p className="text-sm font-semibold text-white">Theme guide (AGENTS.md)</p>
								<p className="mt-1 text-xs text-[#a1a1aa]">
									Save it as AGENTS.md in the theme; agents then read it by themselves.
								</p>
							</div>
							<Button
								size="sm"
								variant="secondary"
								className="shrink-0 rounded-md border-[#3f3f42] bg-[#303033] text-[#e4e4e7]"
								onClick={() => copy(data.guide, "Guide copied")}
							>
								<Copy size={13} /> Copy guide
							</Button>
						</div>
						<ul className="grid gap-3" aria-label="Theme prompts">
							{data.prompts.map((p) => (
								<li key={p.id} className="grid gap-3 rounded-xl border border-[#2f2f31] bg-[#1b1b1d] p-4">
									<div className="flex items-center justify-between gap-4">
										<h3 className="text-sm font-semibold text-white">{p.label}</h3>
										<Button
											size="sm"
											variant="secondary"
											aria-label={`Copy prompt: ${p.label}`}
											className="shrink-0 rounded-md border-[#3f3f42] bg-[#303033] text-[#e4e4e7]"
											onClick={() => copy(`${p.prompt}\n\n---\n\n${data.guide}`, "Prompt copied")}
										>
											<Copy size={13} /> Copy
										</Button>
									</div>
									<p className="text-sm text-[#d4d4d8]">{p.prompt}</p>
								</li>
							))}
						</ul>
					</>
				)}
			</div>
		</div>
	);
}

function AuditSection() {
	const [surface, setSurface] = useState("all");
	return (
		<div className="flex min-h-0 flex-1">
			<Panel className="w-[300px] shrink-0">
				<ListHeader title="Audit" add="USAGE" />
				<div className="grid gap-1 px-3">
					{["all", "site", "content", "data", "plugins"].map((item) => (
						<button
							key={item}
							type="button"
							onClick={() => setSurface(item)}
							className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left capitalize ${surface === item ? "bg-[#2b2b2e]" : "hover:bg-[#202023]"}`}
						>
							<span className="grid size-9 place-items-center rounded-lg bg-[#2b2b2e] text-[#d4d4d8]">
								<ChartNoAxesColumn size={16} />
							</span>
							<span className="flex-1 text-sm text-white">{item === "all" ? "All activity" : item}</span>
							<ChevronRight size={14} className="text-[#71717a]" />
						</button>
					))}
				</div>
			</Panel>
			<div className="min-h-0 flex-1 overflow-y-auto bg-[#1d1d1f] px-10 py-8">
				<div className="mx-auto grid max-w-5xl gap-6">
					<div>
						<p className="text-[10px] font-semibold tracking-[0.12em] text-[#a1a1aa] uppercase">Usage</p>
						<h2 className="mt-1 text-2xl font-semibold text-white">AI activity</h2>
						<p className="mt-1 text-sm text-[#a1a1aa]">Requests, tokens, and outcomes across the site.</p>
					</div>
					<div className="rounded-xl border border-[#2f2f31] bg-[#1b1b1d] p-10 text-center text-sm text-[#a1a1aa]">
						No AI usage recorded yet. Connect a provider and run an AI action to see activity here.
					</div>
				</div>
			</div>
		</div>
	);
}

export function AiPage() {
	const [section, setSection] = useState<Section>("providers");
	return (
		<div className="fixed inset-0 z-40 flex flex-col bg-[#1d1d1f] text-[#f4f4f5]">
			<StudioBar active="ai" />
			<div className="flex min-h-0 flex-1">
				<aside className="w-[236px] shrink-0 border-r border-[#2a2a2d] bg-[#19191b] p-3">
					<div className="px-1 py-2">
						<h1 className="text-lg font-semibold text-white">AI</h1>
						<p className="mt-1 text-[11px] leading-4 text-[#a1a1aa]">Models, defaults, connections, and usage.</p>
					</div>
					<nav className="mt-4 grid gap-1" aria-label="AI settings">
						{SECTIONS.map(({ id, label, icon: Icon }) => (
							<button
								key={id}
								type="button"
								onClick={() => setSection(id)}
								aria-current={section === id ? "page" : undefined}
								className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs ${section === id ? "bg-[#2b2b2e] font-medium text-white" : "text-[#d4d4d8] hover:bg-[#202023]"}`}
							>
								<Icon size={14} />
								{label}
							</button>
						))}
					</nav>
				</aside>
				{section === "providers" && <ProvidersSection onDefaults={() => setSection("defaults")} />}
				{section === "defaults" && <DefaultsSection onProviders={() => setSection("providers")} />}
				{section === "mcp" && <McpSection />}
				{section === "prompts" && <PromptsSection />}
				{section === "audit" && <AuditSection />}
			</div>
		</div>
	);
}
