import {
	ChevronLeft,
	ChevronRight,
	Mail,
	Plus,
	Search,
	ShieldCheck,
	Trash2,
	UserRound,
} from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../../lib/api.ts";
import { $session } from "../../stores/session.ts";
import {
	Badge,
	Button,
	Card,
	CardHeader,
	Dialog,
	EmptyState,
	ErrorText,
	Input,
	Select,
	Table,
	Td,
	Th,
	toast,
} from "../../ui/index.tsx";
import { ActionMenu } from "../shared/ActionMenu.tsx";
import { WorkspaceLayout, WorkspacePanel, WorkspaceSidebar } from "../shared/WorkspaceLayout.tsx";
import { UserSecurityDialog } from "./UserSecurityDialog.tsx";
import type { InvitationRow, UserRow } from "./types.ts";

const ROLES = ["admin", "editor", "author", "viewer", "client"];

/** What a token may do. "same" sends no list, so the server uses the creator's own permissions. */
export const TOKEN_SCOPES = {
	same: { label: "Everything I can do", permissions: undefined },
	read: { label: "Read content only", permissions: ["content:read"] },
	write: { label: "Read and write content", permissions: ["content:read", "content:write", "media:write"] },
	publish: {
		label: "Write and publish content",
		permissions: ["content:read", "content:write", "content:publish", "content:schedule", "media:write"],
	},
	// Lets another Wuppy manage this site. Users, tokens, plugins and backups stay with this site's own admins.
	hub: {
		label: "Connect to a hub (manage this site from another Wuppy)",
		permissions: [
			"content:read",
			"content:write",
			"content:delete",
			"content:publish",
			"content:schedule",
			"media:write",
			"media:delete",
			"comments:read",
			"comments:moderate",
			"menus:manage",
			"widgets:manage",
			"sections:manage",
			"taxonomies:manage",
			"bylines:manage",
			"content-types:manage",
			"themes:manage",
			"site:settings",
			"git:read",
			"git:revert",
			"audit:read",
		],
	},
} as const;

const requestMagicLink = (user: UserRow) =>
	void api("POST", "/api/auth/sign-in/magic-link", { email: user.email, callbackURL: "/admin/" })
		.then(() => toast("Magic link requested"))
		.catch((failure: Error) => toast(failure.message, "error"));

