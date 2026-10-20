export interface UserRow {
	id: string;
	email: string;
	name: string;
	role?: string | null;
	banned?: boolean | null;
	twoFactorEnabled?: boolean | number | null;
}

export interface InvitationRow {
	id: string;
	email: string;
	role: string;
	invitedBy?: string | null;
	createdAt: string;
	expiresAt: string;
}
