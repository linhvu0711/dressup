import { describe, expect, test } from "bun:test";
import type { TypeId } from "@/dress/clothing-types";
import type { BrandId } from "@/labels/brand";
import type { ColourId } from "@/labels/colour";
import type { ShopLink, ShopLinkId, Wish, WishId } from "@/wishlist/wish";
import {
	type FilterPiece,
	matchesPieceFilter,
	NO_FILTER,
	type PieceFilter,
	pieceFilterChips,
	prunePieceFilter,
	readPieceFilter,
	wishPiece,
	writePieceFilter,
} from "./piece-filter";

const NAVY = "00000000-0000-4000-8000-0000000000a1" as ColourId;
const WHITE = "00000000-0000-4000-8000-0000000000a2" as ColourId;
const GONE_COLOUR = "00000000-0000-4000-8000-0000000000a9" as ColourId;
const COS = "00000000-0000-4000-8000-0000000000b1" as BrandId;
const UNIQLO = "00000000-0000-4000-8000-0000000000b2" as BrandId;
const GONE_BRAND = "00000000-0000-4000-8000-0000000000b9" as BrandId;

const colour = (id: ColourId) => ({
	id,
	name: "Navy",
	hex: "#1F3A5F" as const,
});

const link = (brand: BrandId | null): ShopLink => ({
	id: crypto.randomUUID() as ShopLinkId,
	url: "https://shop.example/a",
	brand: brand === null ? null : { id: brand, name: brand },
	name: "A piece",
	price: null,
	pictureIds: [],
});

const wish = (typeId: TypeId, shopLinks: ShopLink[]): Wish => ({
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
	typeId: TypeId,
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

	test("reads the picks of the address and writes them back", () => {
		// Given: a type that is not one, and a type given twice
		const params = new URLSearchParams(
			"layer=sweater&type=tee_l&type=cape&colour=c1&brand=none&brand=b1&type=tee_l",
		);
		// When
		const written = writePieceFilter(readPieceFilter(params)).toString();
		// Then
		expect(written).toBe(
			"layer=sweater&type=tee_l&colour=c1&brand=none&brand=b1",
		);
	});

	test("drops a colour and a brand the account no longer has", () => {
		// Given
		const filter = filterOf({
			colours: [NAVY, GONE_COLOUR],
			brands: [COS, GONE_BRAND, null],
		});
		// When
		const pruned = prunePieceFilter(filter, [{ id: NAVY }], [{ id: COS }]);
		// Then
		expect(pruned).toEqual({
			layers: [],
			types: [],
			colours: [NAVY],
			brands: [COS, null],
		});
	});

	test("names each chip in group order", () => {
		// Given
		const filter = filterOf({
			layers: ["sweater"],
			types: ["tee_l"],
			colours: [NAVY],
			brands: [null],
		});
		const colours = [{ id: NAVY, name: "Navy", hex: "#1F3A5F" as const }];
		// When
		const labels = pieceFilterChips(filter, colours, []).map((c) => c.label);
		// Then
		expect(labels).toEqual(["Sweaters", "Long tee", "Navy", "No brand"]);
	});
});
