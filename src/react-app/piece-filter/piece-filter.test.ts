import { describe, expect, test } from "bun:test";
import type { GarmentId } from "@/dress/garments";
import type { BrandId } from "@/labels/brand";
import type { ColourId } from "@/labels/colour";
import {
	type FilterPiece,
	matchesPieceFilter,
	NO_FILTER,
	type PieceFilter,
} from "./piece-filter";

const NAVY = "00000000-0000-4000-8000-0000000000a1" as ColourId;
const WHITE = "00000000-0000-4000-8000-0000000000a2" as ColourId;
const COS = "00000000-0000-4000-8000-0000000000b1" as BrandId;
const UNIQLO = "00000000-0000-4000-8000-0000000000b2" as BrandId;

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
});
