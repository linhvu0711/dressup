import { useId } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { PartError } from "@/components/ui/part-error";
import { useCombinations } from "./api";
import { CombinationCard } from "./CombinationCard";
import { type CombinationFilter, filterCombinations } from "./filter";
import { NO_PIECES, type PieceRef } from "./marks";
import { wallAddress } from "./wall-address";

// The piece page's part for the combinations that hold the piece, newest
// first, with See all to the wall filtered by the piece. A piece in no
// combination has no part.
// One row of cards. The Item page has room for five on a wide screen; the
// piece page's column is 540 px (PiecePage.tsx), so it keeps four in the
// page, as e2e/piece-combinations.e2e.ts reads.
export function PieceCombinations({
	piece,
	shown = 4,
}: {
	piece: PieceRef;
	shown?: 4 | 5;
}) {
	const title = useId();
	const combinations = useCombinations();
	// A failed first load has no data: retry is off for every list.
	if (combinations.isError && !combinations.data)
		return (
			<PartError
				title="Combinations with this piece"
				onRetry={() => void combinations.refetch()}
			>
				Could not load your combinations.
			</PartError>
		);
	if (combinations.isPending) return null;
	const filter: CombinationFilter = {
		pieces: [{ typeId: piece.typeId, colourId: piece.colour.id }],
		tags: [],
		own: "any",
	};
	// Any never reads what the account owns, so the part needs no closet.
	const held = filterCombinations(combinations.data, filter, NO_PIECES);
	if (held.length === 0) return null;
	return (
		<section aria-labelledby={title} className="flex flex-col gap-2">
			<div className="flex items-center gap-3">
				<h2 id={title} className="min-w-0 flex-1 text-[22px]">
					Combinations with this piece
				</h2>
				<Button asChild>
					<Link to={wallAddress(filter)}>See all {held.length}</Link>
				</Button>
			</div>
			{shown === 4 ? (
				<div className="grid grid-cols-4 gap-2.5">
					{held.slice(0, 4).map((c) => (
						<CombinationCard key={c.id} combination={c} />
					))}
				</div>
			) : (
				<div className="grid grid-cols-4 gap-2.5 wide:grid-cols-5">
					{held.slice(0, 5).map((c, i) => (
						<div key={c.id} className={i === 4 ? "max-wide:hidden" : undefined}>
							<CombinationCard combination={c} />
						</div>
					))}
				</div>
			)}
		</section>
	);
}
