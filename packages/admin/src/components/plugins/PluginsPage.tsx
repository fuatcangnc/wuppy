import { useEffect, useState } from "react";
import { apiData } from "../../lib/api.ts";
import { Badge, Card, CardHeader, EmptyState, ErrorText, PageHeader, Spinner } from "../../ui/index.tsx";

interface PluginManifest {
	id: string;
	version: string;
	name?: string;
	description?: string;
	author?: string;
	homepage?: string;
	hooks: string[];
	routes: Array<{ path: string; methods: string[]; description?: string }>;
	capabilities: {
		content: { read: string[] };
		network: Array<{ host: string; methods: string[]; paths: string[] }>;
	};
	limits: { timeoutMs: number; memoryMb: number };
}
interface Plugins {
	loaded: string[];
	errors: string[];
	manifests: PluginManifest[];
}

export function PluginsPage() {
	const [data, setData] = useState<Plugins | null>(null);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		void apiData<Plugins>("GET", "/api/plugins")
			.then(setData)
			.catch((e: Error) => setError(e.message));
	}, []);

	return (
		<div className="grid gap-4">
			<PageHeader title="Plugins" description="Sandboxed plugins, declared capabilities and HTTP routes." />
			<ErrorText>{error}</ErrorText>
			{!data ? (
				<Spinner />
			) : (
				<>
					{data.manifests.length === 0 && data.errors.length === 0 ? (
						<EmptyState title="No plugins" description="Add a plugin directory and approve its capability hash." />
					) : (
						<div className="grid gap-4">
							{data.manifests.map((manifest) => (
								<Card key={manifest.id}>
									<CardHeader
										title={manifest.name ?? manifest.id}
										description={manifest.description ?? `v${manifest.version}${manifest.author ? ` · ${manifest.author}` : ""}`}
										actions={<Badge variant="success">active</Badge>}
									/>
									<div className="grid gap-3 p-4 text-sm">
										<div>
											<p className="font-medium">Hooks</p>
											<p className="text-muted-foreground">{manifest.hooks.length ? manifest.hooks.join(", ") : "none"}</p>
										</div>
										<div>
											<p className="font-medium">Routes</p>
											{manifest.routes.length === 0 ? (
												<p className="text-muted-foreground">No HTTP routes.</p>
											) : (
												<ul className="mt-1 grid gap-1">
													{manifest.routes.map((route) => (
														<li key={`${route.path}:${route.methods.join(",")}`} className="font-mono text-xs">
															<span className="text-muted-foreground">{route.methods.join("|")}</span>{" "}
															/api/plugins/{manifest.id}
															{route.path}
														</li>
													))}
												</ul>
											)}
										</div>
										<div>
											<p className="font-medium">Capabilities</p>
											<ul className="mt-1 list-disc ps-5 text-muted-foreground">
												{manifest.capabilities.content.read.map((collection) => (
													<li key={`content:${collection}`}>content: read {collection}</li>
												))}
												{manifest.capabilities.network.map((rule) => (
													<li key={`net:${rule.host}`}>
														network: {rule.methods.join("|")} {rule.host} {rule.paths.join(", ")}
													</li>
												))}
												{manifest.capabilities.content.read.length === 0 && manifest.capabilities.network.length === 0 && (
													<li>No capabilities.</li>
												)}
											</ul>
										</div>
										<p className="text-xs text-muted-foreground">
											Limits: {manifest.limits.timeoutMs} ms, {manifest.limits.memoryMb} MB
										</p>
									</div>
								</Card>
							))}
						</div>
					)}
					{data.errors.length > 0 && (
						<Card>
							<CardHeader title="Not loaded" description="Fail closed: a plugin with an error never runs." />
							<ul className="divide-y">
								{data.errors.map((message, index) => (
									<li key={index} className="p-4 text-sm text-destructive">
										{message}
									</li>
								))}
							</ul>
						</Card>
					)}
				</>
			)}
		</div>
	);
}
