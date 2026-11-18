import { useSearchParams } from "react-router";
import { useColours } from "@/labels/api";
import { useBrands } from "@/labels/brand-api";
import {
	type FilterPiece,
	filterSize,
	matchesPieceFilter,
	NO_FILTER,
	type PieceFilter,
	pieceFilterChips,
	prunePieceFilter,
	readPieceFilter,
	writePieceFilter,
} from "./piece-filter";

// The filter of a tab lives in its address, so Back and a reload keep it.
export function usePieceFilter<E>(
	entries: readonly E[],
	toPiece: (entry: E) => FilterPiece,
) {
	const [params, setParams] = useSearchParams();
	const colours = useColours();
	const brands = useBrands();
	const filter = prunePieceFilter(
		readPieceFilter(params),
		colours.data,
		brands.data,
	);
	// Each pick replaces the history entry, so Back leaves the tab instead of
	// undoing one pick. A pick lands at once: in a transition, a quick second
	// pick would build on the filter before the first and drop it.
	const set = (next: PieceFilter) =>
		setParams(writePieceFilter(next), { replace: true, flushSync: true });
	const shown = entries.filter((e) => matchesPieceFilter(filter, toPiece(e)));
	return {
		filter,
		count: filterSize(filter),
		shown,
		shownText: shown.length === 1 ? "1 piece" : `${shown.length} pieces`,
		chips: pieceFilterChips(filter, colours.data, brands.data).map((chip) => ({
			key: chip.key,
			label: chip.label,
			onRemove: () => set(chip.without),
		})),
		set,
		clear: () => set(NO_FILTER),
	};
}
