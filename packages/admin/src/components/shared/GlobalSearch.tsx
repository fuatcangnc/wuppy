import { useEffect, useRef, useState } from "react";
import { apiData } from "../../lib/api.ts";
import { Input } from "../../ui/index.tsx";

interface Hit {
	collection: string;
	slug: string;
	title: string;
	excerpt: string;
}

export function GlobalSearch() {
	const [query, setQuery] = useState("");
	const [hits, setHits] = useState<Hit[]>([]);
	const [open, setOpen] = useState(false);
	const box = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				document.getElementById("global-search")?.focus();
			}
			if (event.key === "Escape") setOpen(false);
		};
		addEventListener("keydown", onKey);
		return () => removeEventListener("keydown", onKey);
	}, []);

	useEffect(() => {
		if (query.trim().length < 2) {
			setHits([]);
			return;
		}
		const timer = setTimeout(() => {
			void apiData<Hit[]>("GET", `/api/search?q=${encodeURIComponent(query.trim())}`)
				.then((items) => {
					setHits(items);
					setOpen(true);
				})
				.catch(() => setHits([]));
		}, 200);
		return () => clearTimeout(timer);
	}, [query]);

	useEffect(() => {
		const onDown = (event: MouseEvent) => {
			if (!box.current?.contains(event.target as Node)) setOpen(false);
		};
		addEventListener("mousedown", onDown);
		return () => removeEventListener("mousedown", onDown);
	}, []);

	return (
		<div ref={box} className="relative hidden md:block">
			<Input
				id="global-search"
				type="search"
				aria-label="Search content"
				placeholder="Search content… ⌘K"
				value={query}
				onFocus={() => hits.length && setOpen(true)}
				onChange={(e) => setQuery(e.target.value)}
				className="w-56"
			/>
			{open && hits.length > 0 && (
				<ul className="absolute end-0 top-full z-40 mt-1 max-h-80 w-80 overflow-y-auto rounded-ui border border-border bg-card shadow-xl">
					{hits.map((hit) => (
						<li key={`${hit.collection}:${hit.slug}`}>
							<a
								href={`/admin/e/${hit.collection}/${hit.slug}`}
								className="block px-3 py-2 text-sm hover:bg-secondary"
								onClick={() => {
									setOpen(false);
									setQuery("");
								}}
							>
								<span className="font-medium">{hit.title}</span>
								<span className="ms-2 text-xs text-muted-foreground">{hit.collection}</span>
								<span className="mt-0.5 block truncate text-xs text-muted-foreground">{hit.excerpt}</span>
							</a>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
