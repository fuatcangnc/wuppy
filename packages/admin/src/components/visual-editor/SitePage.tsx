import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { api, apiData } from "../../lib/api.ts";
import { collectionOfKind, type CollectionInfo } from "../../stores/content.ts";
import { Spinner } from "../../ui/index.tsx";
import { StudioBar } from "../shared/StudioBar.tsx";

interface PageList {
	data: Array<{ slug: string }>;
}

/** `/site` opens the site editor on the home page (or the first available page), like a site workspace. */
export function SitePage() {
	const navigate = useNavigate();
	const [empty, setEmpty] = useState(false);
	useEffect(() => {
		void apiData<CollectionInfo[]>("GET", "/api/collections")
			.then(async (collections) => {
				const collection = collectionOfKind(collections, "pages") ?? "pages";
				const result = await api<PageList>("GET", `/api/content/${collection}?limit=200&sort=title`);
				const pages = Array.isArray(result.data) ? result.data : [];
				const page =
					pages.find((entry) => entry.slug === "index") ?? pages.find((entry) => entry.slug === "home") ?? pages[0];
				if (!page) {
					setEmpty(true);
					return;
				}
				void navigate({ to: "/v/$collection/$", params: { collection, _splat: page.slug }, replace: true });
			})
			.catch(() => setEmpty(true));
	}, [navigate]);
	return (
		<div className="fixed inset-0 z-40 flex flex-col bg-[#1d1d1f] text-[#f4f4f5]">
			<StudioBar active="site" />
			<div className="grid flex-1 place-items-center p-8">
				{empty ? (
					<div className="grid max-w-sm justify-items-center gap-2 text-center">
						<p className="text-lg font-semibold">No pages yet</p>
						<p className="text-sm text-[#a1a1aa]">Create a page in Content, then open it here to edit visually.</p>
					</div>
				) : (
					<Spinner />
				)}
			</div>
		</div>
	);
}
