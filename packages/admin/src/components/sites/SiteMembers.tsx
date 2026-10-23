import { Trash2 } from "@react-zero-ui/icon-sprite";
import { useCallback, useEffect, useState } from "react";
import { api, apiData } from "../../lib/api.ts";
import type { ManagedSite } from "../../stores/sites.ts";
import { Button, ErrorText, IconButton, Input, Select, Table, Td, Th, toast } from "../../ui/index.tsx";
import type { UserRow } from "../users/types.ts";

interface Member {
	userId: string;
	email: string;
	name: string;
	role: string;
}

const SITE_ROLES = ["editor", "author", "viewer"];
const rolesFor = (hubRole: string | null | undefined) => (hubRole === "admin" ? ["admin", ...SITE_ROLES] : SITE_ROLES);

/** Who may open this site from here, and as what. Clients only ever see the sites listed for them. */
export function SiteMembers({ site }: { site: ManagedSite }) {
	const [members, setMembers] = useState<Member[] | null>(null);
	const [users, setUsers] = useState<UserRow[]>([]);
	const [pick, setPick] = useState({ userId: "", role: "editor" });
	const [invite, setInvite] = useState({ email: "", role: "editor" });
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			setMembers(await apiData<Member[]>("GET", `/api/sites/${site.id}/members`));
			setUsers((await api<{ users: UserRow[] }>("GET", "/api/auth/admin/list-users?limit=200")).users);
		} catch (failure) {
			setError((failure as Error).message);
		}
	}, [site.id]);
	useEffect(() => void load(), [load]);

	const run = async (fn: () => Promise<unknown>, done: string) => {
		setError(null);
		try {
			await fn();
			toast(done);
			await load();
		} catch (failure) {
			setError((failure as Error).message);
		}
	};
	const setRole = (userId: string, role: string) =>
		run(() => api("PUT", `/api/sites/${site.id}/members/${encodeURIComponent(userId)}`, { role }), "Access updated");
	const hubRole = (userId: string) => users.find((u) => u.id === userId)?.role;
	const candidates = users.filter((u) => !members?.some((m) => m.userId === u.id) && !u.banned);

	return (
		<div className="grid gap-5">
			<p className="text-sm text-muted-foreground">
				Administrators here can open every site. Everyone else, including clients, sees only the sites listed for them,
				with the role chosen below.
			</p>
			{members && members.length > 0 ? (
				<Table>
					<thead>
						<tr>
							<Th>Person</Th>
							<Th>Role on this site</Th>
							<Th />
						</tr>
					</thead>
					<tbody>
						{members.map((m) => (
							<tr key={m.userId}>
								<Td>
									<span className="block font-medium">{m.name || m.email}</span>
									<span className="text-xs text-muted-foreground">{m.email}</span>
								</Td>
								<Td>
									<Select
										aria-label={`Role of ${m.email}`}
										value={m.role}
										onChange={(e) => void setRole(m.userId, e.target.value)}
									>
										{rolesFor(hubRole(m.userId)).map((r) => (
											<option key={r} value={r}>
												{r}
											</option>
										))}
									</Select>
								</Td>
								<Td className="text-end">
									<IconButton
										label={`Remove ${m.email}`}
										onClick={() =>
											void run(
												() => api("DELETE", `/api/sites/${site.id}/members/${encodeURIComponent(m.userId)}`),
												"Access removed",
											)
										}
									>
										<Trash2 size={14} />
									</IconButton>
								</Td>
							</tr>
						))}
					</tbody>
				</Table>
			) : (
				members && <p className="text-sm text-muted-foreground">No members yet.</p>
			)}

			<form
				className="flex flex-wrap items-end gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					void setRole(pick.userId, pick.role).then(() => setPick({ userId: "", role: "editor" }));
				}}
			>
				<Select label="Add a user" value={pick.userId} onChange={(e) => setPick({ ...pick, userId: e.target.value })}>
					<option value="">Choose…</option>
					{candidates.map((u) => (
						<option key={u.id} value={u.id}>
							{u.email}
							{u.role === "client" ? " (client)" : ""}
						</option>
					))}
				</Select>
				<Select label="Role" value={pick.role} onChange={(e) => setPick({ ...pick, role: e.target.value })}>
					{rolesFor(hubRole(pick.userId)).map((r) => (
						<option key={r} value={r}>
							{r}
						</option>
					))}
				</Select>
				<Button type="submit" variant="secondary" disabled={!pick.userId}>
					Add
				</Button>
			</form>

			<form
				className="flex flex-wrap items-end gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					void run(
						() =>
							api("POST", "/api/invitations", {
								email: invite.email,
								role: "client",
								site: { id: site.id, role: invite.role },
							}),
						"Invitation sent",
					).then(() => setInvite({ email: "", role: "editor" }));
				}}
			>
				<Input
					label="Invite a client by email"
					type="email"
					required
					value={invite.email}
					onChange={(e) => setInvite({ ...invite, email: e.target.value })}
				/>
				<Select label="Role" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
					{SITE_ROLES.map((r) => (
						<option key={r} value={r}>
							{r}
						</option>
					))}
				</Select>
				<Button type="submit" variant="secondary" disabled={!invite.email.trim()}>
					Invite
				</Button>
			</form>
			<ErrorText>{error}</ErrorText>
		</div>
	);
}
