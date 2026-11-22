import { useLocation } from "react-router";
import { z } from "zod";

// Where a page's Back goes. A link writes it as its router state, so the next
// page's Back returns to the page the link was on. A piece page's own Back
// rides inside its cards' state, so its Back still finds its combination after
// an Item page.
export type Back = { to: string; state?: unknown };

type LinkPiece = { typeId: string; colour: { id: string } };

// The current page as a Back, for every link on it to write.
export function useHere(): Back {
	const { pathname, search, state } = useLocation();
	return { to: `${pathname}${search}`, state };
}

// The one way in to a piece page.
export const pieceLink = (piece: LinkPiece, back: Back) => ({
	to: `/piece/${piece.typeId}/${piece.colour.id}`,
	state: back,
});

// Router state is whatever history holds, so it is read through one rule, and
// only an address of this app gets through. A typed address has none and goes
// to the fallback.
const backRule = z.object({
	to: z
		.string()
		.regex(
			/^\/(closet|wishlist|combinations\/[^/?#]+|piece\/[^/?#]+\/[^/?#]+)(\?.*)?$/,
		),
	state: z.unknown().optional(),
});

export function readBack(state: unknown, fallback: string): Back {
	const parsed = backRule.safeParse(state);
	if (!parsed.success) return { to: fallback };
	return parsed.data.state === undefined
		? { to: parsed.data.to }
		: { to: parsed.data.to, state: parsed.data.state };
}
