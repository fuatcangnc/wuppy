import { useStore } from "@nanostores/react";
import { useEffect, useState } from "react";
import {
	$commentCounts,
	$comments,
	$commentsError,
	bulkCommentStatus,
	COMMENTS_PAGE_SIZE,
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
	DataPagination,
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
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(COMMENTS_PAGE_SIZE);
	const [selected, setSelected] = useState<string[]>([]);
	const [replying, setReplying] = useState<string | null>(null);
	const [reply, setReply] = useState("");

	useEffect(() => void loadComments(tab, page, pageSize), [tab, page, pageSize]);
	const pageCount = Math.max(1, Math.ceil(counts[tab] / pageSize));
	useEffect(() => {
		if (page > pageCount) setPage(pageCount);
	}, [page, pageCount]);

	const toggle = (id: string) => setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
	const refresh = async () => {
		await loadComments(tab, page, pageSize);
		setSelected([]);
	};
	const changeTab = (next: CommentStatus | "all") => {
		setTab(next);
		setPage(1);
		setSelected([]);
	};

	return (
		<div className="grid gap-4">
			<PageHeader title="Comments" description="Moderate reader comments." />
			<ErrorText>{error}</ErrorText>
			<Tabs
				value={tab}
				onChange={changeTab}
				items={tabs.map((t) => ({ value: t.value, label: `${t.label} (${counts[t.value]})` }))}
			/>
			{selected.length > 0 && (
				<div className="flex flex-wrap items-center gap-2 rounded-ui border border-border bg-card p-2 text-sm">
					<span>{selected.length} selected</span>
					<Button size="sm" onClick={() => void bulkCommentStatus(selected, "approved").then(refresh)}>
						Approve
					</Button>
					<Button size="sm" variant="secondary" onClick={() => void bulkCommentStatus(selected, "spam").then(refresh)}>
						Spam
					</Button>
					<Button size="sm" variant="secondary" onClick={() => void bulkCommentStatus(selected, "trash").then(refresh)}>
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
														.then(async () => {
															setReplying(null);
															toast("Reply posted");
															await refresh();
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
										<Button
											size="sm"
											variant="ghost"
											onClick={() => void setCommentStatus(comment.id, "approved").then(refresh)}
										>
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
										<Button
											size="sm"
											variant="ghost"
											onClick={() => void setCommentStatus(comment.id, "spam").then(refresh)}
										>
											Spam
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => void setCommentStatus(comment.id, "trash").then(refresh)}
										>
											Trash
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => {
												if (confirm("Delete permanently?")) void deleteComment(comment.id).then(refresh);
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
				{counts[tab] > 0 && (
					<DataPagination
						page={page}
						pageCount={pageCount}
						pageSize={pageSize}
						total={counts[tab]}
						onPageChange={(nextPage) => {
							setPage(nextPage);
							setSelected([]);
						}}
						onPageSizeChange={(nextSize) => {
							setPageSize(nextSize);
							setPage(1);
							setSelected([]);
						}}
					/>
				)}
			</Card>
		</div>
	);
}
