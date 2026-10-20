import { useStore } from "@nanostores/react";
import { useEffect, useState } from "react";
import { $trash, deleteTrash, loadTrash, restoreTrash } from "../../stores/content.ts";
import { Button, DataPagination, EmptyState, PageHeader, Table, Td, Th } from "../../ui/index.tsx";

export function TrashPage() {
	const items = useStore($trash);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	useEffect(() => void loadTrash(), []);
	const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
	const currentPage = Math.min(page, pageCount);
	const visible = items.slice((currentPage - 1) * pageSize, currentPage * pageSize);
	useEffect(() => {
		if (page > pageCount) setPage(pageCount);
	}, [page, pageCount]);
	return (
		<div className="grid gap-4">
			<PageHeader title="Trash" description="Deleted entries. Restore them or remove them permanently." />
			{items.length === 0 ? (
				<EmptyState title="Trash is empty" description="Deleted entries stay here until you remove them." />
			) : (
				<div className="overflow-hidden rounded-lg border border-border bg-card">
					<Table>
						<thead>
							<tr>
								<Th>Title</Th>
								<Th>Collection</Th>
								<Th>Deleted</Th>
								<Th />
							</tr>
						</thead>
						<tbody>
							{visible.map((item) => (
								<tr key={`${item.collection}:${item.slug}`}>
									<Td>{item.title}</Td>
									<Td className="text-muted-foreground">
										{item.collection}/{item.slug}
									</Td>
									<Td className="text-muted-foreground">{new Date(item.deletedAt).toLocaleString()}</Td>
									<Td className="whitespace-nowrap text-end">
										<Button size="sm" variant="secondary" onClick={() => void restoreTrash(item)}>
											Restore
										</Button>
										<Button
											size="sm"
											variant="destructive"
											onClick={() => {
												if (confirm("Delete permanently? This cannot be undone from the panel."))
													void deleteTrash(item);
											}}
										>
											Delete forever
										</Button>
									</Td>
								</tr>
							))}
						</tbody>
					</Table>
					<DataPagination
						page={currentPage}
						pageCount={pageCount}
						pageSize={pageSize}
						total={items.length}
						onPageChange={setPage}
						onPageSizeChange={(nextSize) => {
							setPageSize(nextSize);
							setPage(1);
						}}
					/>
				</div>
			)}
		</div>
	);
}
