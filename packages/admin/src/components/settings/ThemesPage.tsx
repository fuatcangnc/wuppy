import { useCallback, useEffect, useState } from "react";
import { apiData } from "../../lib/api.ts";
import {
	Badge,
	Button,
	Card,
	CardHeader,
	EmptyState,
	ErrorText,
	GhostButton,
	Input,
	PageHeader,
	Spinner,
	toast,
} from "../../ui/index.tsx";

interface Repo {
	repo: string;
	private: boolean;
	description: string;
}
interface ThemeJob {
	repo: string;
	status: "running" | "done" | "failed";
	step: string;
	error?: string;
}
interface ThemeState {
	active: string | null;
	installed: string[];
	job: ThemeJob | null;
	github: { configured: boolean; connected: boolean };
}

/** After a switch the server restarts; reload once it answers again. */
async function waitForRestart() {
	await new Promise((r) => setTimeout(r, 2000));
	for (let i = 0; i < 60; i++) {
		if (
			await fetch("/api/setup").then(
				(r) => r.ok,
				() => false,
			)
		)
			return window.location.reload();
		await new Promise((r) => setTimeout(r, 2000));
	}
	toast("The server did not come back. Check its logs.", "error");
}

// GitHub's consent page, then back to this page through /api/themes/github/callback.
const connect = () => window.location.assign("/api/themes/github/connect");

export function ThemesPage() {
	const [state, setState] = useState<ThemeState | null>(null);
	const [repos, setRepos] = useState<Repo[] | null>(null);
	const [query, setQuery] = useState("");
	const [error, setError] = useState<string | null>(null);
	// Set by the OAuth callback when GitHub said no or the sign-in expired.
	useEffect(() => {
		const failed = new URLSearchParams(window.location.search).get("github_error");
		if (!failed) return;
		toast(`GitHub: ${failed}`, "error");
		window.history.replaceState(null, "", window.location.pathname);
	}, []);
	const [restarting, setRestarting] = useState(false);

	const load = useCallback(
		() =>
			apiData<ThemeState>("GET", "/api/themes")
				.then(setState)
				.catch((e: Error) => setError(e.message)),
		[],
	);
	useEffect(() => void load(), [load]);

	const connected = state?.github.connected;
	useEffect(() => {
		if (!connected) return;
		void apiData<Repo[]>("GET", "/api/themes/github/repos")
			.then(setRepos)
			.catch((e: Error) => {
				setError(e.message);
				// An expired token is dropped by the server: reload so Connect GitHub shows again.
				void load();
			});
	}, [connected, load]);

	// Poll while an install runs; it switches and restarts by itself when the build succeeds.
	const running = state?.job?.status === "running";
	useEffect(() => {
		if (!running) return;
		const timer = setInterval(() => {
			void apiData<ThemeState>("GET", "/api/themes").then((next) => {
				setState(next);
				if (next.job?.status === "done") {
					setRestarting(true);
					void waitForRestart();
				}
			});
		}, 2000);
		return () => clearInterval(timer);
	}, [running]);

	const disconnect = () =>
		void apiData("DELETE", "/api/themes/github")
			.then(() => {
				setRepos(null);
				void load();
			})
			.catch((e: Error) => toast(e.message, "error"));

	const install = (repo: string) => {
		if (!confirm(`Install ${repo} and make it this site? Its install scripts and build run on this server.`)) return;
		void apiData<ThemeJob>("POST", "/api/themes/github/install", { repo })
			.then((job) => setState((s) => s && { ...s, job }))
			.catch((e: Error) => toast(e.message, "error"));
	};

	const activate = (repo: string | null) =>
		void apiData<{ restarting: boolean }>("POST", "/api/themes/activate", { repo })
			.then((r) => {
				if (r.restarting) {
					setRestarting(true);
					void waitForRestart();
				} else {
					toast("Saved. Restart the server to switch.");
					void load();
				}
			})
			.catch((e: Error) => toast(e.message, "error"));

	if (!state) return error ? <ErrorText>{error}</ErrorText> : <Spinner />;

	const shown = (repos ?? []).filter((r) => r.repo.toLowerCase().includes(query.toLowerCase()));
	const job = state.job;

	return (
		<div className="grid gap-4">
			<PageHeader
				title="Themes"
				description="Use an Astro site from your GitHub as this site's design. It is cloned, wrapped and built on this server."
			/>
			<ErrorText>{error}</ErrorText>
			{restarting && (
				<p className="flex items-center gap-2 text-sm">
					<Spinner /> Switching and restarting the server…
				</p>
			)}

			<Card>
				<CardHeader title="Active" description="Switch between the built-in site and the themes built here." />
				<ul className="divide-y">
					{[null, ...state.installed].map((repo) => (
						<li key={repo ?? "built-in"} className="flex items-center justify-between gap-3 px-6 py-3">
							<span className="flex items-center gap-2">
								{repo ?? "Built-in site"}
								{state.active === repo && <Badge tone="success">Active</Badge>}
							</span>
							{state.active !== repo && (
								<GhostButton size="sm" disabled={restarting || running} onClick={() => activate(repo)}>
									Activate
								</GhostButton>
							)}
						</li>
					))}
				</ul>
			</Card>

			{job && job.status !== "done" && (
				<Card>
					<CardHeader title={`Installing ${job.repo}`} description={job.status === "failed" ? "Failed" : job.step} />
					<div className="px-6 py-4">
						{job.status === "running" ? (
							<p className="flex items-center gap-2 text-sm">
								<Spinner /> {job.step}… this can take a few minutes.
							</p>
						) : (
							<pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-destructive">{job.error}</pre>
						)}
					</div>
				</Card>
			)}

			<Card>
				<CardHeader
					title="GitHub repositories"
					description="Your repositories whose package.json uses Astro."
					actions={
						state.github.connected && (
							<div className="flex items-center gap-2">
								<Input
									aria-label="Filter repositories"
									placeholder="Filter"
									value={query}
									onChange={(e) => setQuery(e.target.value)}
								/>
								<GhostButton size="sm" onClick={disconnect}>
									Disconnect
								</GhostButton>
							</div>
						)
					}
				/>
				<div className="px-6 py-4">
					{!state.github.configured ? (
						<EmptyState
							title="GitHub is not set up"
							description="Set WUPPY_GITHUB_CLIENT_SECRET (and WUPPY_GITHUB_CLIENT_ID for your own OAuth app) on the server, then restart it."
						/>
					) : !state.github.connected ? (
						<EmptyState
							title="Connect GitHub"
							description="GitHub asks you to allow Wuppy access to all your repositories, public and private, so it can list and clone them."
							action={<Button onClick={connect}>Connect GitHub</Button>}
						/>
					) : !repos ? (
						<Spinner />
					) : shown.length === 0 ? (
						<EmptyState title="No Astro repositories found" />
					) : (
						<ul className="divide-y">
							{shown.map((r) => (
								<li key={r.repo} className="flex items-center justify-between gap-3 py-3">
									<div className="grid gap-0.5">
										<span className="flex items-center gap-2 font-medium">
											{r.repo}
											{r.private && <Badge>Private</Badge>}
											{state.active === r.repo && <Badge tone="success">Active</Badge>}
										</span>
										{r.description && <span className="text-sm text-muted-foreground">{r.description}</span>}
									</div>
									<Button size="sm" disabled={running || restarting} onClick={() => install(r.repo)}>
										{state.installed.includes(r.repo) ? "Rebuild" : "Install"}
									</Button>
								</li>
							))}
						</ul>
					)}
				</div>
			</Card>
		</div>
	);
}
