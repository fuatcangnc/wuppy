import { useStore } from "@nanostores/react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { authClient } from "../../lib/auth-client.ts";
import { api } from "../../lib/api.ts";
import { socialProviderLabel } from "../../lib/auth-providers.ts";
import { $socialProviders, loadSession } from "../../stores/session.ts";
import { Badge, Button, Card, CardHeader, ErrorText, Input, Spinner, toast } from "../../ui/index.tsx";
import { SessionTable, type SessionInfo } from "../shared/SessionTable.tsx";
import { WorkspaceLayout, WorkspacePanel, WorkspaceSidebar } from "../shared/WorkspaceLayout.tsx";

interface Enrollment {
	secret: string;
	backupCodes: string[];
}

interface LinkedAccount {
	providerId: string;
}

export interface PasskeyInfo {
	id: string;
	name?: string;
	deviceType?: string;
	backedUp?: boolean;
	createdAt?: string;
}

const secretFromUri = (uri: string) => new URL(uri).searchParams.get("secret") ?? "";

export function SecurityPage({ twoFactorEnabled }: { twoFactorEnabled: boolean }) {
	const socialProviders = useStore($socialProviders);
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [twoFactorPassword, setTwoFactorPassword] = useState("");
	const [code, setCode] = useState("");
	const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState(false);
	const [passwordError, setPasswordError] = useState<string | null>(null);
	const [passwordDone, setPasswordDone] = useState(false);
	const [passwordBusy, setPasswordBusy] = useState(false);
	const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
	const [currentToken, setCurrentToken] = useState<string | null>(null);
	const [sessionError, setSessionError] = useState<string | null>(null);
	const [busyToken, setBusyToken] = useState<string | null>(null);
	const [sessionAction, setSessionAction] = useState(false);
	const [passkeys, setPasskeys] = useState<PasskeyInfo[] | null>(null);
	const [passkeyName, setPasskeyName] = useState("");
	const [passkeyError, setPasskeyError] = useState<string | null>(null);
	const [passkeyBusy, setPasskeyBusy] = useState(false);
	const [busyPasskey, setBusyPasskey] = useState<string | null>(null);
	const [accounts, setAccounts] = useState<LinkedAccount[] | null>(null);
	const [socialError, setSocialError] = useState<string | null>(() => {
		if (typeof window === "undefined") return null;
		return new URLSearchParams(window.location.search).has("link_error")
			? "Connecting that provider failed. Check that the provider email matches this account and try again."
			: null;
	});
	const [linkBusy, setLinkBusy] = useState<string | null>(null);
	const [activeSection, setActiveSection] = useState("password");

	const loadAccounts = useCallback(async () => {
		if (socialProviders.length === 0) {
			setAccounts([]);
			return;
		}
		setSocialError(null);
		try {
			const list = await api<LinkedAccount[]>("GET", "/api/auth/list-accounts");
			setAccounts(Array.isArray(list) ? list : []);
		} catch (e) {
			setAccounts([]);
			setSocialError((e as Error).message);
		}
	}, [socialProviders.length]);

	const loadPasskeys = useCallback(async () => {
		setPasskeyError(null);
		try {
			const list = await api<PasskeyInfo[]>("GET", "/api/auth/passkey/list-user-passkeys");
			setPasskeys(Array.isArray(list) ? list : []);
		} catch (e) {
			setPasskeys([]);
			setPasskeyError((e as Error).message);
		}
	}, []);

	const loadSessions = useCallback(async () => {
		setSessionError(null);
		try {
			const [list, current] = await Promise.all([
				api<SessionInfo[]>("GET", "/api/auth/list-sessions"),
				api<{ session?: { token?: string } } | null>("GET", "/api/auth/get-session"),
			]);
			setSessions(Array.isArray(list) ? list : []);
			setCurrentToken(current?.session?.token ?? null);
		} catch (e) {
			setSessions([]);
			setSessionError((e as Error).message);
		}
	}, []);

	useEffect(() => {
		void loadSessions();
		void loadPasskeys();
		void loadAccounts();
	}, [loadSessions, loadPasskeys, loadAccounts]);

	const run = async (fn: () => Promise<void>) => {
		setError(null);
		try {
			await fn();
		} catch (e) {
			setError((e as Error).message);
		}
	};

	const changePassword = async (event: FormEvent) => {
		event.preventDefault();
		setPasswordBusy(true);
		setPasswordError(null);
		setPasswordDone(false);
		try {
			await api("POST", "/api/auth/change-password", {
				currentPassword,
				newPassword,
				revokeOtherSessions: true,
			});
			setCurrentPassword("");
			setNewPassword("");
			setPasswordDone(true);
			toast("Password changed");
			await loadSessions();
		} catch (e) {
			setPasswordError((e as Error).message);
		} finally {
			setPasswordBusy(false);
		}
	};

	const enable = (e: FormEvent) => {
		e.preventDefault();
		void run(async () => {
			const res = await api<{ totpURI: string; backupCodes: string[] }>("POST", "/api/auth/two-factor/enable", {
				password: twoFactorPassword,
				method: "totp",
			});
			setEnrollment({ secret: secretFromUri(res.totpURI), backupCodes: res.backupCodes });
			setTwoFactorPassword("");
		});
	};

	const confirmEnrollment = (e: FormEvent) => {
		e.preventDefault();
		void run(async () => {
			await api("POST", "/api/auth/two-factor/verify-totp", { code });
			setEnrollment(null);
			setDone(true);
			await loadSession();
		});
	};

	const disable = (e: FormEvent) => {
		e.preventDefault();
		void run(async () => {
			await api("POST", "/api/auth/two-factor/disable", { password: twoFactorPassword });
			setTwoFactorPassword("");
			setDone(false);
			await loadSession();
		});
	};

	const revokeSession = async (session: SessionInfo) => {
		setBusyToken(session.token);
		setSessionError(null);
		try {
			await api("POST", "/api/auth/revoke-session", { token: session.token });
			toast("Session revoked");
			await loadSessions();
		} catch (e) {
			setSessionError((e as Error).message);
		} finally {
			setBusyToken(null);
		}
	};

	const revokeOthers = async () => {
		setSessionAction(true);
		setSessionError(null);
		try {
			await api("POST", "/api/auth/revoke-other-sessions");
			toast("Other sessions signed out");
			await loadSessions();
		} catch (e) {
			setSessionError((e as Error).message);
		} finally {
			setSessionAction(false);
		}
	};

	const revokeAll = async () => {
		if (!confirm("Sign out everywhere, including this device?")) return;
		setSessionAction(true);
		setSessionError(null);
		try {
			await api("POST", "/api/auth/revoke-sessions");
			await loadSession();
		} catch (e) {
			setSessionError((e as Error).message);
			setSessionAction(false);
		}
	};

	const linkSocial = async (provider: string) => {
		setLinkBusy(provider);
		setSocialError(null);
		try {
			const result = await authClient.linkSocial({
				provider,
				callbackURL: "/admin/security",
				errorCallbackURL: "/admin/security?link_error=1",
			});
			if (result.error) throw new Error(result.error.message ?? "Could not connect the provider.");
			if (result.data?.url && result.data.redirect) {
				window.location.assign(result.data.url);
				return;
			}
			setLinkBusy(null);
			await loadAccounts();
		} catch (e) {
			setSocialError((e as Error).message);
			setLinkBusy(null);
		}
	};

	const addPasskey = async () => {
		setPasskeyBusy(true);
		setPasskeyError(null);
		try {
			if (typeof window === "undefined" || !window.PublicKeyCredential) {
				throw new Error("This browser does not support passkeys.");
			}
			const result = await authClient.passkey.addPasskey({ name: passkeyName.trim() || undefined });
			if (result.error) throw new Error(result.error.message ?? "Could not add passkey.");
			setPasskeyName("");
			toast("Passkey added");
			await loadPasskeys();
		} catch (e) {
			setPasskeyError((e as Error).message);
		} finally {
			setPasskeyBusy(false);
		}
	};

	const removePasskey = async (passkey: PasskeyInfo) => {
		if (!confirm(`Remove ${passkey.name || "this passkey"}?`)) return;
		setBusyPasskey(passkey.id);
		setPasskeyError(null);
		try {
			await api("POST", "/api/auth/passkey/delete-passkey", { id: passkey.id });
			toast("Passkey removed");
			await loadPasskeys();
		} catch (e) {
			setPasskeyError((e as Error).message);
		} finally {
			setBusyPasskey(null);
		}
	};

	const otherSessions = sessions?.some((session) => session.token !== currentToken) ?? false;
	const sections = [
		{ id: "password", label: "Password", description: "Change your sign-in password." },
		{ id: "two-factor", label: "Two-factor", description: "Authenticator codes and recovery." },
		...(socialProviders.length > 0
			? [{ id: "accounts", label: "Connected accounts", description: "OAuth sign-in providers." }]
			: []),
		{ id: "passkeys", label: "Passkeys", description: "Device and security-key sign-in." },
		{ id: "sessions", label: "Active sessions", description: "Devices signed in to your account." },
	];
	const active = sections.find((section) => section.id === activeSection) ?? sections[0]!;

	return (
		<div className="grid gap-4">
			<WorkspaceLayout sidebarWidth={300}>
				<WorkspaceSidebar>
					<div className="border-b border-border px-4 py-3">
						<h1 className="text-base font-semibold">Account security</h1>
						<p className="mt-0.5 text-[11px] text-muted-foreground">Password, two-factor and devices.</p>
					</div>
					<nav className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2" aria-label="Security sections">
						{sections.map((section) => (
							<button
								key={section.id}
								type="button"
								aria-current={activeSection === section.id ? "true" : undefined}
								onClick={() => {
									setActiveSection(section.id);
									document
										.getElementById(`security-${section.id}`)
										?.scrollIntoView({ behavior: "smooth", block: "start" });
								}}
								className={`flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition-colors ${
									activeSection === section.id
										? "bg-tab text-foreground"
										: "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
								}`}
							>
								<span className="text-sm font-medium">{section.label}</span>
								<span className="text-[11px]">{section.description}</span>
							</button>
						))}
					</nav>
				</WorkspaceSidebar>
				<WorkspacePanel className="grid-rows-[auto_minmax(0,1fr)]">
					<header className="border-b border-border px-5 py-4">
						<h2 className="text-lg font-semibold">{active.label}</h2>
						<p className="text-xs text-muted-foreground">{active.description}</p>
					</header>
					<div className="custom-scrollbar min-h-0 overflow-y-auto">
						<div className="grid gap-6 p-5">
							<div className="grid gap-6 lg:grid-cols-2">
								<section id="security-password" className="scroll-mt-4">
									<Card>
										<CardHeader title="Password" description="Use a strong password you do not use anywhere else." />
										<div className="px-6">
											<form onSubmit={changePassword} className="grid gap-3">
												<Input
													label="Current password"
													type="password"
													autoComplete="current-password"
													value={currentPassword}
													onChange={(e) => setCurrentPassword(e.target.value)}
													required
												/>
												<Input
													label="New password"
													type="password"
													autoComplete="new-password"
													minLength={8}
													value={newPassword}
													onChange={(e) => setNewPassword(e.target.value)}
													required
												/>
												<Button type="submit" disabled={passwordBusy || newPassword.length < 8}>
													Change password
												</Button>
												{passwordDone && (
													<p role="status" className="text-sm text-muted-foreground">
														Password changed. Other sessions were signed out.
													</p>
												)}
												<ErrorText>{passwordError}</ErrorText>
											</form>
										</div>
									</Card>
								</section>

								<section id="security-two-factor" className="scroll-mt-4">
									<Card>
										<CardHeader
											title="Two-factor authentication"
											description="Require an authenticator code when signing in with a password. Magic links are not sent while this is on; passkeys and connected providers remain strong alternatives."
										/>
										<div className="px-6">
											<ErrorText>{error}</ErrorText>
											{done && <p role="status">Two-factor authentication is on.</p>}

											{enrollment ? (
												<form onSubmit={confirmEnrollment} className="grid gap-3">
													<p className="text-sm">
														Add this key to your authenticator app, then enter a code to finish. Save the backup codes
														now; they are not shown again.
													</p>
													<code className="rounded-ui bg-card p-2 break-all">{enrollment.secret}</code>
													<ul className="grid gap-1 font-mono text-sm">
														{enrollment.backupCodes.map((c) => (
															<li key={c}>{c}</li>
														))}
													</ul>
													<Input
														label="Authentication code"
														inputMode="numeric"
														autoComplete="one-time-code"
														value={code}
														onChange={(e) => setCode(e.target.value)}
														required
													/>
													<Button type="submit">Confirm</Button>
												</form>
											) : (
												<form onSubmit={twoFactorEnabled ? disable : enable} className="grid gap-3">
													<Input
														label="Account password"
														type="password"
														autoComplete="current-password"
														value={twoFactorPassword}
														onChange={(e) => setTwoFactorPassword(e.target.value)}
														required
													/>
													<Button type="submit">{twoFactorEnabled ? "Disable two-factor" : "Enable two-factor"}</Button>
												</form>
											)}
										</div>
									</Card>
								</section>
							</div>

							{socialProviders.length > 0 && (
								<>
									<section id="security-accounts" className="scroll-mt-4">
										<Card>
											<CardHeader
												title="Connected accounts"
												description="Connect an identity provider to sign in without a password. The provider email must match this account; provider sign-in does not ask for a Wuppy authenticator code."
											/>
											<div className="grid gap-3 px-6 pb-4">
												<ErrorText>{socialError}</ErrorText>
												{accounts === null ? (
													<div className="grid place-items-center p-4">
														<Spinner />
													</div>
												) : (
													<ul className="grid gap-2">
														{socialProviders.map((provider) => {
															const linked = accounts.some((account) => account.providerId === provider);
															return (
																<li
																	key={provider}
																	className="flex flex-wrap items-center justify-between gap-2 rounded-ui border border-border px-3 py-2"
																>
																	<span className="text-sm font-medium">{socialProviderLabel(provider)}</span>
																	{linked ? (
																		<Badge tone="success">Connected</Badge>
																	) : (
																		<Button
																			size="sm"
																			variant="secondary"
																			onClick={() => void linkSocial(provider)}
																			disabled={linkBusy !== null}
																		>
																			{linkBusy === provider ? "Redirecting…" : "Connect"}
																		</Button>
																	)}
																</li>
															);
														})}
													</ul>
												)}
											</div>
										</Card>
									</section>
								</>
							)}

							<section id="security-passkeys" className="scroll-mt-4">
								<Card>
									<CardHeader
										title="Passkeys"
										description="Sign in with your device or a security key. Passkeys are a strong alternative to your password and do not ask for an authenticator code."
									/>
									<div className="grid gap-3 px-6">
										<ErrorText>{passkeyError}</ErrorText>
										<div className="flex flex-wrap items-end gap-2">
											<div className="min-w-48 flex-1">
												<Input
													label="Passkey name"
													value={passkeyName}
													onChange={(e) => setPasskeyName(e.target.value)}
													placeholder="Laptop, security key…"
												/>
											</div>
											<Button type="button" onClick={() => void addPasskey()} disabled={passkeyBusy}>
												{passkeyBusy ? "Waiting for passkey…" : "Add passkey"}
											</Button>
										</div>
										{passkeys === null ? (
											<div className="grid place-items-center p-4">
												<Spinner />
											</div>
										) : passkeys.length === 0 ? (
											<p className="pb-4 text-sm text-muted-foreground">No passkeys yet.</p>
										) : (
											<ul className="grid gap-2 pb-4">
												{passkeys.map((passkey) => (
													<li
														key={passkey.id}
														className="flex flex-wrap items-center justify-between gap-2 rounded-ui border border-border px-3 py-2"
													>
														<div>
															<p className="text-sm font-medium">{passkey.name || "Passkey"}</p>
															<p className="text-xs text-muted-foreground">
																{passkey.deviceType?.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase() || "Passkey"}
																{passkey.backedUp ? " · synced" : ""}
															</p>
														</div>
														<Button
															size="sm"
															variant="ghost"
															onClick={() => void removePasskey(passkey)}
															disabled={busyPasskey === passkey.id}
															aria-label={`Remove ${passkey.name || "passkey"}`}
														>
															Remove
														</Button>
													</li>
												))}
											</ul>
										)}
									</div>
								</Card>
							</section>

							<section id="security-sessions" className="scroll-mt-4">
								<Card>
									<CardHeader
										title="Active sessions"
										description="Devices signed in to your account. Revoke anything you do not recognize."
										actions={
											<div className="flex flex-wrap items-center gap-2">
												<Button
													size="sm"
													variant="secondary"
													onClick={() => void revokeOthers()}
													disabled={sessionAction || !otherSessions}
												>
													Sign out other devices
												</Button>
												<Button size="sm" variant="ghost" onClick={() => void revokeAll()} disabled={sessionAction}>
													Sign out everywhere
												</Button>
											</div>
										}
									/>
									<div className="p-4">
										<ErrorText>{sessionError}</ErrorText>
										{sessions === null ? (
											<div className="grid place-items-center p-4">
												<Spinner />
											</div>
										) : (
											<SessionTable
												sessions={sessions}
												currentToken={currentToken}
												onRevoke={(session) => void revokeSession(session)}
												busyToken={busyToken}
											/>
										)}
									</div>
								</Card>
							</section>
						</div>
					</div>
				</WorkspacePanel>
			</WorkspaceLayout>
		</div>
	);
}
