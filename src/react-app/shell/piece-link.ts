import { z } from "zod";

// The tabs that open a piece page; its Back goes to the one the user came
// from.
export type PieceTab = "/closet" | "/wishlist";

// The one way in to a piece page, so every link writes the address and the
// back state alike.
export const pieceLink = (
	piece: { typeId: string; colour: { id: string } },
	from: PieceTab,
) => ({
	to: `/piece/${piece.typeId}/${piece.colour.id}`,
	state: { from },
});

// Router state is whatever history holds, so it is parsed before use. A
// typed address has none and goes back to the closet.
const pieceState = z.object({ from: z.enum(["/closet", "/wishlist"]) });

export function tabBeforePiece(state: unknown): PieceTab {
	const parsed = pieceState.safeParse(state);
	return parsed.success ? parsed.data.from : "/closet";
}
