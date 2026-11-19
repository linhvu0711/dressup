import { useLocation } from "react-router";
import { z } from "zod";

// The tabs that open a piece page; its Back goes to the one the user came
// from, with that tab's filter.
export type PieceTab = "/closet" | "/wishlist";

type LinkPiece = { typeId: string; colour: { id: string } };

// The one way in to a piece page, so every link writes the address and the
// back state alike, and none forgets the filter in the tab's address.
export function usePieceLink(from: PieceTab) {
	const { search } = useLocation();
	return (piece: LinkPiece) => ({
		to: `/piece/${piece.typeId}/${piece.colour.id}`,
		state: { from, search },
	});
}

// Router state is whatever history holds, so it is parsed before use. A
// typed address has none and goes back to the closet.
const pieceState = z.object({
	from: z.enum(["/closet", "/wishlist"]),
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
