import { useLocation } from "react-router";
import { z } from "zod";

// The tabs that open a piece page; its Back goes to the one the user came
// from, with that tab's filter.
export const PIECE_TABS = ["/closet", "/wishlist"] as const;

export type PieceTab = (typeof PIECE_TABS)[number];

// A combination's page opens a piece page too; its address carries the wall's
// filter, so Back brings the wall back filtered.
type PieceFrom = PieceTab | `/combinations/${string}`;

type LinkPiece = { typeId: string; colour: { id: string } };

// The one way in to a piece page, so every link writes the address and the
// back state alike, and none forgets the filter in the tab's address.
export function usePieceLink(from: PieceFrom) {
	const { search } = useLocation();
	return (piece: LinkPiece) => ({
		to: `/piece/${piece.typeId}/${piece.colour.id}`,
		state: { from, search },
	});
}

// Router state is whatever history holds, so it is parsed before use, and
// only a tab or a combination's page gets through. A typed address has none
// and goes back to the closet.
const pieceState = z.object({
	from: z.union([
		z.enum(PIECE_TABS),
		z.string().regex(/^\/combinations\/[^/?#]+$/),
	]),
	search: z
		.string()
		.regex(/^(\?.*)?$/)
		.catch(""),
});

export function addressBeforePiece(state: unknown): string {
	const parsed = pieceState.safeParse(state);
	return parsed.success
		? `${parsed.data.from}${parsed.data.search}`
		: "/closet";
}
