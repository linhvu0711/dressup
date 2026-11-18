import { describe, expect, test } from "bun:test";
import {
	closetPieces,
	type OwnedItem,
	type OwnedItemId,
} from "@/closet/owned-item";
import type { GarmentId } from "@/dress/garments";
import type { BrandId } from "@/labels/brand";
import type { ColourId } from "@/labels/colour";
import type { ShopLink, ShopLinkId, Wish, WishId } from "@/wishlist/wish";
import {
	closetPiece,
	type FilterPiece,
	matchesPieceFilter,
	NO_FILTER,
	type PieceFilter,
	wishPiece,
} from "./piece-filter";

const NAVY = "00000000-0000-4000-8000-0000000000a1" as ColourId;
const WHITE = "00000000-0000-4000-8000-0000000000a2" as ColourId;
const COS = "00000000-0000-4000-8000-0000000000b1" as BrandId;
const UNIQLO = "00000000-0000-4000-8000-0000000000b2" as BrandId;

const colour = (id: ColourId) => ({
	id,
	name: "Navy",
	hex: "#1F3A5F" as const,
});

const item = (
	id: string,
	typeId: GarmentId,
	colourId: ColourId,
	brand: BrandId | null,
) =>
	({
		id: id as OwnedItemId,
		typeId,
		colour: colour(colourId),
		brand: brand === null ? null : { id: brand, name: brand },
		quantity: 1,
	}) as OwnedItem;

const link = (brand: BrandId | null): ShopLink => ({
	id: crypto.randomUUID() as ShopLinkId,
	url: "https://shop.example/a",
	brand: brand === null ? null : { id: brand, name: brand },
	name: "A piece",
	price: null,
});

const wish = (typeId: GarmentId, shopLinks: ShopLink[]): Wish => ({
	id: crypto.randomUUID() as WishId,
	typeId,
	colour: colour(NAVY),
	shopLinks,
});

const filterOf = (picks: Partial<PieceFilter>): PieceFilter => ({
	...NO_FILTER,
	...picks,
});

const piece = (
	typeId: GarmentId,
	colourId: ColourId,
	brandIds: (BrandId | null)[] = [],
): FilterPiece => ({ typeId, colourId, brandIds });

describe("piece filter", () => {
	test("matches a piece of a picked layer or a picked type", () => {
		// Given
		const filter = filterOf({ layers: ["sweater"], types: ["tee_l"] });
		const A = piece("sweater", NAVY);
		const B = piece("tee_l", WHITE);
		const C = piece("chino_p", NAVY);
		// When
		const shown = [A, B, C].filter((p) => matchesPieceFilter(filter, p));
		// Then
		expect(shown).toEqual([A, B]);
	});

	test("a piece must fit every group", () => {
		// Given
		const filter = filterOf({ types: ["sweater", "tee_l"], colours: [NAVY] });
		const A = piece("sweater", NAVY);
		const B = piece("tee_l", NAVY);
		const C = piece("tee_l", WHITE);
		const D = piece("chino_p", NAVY);
		// When
		const shown = [A, B, C, D].filter((p) => matchesPieceFilter(filter, p));
		// Then
		expect(shown).toEqual([A, B]);
	});

	test("fits a picked brand or No brand", () => {
		// Given
		const filter = filterOf({ brands: [COS, null] });
		const A = piece("sweater", NAVY, [COS]);
		const B = piece("sweater", NAVY, [null]);
		const C = piece("sweater", NAVY, [UNIQLO]);
		const D = piece("sweater", NAVY, []);
		// When
		const shown = [A, B, C, D].filter((p) => matchesPieceFilter(filter, p));
		// Then
		expect(shown).toEqual([A, B]);
	});

	test("matches every piece with no pick", () => {
		// Given
		const A = piece("sweater", NAVY, [COS]);
		const B = piece("sweater", NAVY, [null]);
		const C = piece("sweater", NAVY, [UNIQLO]);
		const D = piece("sweater", NAVY, []);
		// When
		const shown = [A, B, C, D].filter((p) => matchesPieceFilter(NO_FILTER, p));
		// Then
		expect(shown).toEqual([A, B, C, D]);
	});

	test("a closet piece fits a brand of any of its items", () => {
		// Given: sweater Navy from COS and from Uniqlo; tee_l White, no brand
		const items = [
			item("x", "sweater", NAVY, COS),
			item("y", "sweater", NAVY, UNIQLO),
			item("z", "tee_l", WHITE, null),
		];
		const filter = filterOf({ brands: [UNIQLO] });
		// When
		const shown = closetPieces(items)
			.filter((p) => matchesPieceFilter(filter, closetPiece(p)))
			.map((p) => p.typeId);
		// Then
		expect(shown).toEqual(["sweater"]);
	});

	test("a wish fits a brand of any shop link, and a wish with no link is not No brand", () => {
		// Given: sweater with a COS link and a link with no brand; tee_l with a
		// Uniqlo link; chino_p with no link
		const wishes = [
			wish("sweater", [link(COS), link(null)]),
			wish("tee_l", [link(UNIQLO)]),
			wish("chino_p", []),
		];
		const filter = filterOf({ brands: [null] });
		// When
		const shown = wishes
			.filter((w) => matchesPieceFilter(filter, wishPiece(w)))
			.map((w) => w.typeId);
		// Then
		expect(shown).toEqual(["sweater"]);
	});
});
