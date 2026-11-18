import type { ClosetPiece, OwnedItem } from "@/closet/owned-item";
import { type GarmentId, LAYER_OF, type Layer } from "@/dress/garments";
import type { BrandId } from "@/labels/brand";
import type { ColourId } from "@/labels/colour";
import type { Wish } from "@/wishlist/wish";

// One rule for the closet, the wishlist, and the AI list tools, so an AI app
// and the page never disagree on what a filter shows.

// null in brands is No brand.
export type PieceFilter = {
	layers: Layer[];
	types: GarmentId[];
	colours: ColourId[];
	brands: (BrandId | null)[];
};

export const NO_FILTER: PieceFilter = {
	layers: [],
	types: [],
	colours: [],
	brands: [],
};

export type FilterPiece = {
	typeId: GarmentId;
	colourId: ColourId;
	brandIds: (BrandId | null)[];
};

// Any pick inside a group fits; a piece must fit every group.
export function matchesPieceFilter(
	filter: PieceFilter,
	piece: FilterPiece,
): boolean {
	const typeFits =
		(filter.layers.length === 0 && filter.types.length === 0) ||
		filter.layers.includes(LAYER_OF[piece.typeId]) ||
		filter.types.includes(piece.typeId);
	const colourFits =
		filter.colours.length === 0 || filter.colours.includes(piece.colourId);
	const brandFits =
		filter.brands.length === 0 ||
		piece.brandIds.some((id) => filter.brands.includes(id));
	return typeFits && colourFits && brandFits;
}

export const filterSize = (f: PieceFilter) =>
	f.layers.length + f.types.length + f.colours.length + f.brands.length;

export const ownedItemPiece = (item: OwnedItem): FilterPiece => ({
	typeId: item.typeId,
	colourId: item.colour.id,
	brandIds: [item.brand?.id ?? null],
});

export const closetPiece = (piece: ClosetPiece): FilterPiece => ({
	typeId: piece.typeId,
	colourId: piece.colour.id,
	brandIds: piece.items.map((i) => i.brand?.id ?? null),
});

// A wish has no brand of its own, only its shop links do, so a wish with no
// link fits no brand pick, No brand too.
export const wishPiece = (wish: Wish): FilterPiece => ({
	typeId: wish.typeId,
	colourId: wish.colour.id,
	brandIds: wish.shopLinks.map((l) => l.brand?.id ?? null),
});
