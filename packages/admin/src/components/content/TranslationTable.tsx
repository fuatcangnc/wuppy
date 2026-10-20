import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/index.tsx";

export interface TranslationRow {
	key: string;
	translations: Record<string, string>;
	missing: string[];
}

interface Props {
	collection: string;
	locales: string[];
	rows: TranslationRow[];
	/** Router-agnostic link renderer: (label, slug) -> element. */
	renderLink: (label: string, slug: string) => ReactNode;
}

export function TranslationTable({ locales, rows, renderLink }: Props) {
	if (locales.length === 0) return <p className="text-muted-foreground">Add `locales` to wuppy.config to manage translations.</p>;
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Entry</TableHead>
					{locales.map((l) => (
						<TableHead key={l}>{l}</TableHead>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => (
					<TableRow key={row.key}>
						<TableHead className="font-normal">{row.key}</TableHead>
						{locales.map((l) => (
							<TableCell key={l}>
								{row.translations[l] ? (
									renderLink("Open", row.translations[l])
								) : (
									<span className="flex items-center gap-2">
										<span className="text-destructive">Missing</span>
										{renderLink(`Translate to ${l}`, `${l}/${row.key}`)}
									</span>
								)}
							</TableCell>
						))}
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
