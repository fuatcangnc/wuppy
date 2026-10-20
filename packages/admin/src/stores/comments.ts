import { atom } from "nanostores";
import { apiData } from "../lib/api.ts";

export type CommentStatus = "pending" | "approved" | "spam" | "trash";
export interface Comment {
	id: string;
	collection: string;
	slug: string;
	author: string;
	email: string | null;
	body: string;
	status: CommentStatus;
	parentId?: string | null;
	staff?: boolean;
	createdAt: string;
}

export const $comments = atom<Comment[]>([]);
export const $commentCounts = atom<Record<CommentStatus | "all", number>>({
	all: 0,
	pending: 0,
	approved: 0,
	spam: 0,
	trash: 0,
});
export const $commentsError = atom<string | null>(null);

const PAGE = 50;

/** `append` loads the next page after what is already shown. */
export async function loadComments(status: CommentStatus | "all" = "all", append = false): Promise<void> {
	$commentsError.set(null);
	try {
		const offset = append ? $comments.get().length : 0;
		const result = await apiData<Comment[]>("GET", `/api/comments?status=${status}&limit=${PAGE}&offset=${offset}`);
		$comments.set(append ? [...$comments.get(), ...result] : result);
		const counts = await apiData<Record<CommentStatus | "all", number>>("GET", "/api/comments/counts");
		$commentCounts.set(counts);
	} catch (e) {
		$commentsError.set((e as Error).message);
	}
}

export async function setCommentStatus(id: string, status: CommentStatus): Promise<void> {
	await apiData("PATCH", `/api/comments/${id}`, { status });
	await loadComments();
}

export async function bulkCommentStatus(ids: string[], status: CommentStatus): Promise<void> {
	await apiData("POST", "/api/comments/bulk", { ids, status });
	await loadComments();
}

export async function deleteComment(id: string): Promise<void> {
	await apiData("DELETE", `/api/comments/${id}`);
	await loadComments();
}

export async function replyToComment(id: string, body: string): Promise<void> {
	await apiData("POST", `/api/comments/${id}/reply`, { body });
	await loadComments();
}
