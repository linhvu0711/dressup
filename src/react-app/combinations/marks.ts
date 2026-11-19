import type { TypeId } from "@/dress/clothing-types";
import type { ColourId } from "@/labels/colour";

// A mark matches a piece by its type and colour, never by brand, so two brands
// of a navy tee are one Own. A colour is the account's, so its id is the
// colour (ADR 0013).
export type PieceRef = { typeId: TypeId; colour: { id: ColourId } };

export const pieceKey = (p: PieceRef) => `${p.typeId}/${p.colour.id}`;

export const NO_PIECES: ReadonlySet<string> = new Set();

export const pieceKeys = (pieces: readonly PieceRef[]): ReadonlySet<string> =>
	new Set(pieces.map(pieceKey));

export type Holdings = {
	owned: ReadonlySet<string>;
	wanted: ReadonlySet<string>;
};

export const holdingsOf = (
	owned: readonly PieceRef[],
	wanted: readonly PieceRef[],
): Holdings => ({ owned: pieceKeys(owned), wanted: pieceKeys(wanted) });

export const markOf = (h: Holdings, p: PieceRef) => ({
	own: h.owned.has(pieceKey(p)),
	want: h.wanted.has(pieceKey(p)),
});
