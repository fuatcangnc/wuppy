import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../../lib/api.ts";
import { Badge, Button, Dialog, ErrorText, Input, Spinner, toast } from "../../ui/index.tsx";
import { SessionTable, type SessionInfo } from "../shared/SessionTable.tsx";
import type { UserRow } from "./types.ts";

export function UserSecurityDialog({
	user,
	isSelf,
	onClose,
	onChanged,
}: {
	user: UserRow | null;
	isSelf: boolean;
	onClose: () => void;
	onChanged: () => void;
}) {
	const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
	const [sessionError, setSessionError] = useState<string | null>(null);
	const [busyToken, setBusyToken] = useState<string | null>(null);
	const [revokingAll, setRevokingAll] = useState(false);
	const [newPassword, setNewPassword] = useState("");
	const [passwordError, setPasswordError] = useState<string | null>(null);
	const [passwordBusy, setPasswordBusy] = useState(false);
	const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
	const [twoFactorBusy, setTwoFactorBusy] = useState(false);
	const [twoFactorError, setTwoFactorError] = useState<string | null>(null);

	const loadSessions = useCallback(async (userId: string) => {
		setSessionError(null);
		try {
			const result = await api<{ sessions: SessionInfo[] }>("POST", "/api/auth/admin/list-user-sessions", {
				userId,
			});
			const active = (Array.isArray(result.sessions) ? result.sessions : []).filter(
				(session) => new Date(session.expiresAt).getTime() > Date.now(),
			);
			setSessions(active);
		} catch (e) {
			setSessionError((e as Error).message);
			setSessions([]);
		}
	}, []);

	useEffect(() => {
		if (!user) return;
		setSessions(null);
		setSessionError(null);
		setNewPassword("");
		setPasswordError(null);
		setTwoFactorEnabled(Boolean(user.twoFactorEnabled));
		setTwoFactorError(null);
		void loadSessions(user.id);
	}, [user, loadSessions]);

	const revokeSession = async (session: SessionInfo) => {
		if (!user) return;
		setBusyToken(session.token);
		setSessionError(null);
		try {
			await api("POST", "/api/auth/admin/revoke-user-session", { sessionToken: session.token });
			toast("Session revoked");
			await loadSessions(user.id);
		} catch (e) {
			setSessionError((e as Error).message);
		} finally {
			setBusyToken(null);
		}
	};

	const revokeAll = async () => {
		if (!user || !confirm(`Sign ${user.email} out everywhere?`)) return;
		setRevokingAll(true);
		setSessionError(null);
		try {
			await api("POST", "/api/auth/admin/revoke-user-sessions", { userId: user.id });
			toast("All sessions revoked");
			await loadSessions(user.id);
		} catch (e) {
			setSessionError((e as Error).message);
		} finally {
			setRevokingAll(false);
		}
	};

	const setPassword = async (event: FormEvent) => {
		event.preventDefault();
		if (!user) return;
		setPasswordBusy(true);
		setPasswordError(null);
		try {
			await api("POST", "/api/auth/admin/set-user-password", { userId: user.id, newPassword });
			await api("POST", "/api/auth/admin/revoke-user-sessions", { userId: user.id });
			setNewPassword("");
			toast("Password updated and sessions revoked");
			await loadSessions(user.id);
		} catch (e) {
			setPasswordError((e as Error).message);
		} finally {
			setPasswordBusy(false);
		}
	};

	const resetTwoFactor = async () => {
		if (!user || !confirm(`Reset two-factor authentication for ${user.email}? They will be signed out everywhere.`)) {
			return;
		}
		setTwoFactorBusy(true);
		setTwoFactorError(null);
		try {
			await api("POST", `/api/users/${encodeURIComponent(user.id)}/reset-two-factor`);
			setTwoFactorEnabled(false);
			toast("Two-factor reset and sessions revoked");
			await loadSessions(user.id);
			onChanged();
		} catch (e) {
			setTwoFactorError((e as Error).message);
		} finally {
			setTwoFactorBusy(false);
		}
	};

	return (
		<Dialog
			open={Boolean(user)}
			title={user ? `Manage ${user.email}` : "Manage user"}
			onClose={onClose}
			footer={
				<Button variant="ghost" onClick={onClose}>
					Close
				</Button>
			}
		>
			{user && (
				<div className="grid gap-5">
					<div className="flex flex-wrap items-center gap-2">
						<Badge tone={user.banned ? "danger" : "success"}>{user.banned ? "disabled" : "active"}</Badge>
						<Badge tone="neutral">{user.role ?? "viewer"}</Badge>
						<span className="text-sm text-muted-foreground">{user.name}</span>
					</div>

					<section className="grid gap-2">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div>
								<h3 className="font-medium">Active sessions</h3>
								<p className="text-sm text-muted-foreground">Devices currently signed in to this account.</p>
							</div>
							<Button
								size="sm"
								variant="secondary"
								onClick={() => void revokeAll()}
								disabled={revokingAll || !sessions?.length}
							>
								Revoke all
							</Button>
						</div>
						<ErrorText>{sessionError}</ErrorText>
						{sessions === null ? (
							<div className="grid place-items-center p-4">
								<Spinner />
							</div>
						) : (
							<SessionTable
								sessions={sessions}
								onRevoke={(session) => void revokeSession(session)}
								busyToken={busyToken}
							/>
						)}
					</section>

					{isSelf ? (
						<p className="border-t pt-4 text-sm text-muted-foreground">
							Use Account security to change your own password or two-factor settings.
						</p>
					) : (
						<>
							<section className="grid gap-2 border-t pt-4">
								<div>
									<h3 className="font-medium">Set password</h3>
									<p className="text-sm text-muted-foreground">
										Set a temporary password and sign this user out everywhere.
									</p>
								</div>
								<form onSubmit={setPassword} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
									<Input
										label="New password"
										type="password"
										minLength={8}
										autoComplete="new-password"
										value={newPassword}
										onChange={(e) => setNewPassword(e.target.value)}
										required
									/>
									<Button type="submit" disabled={passwordBusy || newPassword.length < 8}>
										Set password
									</Button>
								</form>
								<ErrorText>{passwordError}</ErrorText>
							</section>

							<section className="grid gap-2 border-t pt-4">
								<div>
									<h3 className="font-medium">Two-factor authentication</h3>
									<p className="text-sm text-muted-foreground">
										{twoFactorEnabled
											? "Reset removes the authenticator and signs the user out everywhere."
											: "Two-factor authentication is not enabled."}
									</p>
								</div>
								{twoFactorEnabled && (
									<Button variant="secondary" onClick={() => void resetTwoFactor()} disabled={twoFactorBusy}>
										Reset 2FA
									</Button>
								)}
								<ErrorText>{twoFactorError}</ErrorText>
							</section>
						</>
					)}
				</div>
			)}
		</Dialog>
	);
}
