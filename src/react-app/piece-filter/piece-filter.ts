import type { ClosetPiece, OwnedItem } from "@/closet/owned-item";
import {
	GARMENT_IDS,
	GARMENT_NAMES,
	type GarmentId,
	LAYER_GROUP_NAMES,
	LAYER_OF,
	LAYERS,
	type Layer,
} from "@/dress/garments";
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

const unique = <T>(values: T[]) => [...new Set(values)];

const isLayer = (value: string): value is Layer =>
	(LAYERS as readonly string[]).includes(value);

const isType = (value: string): value is GarmentId =>
	(GARMENT_IDS as readonly string[]).includes(value);

// The address is typed by hand or kept from an old link, so a layer or a
// type that is not one is left out. Layers and types come out in the app's
// order, so the chips keep one order whatever order the picks came in.
export function readPieceFilter(params: URLSearchParams): PieceFilter {
	const layers = params.getAll("layer").filter(isLayer);
	const types = params.getAll("type").filter(isType);
	return {
		layers: LAYERS.filter((l) => layers.includes(l)),
		types: GARMENT_IDS.filter((t) => types.includes(t)),
		colours: unique(params.getAll("colour") as ColourId[]),
		brands: unique(
			params.getAll("brand").map((b) => (b === "none" ? null : (b as BrandId))),
		),
	};
}

export function writePieceFilter(f: PieceFilter): URLSearchParams {
	const params = new URLSearchParams();
	for (const layer of f.layers) params.append("layer", layer);
	for (const type of f.types) params.append("type", type);
	for (const colour of f.colours) params.append("colour", colour);
	for (const brand of f.brands) params.append("brand", brand ?? "none");
	return params;
}

// A colour or a brand deleted here or on another device leaves the filter. A
// list still loading drops nothing.
export const prunePieceFilter = (
	f: PieceFilter,
	colours: readonly { id: ColourId }[] | undefined,
	brands: readonly { id: BrandId }[] | undefined,
): PieceFilter => ({
	...f,
	colours: colours
		? f.colours.filter((id) => colours.some((c) => c.id === id))
		: f.colours,
	brands: brands
		? f.brands.filter((id) => id === null || brands.some((b) => b.id === id))
		: f.brands,
});

export type PieceFilterChip = {
	key: string;
	label: string;
	without: PieceFilter;
};

const without = <T>(list: T[], value: T) => list.filter((v) => v !== value);

// While a list loads, a chip says what it is, and the match still uses the id.
export const pieceFilterChips = (
	f: PieceFilter,
	colours: readonly { id: ColourId; name: string }[] | undefined,
	brands: readonly { id: BrandId; name: string }[] | undefined,
): PieceFilterChip[] => [
	...f.layers.map((layer) => ({
		key: `layer:${layer}`,
		label: LAYER_GROUP_NAMES[layer],
		without: { ...f, layers: without(f.layers, layer) },
	})),
	...f.types.map((type) => ({
		key: `type:${type}`,
		label: GARMENT_NAMES[type],
		without: { ...f, types: without(f.types, type) },
	})),
	...f.colours.map((id) => ({
		key: `colour:${id}`,
		label: colours?.find((c) => c.id === id)?.name ?? "Colour",
		without: { ...f, colours: without(f.colours, id) },
	})),
	...f.brands.map((id) => ({
		key: `brand:${id ?? "none"}`,
		label:
			id === null
				? "No brand"
				: (brands?.find((b) => b.id === id)?.name ?? "Brand"),
		without: { ...f, brands: without(f.brands, id) },
	})),
];
