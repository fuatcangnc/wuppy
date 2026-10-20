import { useStore } from "@nanostores/react";
import { useState, type FormEvent } from "react";
import { $session, $socialProviders, loadSession, signIn, signUp, verifyCode } from "../../stores/session.ts";
import { authClient } from "../../lib/auth-client.ts";
import { socialProviderLabel } from "../../lib/auth-providers.ts";
import { ApiError, api, apiData } from "../../lib/api.ts";
import { Button, Checkbox, ErrorText, Input, toast } from "../../ui/index.tsx";

const oauthErrorMessage = () => {
	if (typeof window === "undefined") return null;
	const params = new URLSearchParams(window.location.search);
	if (!params.has("oauth_error")) return null;
	const code = params.get("error");
	if (code === "signup_disabled" || code === "account_not_linked") {
		return "That provider is not connected to an account. Sign in with your password, then connect it from Account security.";
	}
	if (code === "email_not_verified") return "Your provider email is not verified.";
	return "Social sign-in could not be completed. Please try again.";
};

export function LoginPage() {
	const session = useStore($session);
	const socialProviders = useStore($socialProviders);
	const setup = session.status === "anon" && session.needsSetup;
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const initialSetup = session.status === "anon" ? session.setup : undefined;
	const [siteName, setSiteName] = useState(initialSetup?.siteName || "Wuppy");
	const [siteUrl, setSiteUrl] = useState(
		initialSetup?.siteUrl || (typeof window === "undefined" ? "" : window.location.origin),
	);
	const [setupBusy, setSetupBusy] = useState(false);
	const [setupError, setSetupError] = useState<string | null>(() => oauthErrorMessage());
	const [createDemo, setCreateDemo] = useState(false);
	const [passkeyBusy, setPasskeyBusy] = useState(false);
	const [socialBusy, setSocialBusy] = useState<string | null>(null);

	const [code, setCode] = useState("");
	const [useBackup, setUseBackup] = useState(false);
	const [message, setMessage] = useState<string | null>(null);

	const [resetToken] = useState(() =>
		typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("token"),
	);
	const [resetError, setResetError] = useState<string | null>(() => {
		if (typeof window === "undefined") return null;
		const error = new URLSearchParams(window.location.search).get("error");
		return error === "INVALID_TOKEN" ? "This reset link is invalid or expired." : null;
	});
	const [inviteToken] = useState(() =>
		typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("invite"),
	);
	const [inviteName, setInviteName] = useState("");
	const [inviteEmail, setInviteEmail] = useState("");
	const [invitePassword, setInvitePassword] = useState("");
	const [inviteConfirm, setInviteConfirm] = useState("");
	const [inviteError, setInviteError] = useState<string | null>(null);
	const [inviteBusy, setInviteBusy] = useState(false);
	const [inviteAccountCreated, setInviteAccountCreated] = useState(false);
	const [inviteComplete, setInviteComplete] = useState(false);
	const [inviteCancelled, setInviteCancelled] = useState(false);
	const [resetComplete, setResetComplete] = useState(false);
	const [resetCancelled, setResetCancelled] = useState(false);
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [resetBusy, setResetBusy] = useState(false);
	const [forgot, setForgot] = useState(false);
	const [forgotBusy, setForgotBusy] = useState(false);
	const [forgotMessage, setForgotMessage] = useState<string | null>(null);

	const submitReset = async (event: FormEvent) => {
		event.preventDefault();
		if (!resetToken) return;
		if (newPassword !== confirmPassword) {
			setResetError("Passwords do not match.");
			return;
		}
		setResetBusy(true);
		setResetError(null);
		try {
			await api("POST", "/api/auth/reset-password", { newPassword, token: resetToken });
			if (typeof window !== "undefined") window.history.replaceState({}, "", window.location.pathname);
			setResetComplete(true);
			setNewPassword("");
			setConfirmPassword("");
		} catch (e) {
			setResetError((e as Error).message);
		} finally {
			setResetBusy(false);
		}
	};

	const requestReset = async (event: FormEvent) => {
		event.preventDefault();
		setForgotBusy(true);
		setForgotMessage(null);
		try {
			const redirectTo = typeof window === "undefined" ? "/admin/" : `${window.location.origin}/admin/`;
			const result = await api<{ message?: string }>("POST", "/api/auth/request-password-reset", {
				email,
				redirectTo,
			});
			setForgotMessage(result.message ?? "If this email exists in our system, check your email for the reset link.");
		} catch (e) {
			setForgotMessage((e as Error).message);
		} finally {
			setForgotBusy(false);
		}
	};

	const acceptInvite = async (event: FormEvent) => {
		event.preventDefault();
		if (!inviteToken) return;
		if (invitePassword !== inviteConfirm) {
			setInviteError("Passwords do not match.");
			return;
		}
		setInviteBusy(true);
		setInviteError(null);
		try {
			if (!inviteAccountCreated) {
				const res = await fetch("/api/auth/sign-up/email", {
					method: "POST",
					credentials: "same-origin",
					headers: { "content-type": "application/json", "x-wuppy-invite": inviteToken },
					body: JSON.stringify({ name: inviteName, email: inviteEmail, password: invitePassword }),
				});
				if (!res.ok) {
					const payload = (await res.json().catch(() => null)) as {
						message?: string;
						error?: { message?: string };
					} | null;
					throw new Error(
						res.status === 403
							? "This invitation is invalid or has expired."
							: (payload?.message ?? payload?.error?.message ?? `Could not accept the invitation (${res.status})`),
					);
				}
				setInviteAccountCreated(true);
			}
			await api("POST", "/api/invitations/accept", { token: inviteToken });
			if (typeof window !== "undefined") window.history.replaceState({}, "", window.location.pathname);
			setInviteComplete(true);
			await loadSession();
		} catch (e) {
			setInviteError((e as Error).message);
		} finally {
			setInviteBusy(false);
		}
	};

	if (inviteToken && !inviteComplete && !inviteCancelled) {
		return (
			<main className="mx-auto grid max-w-sm gap-4 p-6">
				<div>
					<h1 className="text-xl font-semibold">Accept your invitation</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Use the email address that received the invitation and choose a password.
					</p>
				</div>
				<form onSubmit={acceptInvite} className="grid gap-3">
					<Input
						label="Name"
						value={inviteName}
						onChange={(e) => setInviteName(e.target.value)}
						required
						autoComplete="name"
					/>
					<Input
						label="Email"
						type="email"
						value={inviteEmail}
						onChange={(e) => setInviteEmail(e.target.value)}
						required
						autoComplete="email"
					/>
					<Input
						label="Password"
						type="password"
						minLength={8}
						value={invitePassword}
						onChange={(e) => setInvitePassword(e.target.value)}
						required
						autoComplete="new-password"
					/>
					<Input
						label="Confirm password"
						type="password"
						minLength={8}
						value={inviteConfirm}
						onChange={(e) => setInviteConfirm(e.target.value)}
						required
						autoComplete="new-password"
					/>
					<ErrorText>{inviteError}</ErrorText>
					<Button type="submit" disabled={inviteBusy}>
						Accept invitation
					</Button>
				</form>
				<Button
					type="button"
					variant="link"
					className="justify-start px-0"
					onClick={() => {
						if (typeof window !== "undefined") window.history.replaceState({}, "", window.location.pathname);
						setInviteCancelled(true);
						setInviteError(null);
					}}
				>
					Back to sign in
				</Button>
			</main>
		);
	}

	if (resetToken && !resetComplete && !resetCancelled) {
		return (
			<main className="mx-auto grid max-w-sm gap-4 p-6">
				<div>
					<h1 className="text-xl font-semibold">Choose a new password</h1>
					<p className="mt-1 text-sm text-muted-foreground">This link is valid for 30 minutes.</p>
				</div>
				<form onSubmit={submitReset} className="grid gap-3">
					<Input
						label="New password"
						type="password"
						autoComplete="new-password"
						minLength={8}
						value={newPassword}
						onChange={(e) => setNewPassword(e.target.value)}
						required
					/>
					<Input
						label="Confirm new password"
						type="password"
						autoComplete="new-password"
						minLength={8}
						value={confirmPassword}
						onChange={(e) => setConfirmPassword(e.target.value)}
						required
					/>
					<ErrorText>{resetError}</ErrorText>
					<Button type="submit" disabled={resetBusy}>
						Reset password
					</Button>
				</form>
				<Button
					type="button"
					variant="link"
					className="justify-start px-0"
					onClick={() => {
						if (typeof window !== "undefined") window.history.replaceState({}, "", window.location.pathname);
						setResetCancelled(true);
						setResetError(null);
					}}
				>
					Back to sign in
				</Button>
			</main>
		);
	}

	if (session.status === "anon" && session.twoFactor) {
		return (
			<main className="mx-auto grid max-w-sm gap-4 p-6">
				<h1 className="text-xl font-semibold">Two-factor authentication</h1>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						void verifyCode(code.trim(), useBackup);
					}}
					className="grid gap-3"
				>
					<Input
						label={useBackup ? "Backup code" : "Authentication code"}
						value={code}
						onChange={(e) => setCode(e.target.value)}
						inputMode={useBackup ? "text" : "numeric"}
						autoComplete="one-time-code"
						required
					/>
					<ErrorText>{session.error}</ErrorText>
					<Button type="submit">Verify</Button>
				</form>
				<Button type="button" variant="link" className="justify-start px-0" onClick={() => setUseBackup(!useBackup)}>
					{useBackup ? "Use an authenticator code" : "Use a backup code"}
				</Button>
			</main>
		);
	}

	if (forgot && !setup) {
		return (
			<main className="mx-auto grid max-w-sm gap-4 p-6">
				<div>
					<h1 className="text-xl font-semibold">Reset your password</h1>
					<p className="mt-1 text-sm text-muted-foreground">We will email a reset link if the account exists.</p>
				</div>
				<form onSubmit={requestReset} className="grid gap-3">
					<Input
						label="Email"
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
						autoComplete="email"
					/>
					<Button type="submit" disabled={forgotBusy}>
						Send reset link
					</Button>
					{forgotMessage && (
						<p role="status" className="text-sm text-muted-foreground">
							{forgotMessage}
						</p>
					)}
				</form>
				<Button type="button" variant="link" className="justify-start px-0" onClick={() => setForgot(false)}>
					Back to sign in
				</Button>
			</main>
		);
	}

	const passkeySignIn = async () => {
		setPasskeyBusy(true);
		setSetupError(null);
		setMessage(null);
		try {
			const result = await authClient.signIn.passkey();
			if (result.error) throw new Error(result.error.message ?? "Passkey sign-in failed.");
			await loadSession();
		} catch (e) {
			setSetupError((e as Error).message);
		} finally {
			setPasskeyBusy(false);
		}
	};

	const socialSignIn = async (provider: string) => {
		setSocialBusy(provider);
		setSetupError(null);
		setMessage(null);
		try {
			const result = await authClient.signIn.social({
				provider,
				callbackURL: "/admin/",
				errorCallbackURL: "/admin/?oauth_error=1",
			});
			if (result.error) throw new Error(result.error.message ?? "Social sign-in failed.");
			if (result.data?.url && result.data.redirect) {
				window.location.assign(result.data.url);
				return;
			}
			setSocialBusy(null);
		} catch (e) {
			setSetupError((e as Error).message);
			setSocialBusy(null);
		}
	};

	const submit = (e: FormEvent) => {
		e.preventDefault();
		if (!setup) {
			void signIn(email, password);
			return;
		}
		void (async () => {
			const nextSiteName = siteName.trim();
			const nextSiteUrl = siteUrl.trim();
			if (!nextSiteName) {
				setSetupError("Site name is required.");
				return;
			}
			if (nextSiteUrl) {
				if (!/^https?:\/\//i.test(nextSiteUrl)) {
					setSetupError("Site URL must start with http:// or https://.");
					return;
				}
				try {
					const parsed = new URL(nextSiteUrl);
					if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("bad protocol");
				} catch {
					setSetupError("Site URL is not a valid URL.");
					return;
				}
			}
			setSetupBusy(true);
			setSetupError(null);
			try {
				await signUp(name, email, password);
				if ($session.get().status !== "authed") return;
				try {
					const current = await api<{ data: Record<string, unknown> }>("GET", "/api/data/settings");
					await api("PUT", "/api/data/settings", {
						data: {
							...current.data,
							siteName: nextSiteName,
							siteUrl: nextSiteUrl,
						},
					});
				} catch (error) {
					toast(`Site created, but settings could not be saved: ${(error as Error).message}`, "error");
				}
				if (createDemo) {
					try {
						const collections = await apiData<{ name: string }[]>("GET", "/api/collections");
						if (collections.some((collection) => collection.name === "posts")) {
							await apiData("POST", "/api/content/posts", {
								slug: "hello-world",
								data: { title: "Hello world", draft: false },
								body: "This is your first post. You can edit or delete it from the admin.\n",
							});
						}
					} catch (error) {
						// A pre-existing hello-world is fine; anything else is worth surfacing without undoing setup.
						if (!(error instanceof ApiError) || error.status !== 409) {
							toast(`Site created, but the sample post could not be added: ${(error as Error).message}`, "error");
						}
					}
				}
			} finally {
				setSetupBusy(false);
			}
		})();
	};

	return (
		<main className="mx-auto grid max-w-sm gap-4 p-6">
			<h1 className="text-xl font-semibold">{setup ? "Set up your site" : "Sign in to Wuppy"}</h1>
			{setup && (
				<p className="text-sm text-muted-foreground">
					Create the owner account and name your site. You can change these later in Settings.
				</p>
			)}
			{resetComplete && (
				<p role="status" className="text-sm text-muted-foreground">
					Password reset. Sign in with your new password.
				</p>
			)}
			{inviteComplete && (
				<p role="status" className="text-sm text-muted-foreground">
					Invitation accepted. You can sign in now.
				</p>
			)}
			{resetError && !resetToken && <ErrorText>{resetError}</ErrorText>}
			<form onSubmit={submit} className="grid gap-3">
				{setup && (
					<>
						<Input label="Site name" value={siteName} onChange={(e) => setSiteName(e.target.value)} required />
						<Input
							label="Site URL"
							type="url"
							value={siteUrl}
							onChange={(e) => setSiteUrl(e.target.value)}
							hint="Public URL used in SEO and the sitemap."
						/>
						<Checkbox
							label="Create a sample post"
							checked={createDemo}
							onChange={(e) => setCreateDemo(e.target.checked)}
						/>
						<Input
							label="Your name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
							autoComplete="name"
						/>
					</>
				)}
				<Input
					label="Email"
					type="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					required
					autoComplete="email"
				/>
				<Input
					label="Password"
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					required
					minLength={8}
					autoComplete={setup ? "new-password" : "current-password"}
				/>
				<ErrorText>{setupError ?? (session.status === "anon" ? session.error : null)}</ErrorText>
				<Button type="submit" disabled={setupBusy}>
					{setup ? (setupBusy ? "Creating site…" : "Create account") : "Sign in"}
				</Button>
				{!setup && (
					<>
						<Button type="button" variant="link" className="justify-start px-0" onClick={() => setForgot(true)}>
							Forgot password?
						</Button>
						<Button
							type="button"
							variant="secondary"
							onClick={() =>
								void api("POST", "/api/auth/sign-in/magic-link", { email, callbackURL: "/admin/" })
									.then(() => setMessage("If this account can use a magic link, one has been sent."))
									.catch((e: Error) => setMessage(e.message))
							}
						>
							Email me a magic link
						</Button>
						<Button type="button" variant="secondary" onClick={() => void passkeySignIn()} disabled={passkeyBusy}>
							{passkeyBusy ? "Waiting for passkey…" : "Sign in with a passkey"}
						</Button>
						{socialProviders.length > 0 && (
							<div className="grid gap-2 pt-1">
								<p className="text-center text-xs uppercase tracking-wide text-muted-foreground">Or continue with</p>
								{socialProviders.map((provider) => (
									<Button
										key={provider}
										type="button"
										variant="secondary"
										onClick={() => void socialSignIn(provider)}
										disabled={socialBusy !== null}
									>
										{socialBusy === provider ? "Redirecting…" : `Continue with ${socialProviderLabel(provider)}`}
									</Button>
								))}
							</div>
						)}
					</>
				)}
				{message && (
					<p role="status" className="text-sm text-muted-foreground">
						{message}
					</p>
				)}
			</form>
		</main>
	);
}
