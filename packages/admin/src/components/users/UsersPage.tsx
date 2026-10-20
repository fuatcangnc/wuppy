import { Mail, Plus, ShieldCheck } from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../../lib/api.ts";
import { $session } from "../../stores/session.ts";
import {
	Badge,
	Button,
	Card,
	CardHeader,
	Dialog,
	ErrorText,
	Input,
	PageHeader,
	Select,
	Table,
	Td,
	Th,
	toast,
} from "../../ui/index.tsx";
import { UserSecurityDialog } from "./UserSecurityDialog.tsx";
import type { InvitationRow, UserRow } from "./types.ts";

const ROLES = ["admin", "editor", "author", "viewer"];

/** What a token may do. "same" sends no list, so the server uses the creator's own permissions. */
export const TOKEN_SCOPES = {
	same: { label: "Everything I can do", permissions: undefined },
	read: { label: "Read content only", permissions: ["content:read"] },
	write: { label: "Read and write content", permissions: ["content:read", "content:write", "media:write"] },
	publish: {
		label: "Write and publish content",
		permissions: ["content:read", "content:write", "content:publish", "content:schedule", "media:write"],
	},
} as const;

export function UsersPage() {
	const session = useStore($session);
	const currentUserId = session.status === "authed" ? session.user.id : null;
	const [users, setUsers] = useState<UserRow[] | null>(null);
	const [tokens, setTokens] = useState<
		Array<{
			id: string;
			name: string;
			createdAt: string;
			lastUsedAt: string | null;
			expiresAt?: string | null;
			permissions?: string[];
		}>
	>([]);
	const [tokenName, setTokenName] = useState("");
	const [tokenScope, setTokenScope] = useState<keyof typeof TOKEN_SCOPES>("same");
	const [tokenDays, setTokenDays] = useState("");
	const [matrix, setMatrix] = useState<{
		permissions: string[];
		roles: Array<{ name: string; permissions: string[] }>;
	} | null>(null);
	const [createdToken, setCreatedToken] = useState<string | null>(null);
	const [invitations, setInvitations] = useState<InvitationRow[]>([]);
	const [inviteOpen, setInviteOpen] = useState(false);
	const [inviteForm, setInviteForm] = useState({ email: "", role: "viewer" });
	const [inviteError, setInviteError] = useState<string | null>(null);
	const [inviteBusy, setInviteBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [open, setOpen] = useState(false);
	const [manage, setManage] = useState<UserRow | null>(null);
	const [form, setForm] = useState({ name: "", email: "", password: "", role: "viewer" });

	const load = useCallback(async () => {
		try {
			setError(null);
			const userList = await api<{ users: UserRow[] }>("GET", "/api/auth/admin/list-users?limit=200");
			setUsers(userList.users);
		} catch (e) {
			setError((e as Error).message);
		}
		void api<{ data: NonNullable<typeof matrix> }>("GET", "/api/roles")
			.then((r) => setMatrix(r.data))
			.catch(() => setMatrix(null));
		try {
			const tokenList = await api<{
				data?: Array<{ id: string; name: string; createdAt: string; lastUsedAt: string | null }>;
			}>("GET", "/api/tokens");
			setTokens(Array.isArray(tokenList.data) ? tokenList.data : []);
		} catch {
			setTokens([]);
		}
		try {
			const inviteList = await api<{ data?: InvitationRow[] }>("GET", "/api/invitations");
			setInvitations(Array.isArray(inviteList.data) ? inviteList.data : []);
		} catch {
			setInvitations([]);
		}
	}, []);
	useEffect(() => void load(), [load]);

	const act = async (fn: () => Promise<unknown>) => {
		try {
			await fn();
			await load();
		} catch (e) {
			setError((e as Error).message);
		}
	};

	const create = (e: FormEvent) => {
		e.preventDefault();
		void act(async () => {
			await api("POST", "/api/auth/admin/create-user", form);
			setForm({ name: "", email: "", password: "", role: "viewer" });
			setOpen(false);
			toast("User created");
		});
	};

	const sendInvite = async (e: FormEvent) => {
		e.preventDefault();
		setInviteBusy(true);
		setInviteError(null);
		try {
			await api("POST", "/api/invitations", inviteForm);
			setInviteOpen(false);
			setInviteForm({ email: "", role: "viewer" });
			toast("Invitation sent");
			await load();
		} catch (failure) {
			setInviteError((failure as Error).message);
		} finally {
			setInviteBusy(false);
		}
	};

	return (
		<div className="grid gap-4">
			<PageHeader
				title="Users"
				description="Accounts, roles and access."
				actions={
					<div className="flex flex-wrap items-center gap-2">
						<Button
							variant="secondary"
							onClick={() => {
								setInviteError(null);
								setInviteOpen(true);
							}}
						>
							<Mail size={14} /> Invite user
						</Button>
						<Button onClick={() => setOpen(true)}>
							<Plus size={14} /> Add user
						</Button>
					</div>
				}
			/>
			<ErrorText>{error}</ErrorText>
			<Card>
				<CardHeader title="Accounts" description={`${users?.length ?? 0} users`} />
				{users && users.length === 0 ? (
					<p className="p-4 text-muted-foreground">No users yet</p>
				) : (
					<Table>
						<thead>
							<tr>
								<Th>Name</Th>
								<Th>Email</Th>
								<Th>Role</Th>
								<Th>Status</Th>
								<Th />
							</tr>
						</thead>
						<tbody>
							{users?.map((u) => (
								<tr key={u.id} className="hover:bg-secondary">
									<Td className="font-medium">{u.name}</Td>
									<Td>{u.email}</Td>
									<Td>
										<Select
											aria-label={`Role for ${u.email}`}
											className="h-8 w-28"
											value={u.role ?? "viewer"}
											onChange={(e) =>
												void act(() => api("POST", "/api/auth/admin/set-role", { userId: u.id, role: e.target.value }))
											}
										>
											{ROLES.map((r) => (
												<option key={r}>{r}</option>
											))}
										</Select>
									</Td>
									<Td>
										<Badge tone={u.banned ? "danger" : "success"}>{u.banned ? "disabled" : "active"}</Badge>
									</Td>
									<Td className="text-end">
										<Button size="sm" variant="ghost" onClick={() => setManage(u)}>
											<ShieldCheck size={14} /> Manage
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() =>
												void act(() =>
													api("POST", u.banned ? "/api/auth/admin/unban-user" : "/api/auth/admin/ban-user", {
														userId: u.id,
													}),
												)
											}
										>
											{u.banned ? "Enable" : "Disable"}
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => {
												if (confirm(`Remove ${u.email}?`))
													void act(() => api("POST", "/api/auth/admin/remove-user", { userId: u.id }));
											}}
										>
											Remove
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() =>
												void api("POST", "/api/auth/sign-in/magic-link", {
													email: u.email,
													callbackURL: "/admin/",
												})
													.then(() => toast("Magic link requested"))
													.catch((e: Error) => toast(e.message, "error"))
											}
										>
											<Mail size={14} /> Magic link
										</Button>
									</Td>
								</tr>
							))}
						</tbody>
					</Table>
				)}
			</Card>

			<Card>
				<CardHeader
					title="Pending invitations"
					description="Links that have not been accepted yet. Each link expires after 7 days."
				/>
				{invitations.length === 0 ? (
					<p className="p-4 text-muted-foreground">No pending invitations.</p>
				) : (
					<Table>
						<thead>
							<tr>
								<Th>Email</Th>
								<Th>Role</Th>
								<Th>Expires</Th>
								<Th />
							</tr>
						</thead>
						<tbody>
							{invitations.map((invite) => (
								<tr key={invite.id}>
									<Td>{invite.email}</Td>
									<Td>
										<Badge tone="neutral">{invite.role}</Badge>
									</Td>
									<Td className="text-muted-foreground">{new Date(invite.expiresAt).toLocaleString()}</Td>
									<Td className="text-end">
										<div className="flex justify-end gap-1">
											<Button
												size="sm"
												variant="ghost"
												onClick={() =>
													void act(async () => {
														await api("POST", "/api/invitations", { email: invite.email, role: invite.role });
														toast("Invitation resent");
													})
												}
											>
												Resend
											</Button>
											<Button
												size="sm"
												variant="ghost"
												onClick={() =>
													void act(async () => {
														await api("DELETE", `/api/invitations/${invite.id}`);
														toast("Invitation revoked");
													})
												}
											>
												Revoke
											</Button>
										</div>
									</Td>
								</tr>
							))}
						</tbody>
					</Table>
				)}
			</Card>

			<Card>
				<CardHeader title="API tokens" description="Bearer tokens for scripts and CI. The value is shown once." />
				<div className="grid gap-3 p-4">
					<div className="flex flex-wrap items-end gap-2">
						<Input label="Token name" value={tokenName} onChange={(e) => setTokenName(e.target.value)} />
						<Select
							label="Access"
							value={tokenScope}
							onChange={(e) => setTokenScope(e.target.value as typeof tokenScope)}
						>
							{Object.entries(TOKEN_SCOPES).map(([key, scope]) => (
								<option key={key} value={key}>
									{scope.label}
								</option>
							))}
						</Select>
						<Select label="Expires" value={tokenDays} onChange={(e) => setTokenDays(e.target.value)}>
							<option value="">Never</option>
							<option value="30">In 30 days</option>
							<option value="90">In 90 days</option>
							<option value="365">In a year</option>
						</Select>
						<Button
							variant="secondary"
							disabled={!tokenName.trim()}
							onClick={() =>
								void api<{ data: { token: string } }>("POST", "/api/tokens", {
									name: tokenName.trim(),
									...(TOKEN_SCOPES[tokenScope].permissions
										? { permissions: TOKEN_SCOPES[tokenScope].permissions }
										: {}),
									...(tokenDays
										? { expiresAt: new Date(Date.now() + Number(tokenDays) * 86_400_000).toISOString() }
										: {}),
								}).then((res) => {
									setCreatedToken(res.data.token);
									setTokenName("");
									void load();
								})
							}
						>
							Create token
						</Button>
					</div>
					{createdToken && (
						<div className="grid gap-2 rounded-ui border border-border bg-secondary p-3">
							<p className="text-sm font-medium">Copy this token now; it will not be shown again.</p>
							<code className="break-all text-xs">{createdToken}</code>
						</div>
					)}
					{tokens.length > 0 && (
						<Table>
							<thead>
								<tr>
									<Th>Name</Th>
									<Th>Access</Th>
									<Th>Expires</Th>
									<Th>Created</Th>
									<Th>Last used</Th>
									<Th />
								</tr>
							</thead>
							<tbody>
								{tokens.map((token) => (
									<tr key={token.id}>
										<Td>{token.name}</Td>
										<Td className="text-muted-foreground">{token.permissions?.length ?? 0} permissions</Td>
										<Td className="text-muted-foreground">
											{token.expiresAt ? new Date(token.expiresAt).toLocaleDateString() : "never"}
										</Td>
										<Td className="text-muted-foreground">{new Date(token.createdAt).toLocaleDateString()}</Td>
										<Td className="text-muted-foreground">
											{token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString() : "never"}
										</Td>
										<Td className="text-end">
											<Button
												size="sm"
												variant="ghost"
												onClick={() => void api("DELETE", `/api/tokens/${token.id}`).then(load)}
											>
												Revoke
											</Button>
										</Td>
									</tr>
								))}
							</tbody>
						</Table>
					)}
				</div>
			</Card>

			{matrix && (
				<Card>
					<CardHeader
						title="Roles and permissions"
						description="What each built-in role can do. Tokens can only narrow these."
					/>
					<div className="overflow-x-auto p-4">
						<Table>
							<thead>
								<tr>
									<Th>Permission</Th>
									{matrix.roles.map((r) => (
										<Th key={r.name}>{r.name}</Th>
									))}
								</tr>
							</thead>
							<tbody>
								{matrix.permissions.map((p) => (
									<tr key={p}>
										<Td className="font-mono text-xs">{p}</Td>
										{matrix.roles.map((r) => (
											<Td key={r.name} aria-label={`${r.name} ${r.permissions.includes(p) ? "can" : "cannot"} ${p}`}>
												{r.permissions.includes(p) ? "✓" : "—"}
											</Td>
										))}
									</tr>
								))}
							</tbody>
						</Table>
					</div>
				</Card>
			)}

			<Dialog
				open={inviteOpen}
				title="Invite a user"
				onClose={() => setInviteOpen(false)}
				footer={
					<>
						<Button variant="ghost" onClick={() => setInviteOpen(false)}>
							Cancel
						</Button>
						<Button type="submit" form="invite-user" disabled={inviteBusy}>
							Send invitation
						</Button>
					</>
				}
			>
				<form id="invite-user" onSubmit={sendInvite} className="grid gap-3">
					<Input
						label="Email"
						type="email"
						value={inviteForm.email}
						onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
						required
						hint="They will receive a link to choose their name and password."
					/>
					<Select
						label="Role"
						value={inviteForm.role}
						onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
					>
						{ROLES.map((r) => (
							<option key={r}>{r}</option>
						))}
					</Select>
					<ErrorText>{inviteError}</ErrorText>
				</form>
			</Dialog>

			<Dialog
				open={open}
				title="Add a user"
				onClose={() => setOpen(false)}
				footer={
					<>
						<Button variant="ghost" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button type="submit" form="create-user">
							Add user
						</Button>
					</>
				}
			>
				<form id="create-user" onSubmit={create} className="grid gap-3">
					<Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
					<Input
						label="Email"
						type="email"
						value={form.email}
						onChange={(e) => setForm({ ...form, email: e.target.value })}
						required
					/>
					<Input
						label="Temporary password"
						type="password"
						minLength={8}
						autoComplete="new-password"
						value={form.password}
						onChange={(e) => setForm({ ...form, password: e.target.value })}
						required
						hint="Share it securely; the user can change it after signing in."
					/>
					<Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
						{ROLES.map((r) => (
							<option key={r}>{r}</option>
						))}
					</Select>
				</form>
			</Dialog>

			<UserSecurityDialog
				user={manage}
				isSelf={manage?.id === currentUserId}
				onClose={() => setManage(null)}
				onChanged={() => void load()}
			/>
		</div>
	);
}