export function UsersPage() {
	const session = useStore($session);
	const currentUserId = session.status === "authed" ? session.user.id : null;
	const [users, setUsers] = useState<UserRow[] | null>(null);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const [tokens, setTokens] = useState<
		Array<{
			id: string;
			name: string;
			createdAt: string;
			lastUsedAt: string | null;
			expiresAt?: string | null;
			permissions?: string[];
			kind?: "user" | "hub";
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
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [userQuery, setUserQuery] = useState("");
	const [userFilter, setUserFilter] = useState<"all" | "active" | "disabled">("all");
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
	const filteredUsers = useMemo(
		() =>
			(users ?? []).filter(
				(user) =>
					(!userQuery.trim() ||
						`${user.name ?? ""} ${user.email}`.toLowerCase().includes(userQuery.trim().toLowerCase())) &&
					(userFilter === "all" ? true : userFilter === "disabled" ? user.banned === true : user.banned !== true),
			),
		[users, userQuery, userFilter],
	);
	const pageCount = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
	const currentPage = Math.min(page, pageCount);
	const visibleUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
	const selectedUser = users?.find((user) => user.id === selectedId) ?? null;
	const activeCount = (users ?? []).filter((user) => user.banned !== true).length;
	const disabledCount = (users ?? []).length - activeCount;
	useEffect(() => {
		if (page > pageCount) setPage(pageCount);
	}, [page, pageCount]);
	useEffect(() => {
		if (selectedId && users && !users.some((user) => user.id === selectedId)) setSelectedId(null);
	}, [users, selectedId]);

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

	const toggleBanned = (user: UserRow) =>
		void act(() =>
			api("POST", user.banned ? "/api/auth/admin/unban-user" : "/api/auth/admin/ban-user", {
				userId: user.id,
			}),
		);
	const removeUser = (user: UserRow) => {
		if (confirm(`Remove ${user.email}?`))
			void act(() => api("POST", "/api/auth/admin/remove-user", { userId: user.id }));
	};

	return (
		<div className="grid gap-4">
			<ErrorText>{error}</ErrorText>
			<WorkspaceLayout sidebarWidth={340}>
				<WorkspaceSidebar>
					<div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
						<div className="grid gap-0.5">
							<h1 className="text-base font-semibold">Users</h1>
							<p className="text-[11px] text-muted-foreground">
								{users?.length ?? 0} {(users?.length ?? 0) === 1 ? "account" : "accounts"} · roles and access
							</p>
						</div>
						<div className="flex items-center gap-1">
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="Invite user"
								title="Invite user"
								onClick={() => {
									setInviteError(null);
									setInviteOpen(true);
								}}
							>
								<Mail size="1em" />
							</Button>
							<Button
								variant="secondary"
								size="icon-sm"
								style={{ borderRadius: "200px" }}
								className="border-border bg-white text-[#101011] shadow-sm hover:bg-zinc-200!"
								aria-label="Add user"
								title="Add user"
								onClick={() => setOpen(true)}
							>
								<Plus size="1em" />
							</Button>
						</div>
					</div>
					<div className="border-b border-border">
						<div className="relative">
							<Search
								size="1em"
								className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-muted-foreground"
							/>
							<Input
								aria-label="Search users"
								className="h-12 rounded-none border-transparent bg-transparent pr-4 pl-11 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
								value={userQuery}
								onChange={(event) => {
									setUserQuery(event.target.value);
									setPage(1);
								}}
								placeholder="Search users..."
							/>
						</div>
					</div>
					<div className="flex items-center gap-1 overflow-x-auto border-b border-border px-3 py-2">
						{[
							{ id: "all", label: "All", count: users?.length ?? 0 },
							{ id: "active", label: "Active", count: activeCount },
							{ id: "disabled", label: "Disabled", count: disabledCount },
						].map((tab) => (
							<button
								key={tab.id}
								type="button"
								aria-pressed={userFilter === tab.id}
								onClick={() => {
									setUserFilter(tab.id as typeof userFilter);
									setPage(1);
								}}
								className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs ${
									userFilter === tab.id
										? "bg-tab text-foreground"
										: "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
								}`}
							>
								{tab.label} <span className="text-muted-foreground">({tab.count})</span>
							</button>
						))}
					</div>
					<div className="flex items-center justify-between border-b border-border px-3 py-2 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
						<span>
							{filteredUsers.length} {filteredUsers.length === 1 ? "user" : "users"}
						</span>
						<div className="flex items-center gap-1">
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="Previous users page"
								disabled={currentPage <= 1}
								onClick={() => setPage(currentPage - 1)}
							>
								<ChevronLeft size={13} />
							</Button>
							<span className="tabular-nums">
								Page {currentPage} / {pageCount}
							</span>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="Next users page"
								disabled={currentPage >= pageCount}
								onClick={() => setPage(currentPage + 1)}
							>
								<ChevronRight size={13} />
							</Button>
						</div>
					</div>
					<div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
						{users === null ? (
							<p role="status" className="px-4 py-8 text-center text-xs text-muted-foreground">
								Loading users…
							</p>
						) : visibleUsers.length === 0 ? (
							<EmptyState
								title={filteredUsers.length === 0 && users.length === 0 ? "No users yet" : "No matches"}
								description={
									filteredUsers.length === 0 && users.length === 0
										? "Invite a colleague or add a user."
										: "Try a different search or filter."
								}
								action={<Button onClick={() => setOpen(true)}>+ Add user</Button>}
							/>
						) : (
							<div className="grid gap-1">
								{visibleUsers.map((user) => (
									<button
										key={user.id}
										type="button"
										aria-label={`Open ${user.email}`}
										aria-current={selectedId === user.id ? "true" : undefined}
										onClick={() => setSelectedId(user.id)}
										className={`flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left ${
											selectedId === user.id
												? "border-primary/60 bg-tab text-foreground"
												: "border-transparent text-muted-foreground hover:bg-muted/60"
										}`}
									>
										<span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary font-medium text-muted-foreground">
											{(user.name || user.email).charAt(0).toUpperCase()}
										</span>
										<span className="min-w-0 flex-1">
											<span className="block truncate text-sm font-medium text-foreground">
												{user.name || user.email}
											</span>
											<span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{user.email}</span>
										</span>
										<span className="grid justify-items-end gap-1">
											<Badge tone={user.role === "admin" ? "accent" : "neutral"}>{user.role ?? "viewer"}</Badge>
											<span
												className={`size-1.5 rounded-full ${user.banned ? "bg-destructive" : "bg-emerald-500"}`}
												aria-label={user.banned ? "Disabled" : "Active"}
											/>
										</span>
									</button>
								))}
							</div>
						)}
					</div>
					<div className="flex items-center justify-between gap-2 border-t border-border p-2">
						<Select
							aria-label="Per page"
							size="sm"
							className="w-[4.25rem]"
							value={String(pageSize)}
							onChange={(event) => {
								setPageSize(Number(event.target.value));
								setPage(1);
							}}
						>
							{[10, 20, 50, 100].map((size) => (
								<option key={size} value={size}>
									{size}
								</option>
							))}
						</Select>
					</div>
				</WorkspaceSidebar>
				<WorkspacePanel className="grid-rows-[auto_minmax(0,1fr)]">
					{selectedUser && (
						<header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
							<div className="grid min-w-0 gap-1">
								<h2 className="truncate text-xl font-semibold">{selectedUser.name || selectedUser.email}</h2>
								<p className="truncate text-xs text-muted-foreground">{selectedUser.email}</p>
							</div>
							<div className="flex items-center gap-1">
								<Button variant="secondary" size="sm" onClick={() => setManage(selectedUser)}>
									<ShieldCheck size={14} /> Manage
								</Button>
								<ActionMenu
									label="User actions"
									items={[
										{ label: "Magic link", icon: <Mail size="1em" />, onSelect: () => requestMagicLink(selectedUser) },
										{
											label: selectedUser.banned ? "Enable user" : "Disable user",
											icon: <ShieldCheck size="1em" />,
											onSelect: () => toggleBanned(selectedUser),
										},
										{
											label: "Remove user",
											icon: <Trash2 size="1em" />,
											destructive: true,
											onSelect: () => removeUser(selectedUser),
										},
									]}
								/>
							</div>
						</header>
					)}
					<div className="custom-scrollbar min-h-0 overflow-y-auto">
						<div className="grid gap-5 p-5">
							{selectedUser ? (
								<div className="grid gap-4 rounded-xl border border-border bg-card p-5">
									<div className="grid gap-4 sm:grid-cols-2">
										<div className="grid gap-1.5">
											<span className="text-xs font-medium tracking-wider text-zinc-400 uppercase">Role</span>
											<Select
												aria-label={`Role for ${selectedUser.email}`}
												value={selectedUser.role ?? "viewer"}
												onChange={(event) =>
													void act(() =>
														api("POST", "/api/auth/admin/set-role", {
															userId: selectedUser.id,
															role: event.target.value,
														}),
													)
												}
											>
												{ROLES.map((role) => (
													<option key={role}>{role}</option>
												))}
											</Select>
										</div>
										<div className="grid gap-1.5">
											<span className="text-xs font-medium tracking-wider text-zinc-400 uppercase">Status</span>
											<Badge tone={selectedUser.banned ? "danger" : "success"}>
												{selectedUser.banned ? "Disabled" : "Active"}
											</Badge>
										</div>
										<div className="grid gap-1.5">
											<span className="text-xs font-medium tracking-wider text-zinc-400 uppercase">Two-factor</span>
											<span className="text-sm">{selectedUser.twoFactorEnabled ? "Enabled" : "Not enabled"}</span>
										</div>
										<div className="grid gap-1.5">
											<span className="text-xs font-medium tracking-wider text-zinc-400 uppercase">User ID</span>
											<code className="truncate text-xs">{selectedUser.id}</code>
										</div>
									</div>
									<div className="flex flex-wrap gap-2">
										<Button variant="secondary" size="sm" onClick={() => setManage(selectedUser)}>
											<ShieldCheck size={14} /> Manage access
										</Button>
										<Button variant="secondary" size="sm" onClick={() => requestMagicLink(selectedUser)}>
											<Mail size={14} /> Magic link
										</Button>
										<Button variant="secondary" size="sm" onClick={() => toggleBanned(selectedUser)}>
											{selectedUser.banned ? "Enable" : "Disable"}
										</Button>
										<Button
											variant="ghost"
											size="sm"
											className="text-destructive"
											onClick={() => removeUser(selectedUser)}
										>
											Remove
										</Button>
									</div>
								</div>
							) : (
								<div className="grid min-h-[240px] place-items-center rounded-xl border border-dashed border-border bg-card/40 p-6 text-center">
									<div className="grid max-w-sm justify-items-center gap-2">
										<span className="grid size-16 place-items-center rounded-full bg-secondary text-muted-foreground">
											<UserRound size={24} />
										</span>
										<p className="font-medium">User details</p>
										<p className="text-sm text-muted-foreground">
											Select a user from the list to manage their role and access.
										</p>
									</div>
								</div>
							)}

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
								<CardHeader
									title="API tokens"
									description="Bearer tokens for scripts and CI. The value is shown once."
								/>
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
											{/* Hub tokens must expire; "Never" falls back to a year for them. */}
											<option value="">{tokenScope === "hub" ? "In a year" : "Never"}</option>
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
													...(tokenScope === "hub" ? { kind: "hub" } : {}),
													...(TOKEN_SCOPES[tokenScope].permissions
														? { permissions: TOKEN_SCOPES[tokenScope].permissions }
														: {}),
													...(tokenDays || tokenScope === "hub"
														? {
																expiresAt: new Date(
																	Date.now() + Number(tokenDays || 365) * 86_400_000 - 60_000,
																).toISOString(),
															}
														: {}),
												})
													.then((res) => {
														setCreatedToken(res.data.token);
														setTokenName("");
														void load();
													})
													.catch((failure: Error) => toast(failure.message, "error"))
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
														<Td>
															{token.name} {token.kind === "hub" && <Badge>Hub</Badge>}
														</Td>
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
															<Td
																key={r.name}
																aria-label={`${r.name} ${r.permissions.includes(p) ? "can" : "cannot"} ${p}`}
															>
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
						</div>
					</div>
				</WorkspacePanel>
			</WorkspaceLayout>
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
