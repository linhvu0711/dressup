import type { UseQueryResult } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { ActiveFilters, FilterButton } from "@/components/ui/filter";
import { Notice } from "@/components/ui/notice";
import { useAddressFilter } from "@/components/ui/use-address-filter";
import { countText } from "@/count-text";
import { useColours } from "@/labels/api";
import { useBrands } from "@/labels/brand-api";
import { PieceFilterSheet } from "@/piece-filter/PieceFilterSheet";
import {
	type FilterPiece,
	matchesPieceFilter,
	NO_FILTER,
	pieceFilterChips,
	prunePieceFilter,
	readPieceFilter,
	writePieceFilter,
} from "@/piece-filter/piece-filter";
import { PageHeader } from "../shell/PageHeader";
import { Wall } from "../shell/Wall";

// The Closet and the Wishlist are one page: a wall with its filter and its
// loading, failed, and empty states. Each tab brings its list, its card, its
// placeholder, its error, its words, and its add sheet.
export function PieceTabPage<D, E>({
	title,
	slot,
	query,
	entries,
	toPiece,
	card,
	placeholder,
	failed,
	unit,
	empty,
	addLabel,
	addSheet,
}: {
	title: string;
	slot: "closet" | "wish";
	query: UseQueryResult<D[]>;
	entries: (data: D[]) => E[];
	toPiece: (entry: E) => FilterPiece;
	// The card carries its own key.
	card: (entry: E) => ReactNode;
	placeholder: (i: number) => ReactNode;
	failed: (retry: () => void) => ReactNode;
	// What the counts count, as "item" or "piece".
	unit: string;
	empty: { title: string; text?: string };
	addLabel: string;
	addSheet: (onClose: () => void) => ReactNode;
}) {
	const [adding, setAdding] = useState(false);
	const [filtering, setFiltering] = useState(false);
	const all = query.data === undefined ? [] : entries(query.data);
	const colours = useColours();
	const brands = useBrands();
	const pf = useAddressFilter({
		none: NO_FILTER,
		read: readPieceFilter,
		write: writePieceFilter,
		prune: (f) => prunePieceFilter(f, colours.data, brands.data),
		chips: (f) => pieceFilterChips(f, colours.data, brands.data),
	});
	const shown = all.filter((e) => matchesPieceFilter(pf.filter, toPiece(e)));
	// An empty list still shows picks left in the address, so a piece added
	// later is not hidden by a filter the user cannot see.
	const filterable =
		!query.isPending && !query.isError && (all.length > 0 || pf.count > 0);
	let wall: ReactNode;
	if (query.isPending) {
		wall = <Wall>{Array.from({ length: 6 }, (_, i) => placeholder(i))}</Wall>;
	} else if (query.isError) {
		// Checked before the data: a failed refetch keeps the old list.
		wall = failed(() => void query.refetch());
	} else if (query.data.length === 0) {
		wall = (
			<Notice title={empty.title}>
				{empty.text === undefined ? null : <p>{empty.text}</p>}
				<Button
					variant="primary"
					className="mt-2"
					onClick={() => setAdding(true)}
				>
					{addLabel}
				</Button>
			</Notice>
		);
	} else if (shown.length === 0) {
		wall = (
			<div data-slot="no-match" className="flex flex-1 flex-col">
				<Notice title="Nothing here">
					<Button className="mt-2" onClick={pf.clear}>
						Clear all
					</Button>
				</Notice>
			</div>
		);
	} else {
		wall = <Wall slot={`${slot}-wall`}>{shown.map(card)}</Wall>;
	}
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				title={title}
				end={
					<>
						{filterable ? (
							<FilterButton
								count={pf.count}
								onClick={() => setFiltering(true)}
							/>
						) : null}
						<Button
							variant="primary"
							size="icon"
							aria-label={addLabel}
							title={addLabel}
							onClick={() => setAdding(true)}
						>
							<Plus size={18} strokeWidth={1.9} aria-hidden />
						</Button>
					</>
				}
			/>
			{filterable ? (
				<ActiveFilters
					chips={pf.chips}
					onClearAll={pf.clear}
					shown={countText(shown.length, unit)}
				/>
			) : null}
			{wall}
			{adding ? addSheet(() => setAdding(false)) : null}
			{filtering ? (
				<PieceFilterSheet
					filter={pf.filter}
					onChange={pf.set}
					shownText={countText(shown.length, unit)}
					onClose={() => setFiltering(false)}
				/>
			) : null}
		</div>
	);
}
