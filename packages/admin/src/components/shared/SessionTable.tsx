import { Badge, Button, Table, Td, Th } from "../../ui/index.tsx";

export interface SessionInfo {
	id: string;
	token: string;
	createdAt: string | Date;
	expiresAt: string | Date;
	ipAddress?: string | null;
	userAgent?: string | null;
}

const browserName = (ua: string): string => {
	if (/Edg\//i.test(ua)) return "Edge";
	if (/OPR\//i.test(ua)) return "Opera";
	if (/Firefox\//i.test(ua)) return "Firefox";
	if (/Chrome\//i.test(ua)) return "Chrome";
	if (/Safari\//i.test(ua)) return "Safari";
	return "Unknown browser";
};

const osName = (ua: string): string => {
	if (/Windows/i.test(ua)) return "Windows";
	if (/Android/i.test(ua)) return "Android";
	if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
	if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
	if (/Linux/i.test(ua)) return "Linux";
	return "Unknown OS";
};

/** A compact, human-readable label without pulling in a UA parser dependency. */
export function deviceLabel(userAgent?: string | null): string {
	if (!userAgent) return "Unknown device";
	return `${browserName(userAgent)} on ${osName(userAgent)}`;
}

function formatDate(value: string | Date): string {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "—";
	return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function SessionTable({
	sessions,
	currentToken,
	onRevoke,
	busyToken,
}: {
	sessions: SessionInfo[];
	currentToken?: string | null;
	onRevoke?: (session: SessionInfo) => void;
	busyToken?: string | null;
}) {
	if (sessions.length === 0) {
		return <p className="px-4 py-6 text-sm text-muted-foreground">No active sessions.</p>;
	}
	return (
		<Table>
			<thead>
				<tr>
					<Th>Device</Th>
					<Th>IP</Th>
					<Th>Signed in</Th>
					<Th>Expires</Th>
					{onRevoke && <Th />}
				</tr>
			</thead>
			<tbody>
				{sessions.map((session) => {
					const current = Boolean(currentToken && session.token === currentToken);
					return (
						<tr key={session.id}>
							<Td>
								<div className="flex flex-wrap items-center gap-2">
									<span className="font-medium">{deviceLabel(session.userAgent)}</span>
									{current && <Badge tone="success">This device</Badge>}
								</div>
							</Td>
							<Td className="text-muted-foreground">{session.ipAddress || "—"}</Td>
							<Td className="text-muted-foreground">{formatDate(session.createdAt)}</Td>
							<Td className="text-muted-foreground">{formatDate(session.expiresAt)}</Td>
							{onRevoke && (
								<Td className="text-end">
									{current ? (
										<span className="text-xs text-muted-foreground">Current</span>
									) : (
										<Button
											size="sm"
											variant="ghost"
											disabled={busyToken === session.token}
											onClick={() => onRevoke(session)}
										>
											Revoke
										</Button>
									)}
								</Td>
							)}
						</tr>
					);
				})}
			</tbody>
		</Table>
	);
}
