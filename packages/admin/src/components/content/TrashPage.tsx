import { useStore } from "@nanostores/react";
import { useEffect } from "react";
import { $trash, deleteTrash, loadTrash, restoreTrash } from "../../stores/content.ts";
import { Button, EmptyState, PageHeader, Table, Td, Th } from "../../ui/index.tsx";

export function TrashPage() {
	const items = useStore($trash);
	useEffect(() => void loadTrash(), []);
	return (
		<div className="grid gap-4">
			<PageHeader title="Trash" description="Deleted entries. Restore them or remove them permanently." />
			{items.length === 0 ? (
				<EmptyState title="Trash is empty" description="Deleted entries stay here until you remove them." />
			) : (
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
						{items.map((item) => (
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
											if (confirm("Delete permanently? This cannot be undone from the panel.")) void deleteTrash(item);
										}}
									>
										Delete forever
									</Button>
								</Td>
							</tr>
						))}
					</tbody>
				</Table>
			)}
		</div>
	);
}
