import { useStore } from "@nanostores/react";
import { useEffect, useState } from "react";
import {
	$commentCounts,
	$comments,
	$commentsError,
	bulkCommentStatus,
	deleteComment,
	loadComments,
	replyToComment,
	setCommentStatus,
	type CommentStatus,
} from "../../stores/comments.ts";
import {
	Badge,
	Button,
	Card,
	Checkbox,
	EmptyState,
	ErrorText,
	PageHeader,
	Table,
	Tabs,
	Textarea,
	Td,
	Th,
	toast,
} from "../../ui/index.tsx";

const tabs: Array<{ value: CommentStatus | "all"; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "pending", label: "Pending" },
	{ value: "approved", label: "Approved" },
	{ value: "spam", label: "Spam" },
	{ value: "trash", label: "Trash" },
];

export function CommentsPage() {
	const comments = useStore($comments);
	const counts = useStore($commentCounts);
	const error = useStore($commentsError);
	const [tab, setTab] = useState<CommentStatus | "all">("pending");
	const [selected, setSelected] = useState<string[]>([]);
	const [replying, setReplying] = useState<string | null>(null);
	const [reply, setReply] = useState("");

	useEffect(() => void loadComments(tab), [tab]);

	const toggle = (id: string) => setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

	return (
		<div className="grid gap-4">
			<PageHeader title="Comments" description="Moderate reader comments." />
			<ErrorText>{error}</ErrorText>
			<Tabs
				value={tab}
				onChange={setTab}
				items={tabs.map((t) => ({ value: t.value, label: `${t.label} (${counts[t.value]})` }))}
			/>
			{selected.length > 0 && (
				<div className="flex flex-wrap items-center gap-2 rounded-ui border border-border bg-card p-2 text-sm">
					<span>{selected.length} selected</span>
					<Button size="sm" onClick={() => void bulkCommentStatus(selected, "approved").then(() => setSelected([]))}>
						Approve
					</Button>
					<Button
						size="sm"
						variant="secondary"
						onClick={() => void bulkCommentStatus(selected, "spam").then(() => setSelected([]))}
					>
						Spam
					</Button>
					<Button
						size="sm"
						variant="secondary"
						onClick={() => void bulkCommentStatus(selected, "trash").then(() => setSelected([]))}
					>
						Trash
					</Button>
				</div>
			)}
			<Card>
				{comments.length === 0 ? (
					<div className="p-4">
						<EmptyState title="No comments" description="Comments submitted on the site appear here." />
					</div>
				) : (
					<Table>
						<thead>
							<tr>
								<Th />
								<Th>Author</Th>
								<Th>Comment</Th>
								<Th>Entry</Th>
								<Th>Status</Th>
								<Th />
							</tr>
						</thead>
						<tbody>
							{comments.map((comment) => (
								<tr key={comment.id} className="hover:bg-secondary">
									<Td>
										<Checkbox
											aria-label={`Select comment by ${comment.author}`}
											checked={selected.includes(comment.id)}
											onChange={() => toggle(comment.id)}
										/>
									</Td>
									<Td>
										<div className="font-medium">{comment.author}</div>
										{comment.email && <div className="text-xs text-muted-foreground">{comment.email}</div>}
									</Td>
									<Td className="max-w-md">
										{comment.parentId && (
											<p className="text-xs text-muted-foreground">↳ reply{comment.staff ? " (staff)" : ""}</p>
										)}
										<p className="line-clamp-3 whitespace-pre-wrap text-sm">{comment.body}</p>
										{replying === comment.id && (
											<form
												className="mt-2 grid gap-2"
												onSubmit={(e) => {
													e.preventDefault();
													void replyToComment(comment.id, reply)
														.then(() => {
															setReplying(null);
															toast("Reply posted");
														})
														.catch((err: Error) => toast(err.message, "error"));
												}}
											>
												<Textarea
													label={`Your reply to ${comment.author}`}
													value={reply}
													onChange={(e) => setReply(e.target.value)}
												/>
												<Button size="sm" type="submit" disabled={!reply.trim()}>
													Post reply
												</Button>
											</form>
										)}
									</Td>
									<Td className="text-xs text-muted-foreground">
										{comment.collection}/{comment.slug}
									</Td>
									<Td>
										<Badge
											tone={
												comment.status === "approved" ? "success" : comment.status === "spam" ? "danger" : "warning"
											}
										>
											{comment.status}
										</Badge>
									</Td>
									<Td className="whitespace-nowrap text-end">
										<Button size="sm" variant="ghost" onClick={() => void setCommentStatus(comment.id, "approved")}>
											Approve
										</Button>
										<Button
											size="sm"
											variant="ghost"
											aria-label={`Reply to ${comment.author}`}
											onClick={() => {
												setReplying(replying === comment.id ? null : comment.id);
												setReply("");
											}}
										>
											Reply
										</Button>
										<Button size="sm" variant="ghost" onClick={() => void setCommentStatus(comment.id, "spam")}>
											Spam
										</Button>
										<Button size="sm" variant="ghost" onClick={() => void setCommentStatus(comment.id, "trash")}>
											Trash
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => {
												if (confirm("Delete permanently?")) void deleteComment(comment.id);
											}}
										>
											Delete
										</Button>
									</Td>
								</tr>
							))}
						</tbody>
					</Table>
				)}
				{comments.length < counts[tab] && (
					<div className="p-2 text-center">
						<Button variant="secondary" onClick={() => void loadComments(tab, true)}>
							Load more ({counts[tab] - comments.length} left)
						</Button>
					</div>
				)}
			</Card>
		</div>
	);
}
