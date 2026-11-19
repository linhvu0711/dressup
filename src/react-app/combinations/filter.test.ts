import { describe, expect, test } from "bun:test";
import type { TypeId } from "@/dress/clothing-types";
import type { ColourId } from "@/labels/colour";
import type { TagId } from "@/tags/tag";
import {
	BLANK_ROW,
	type CombinationFilter,
	filterChips,
	filterCombinations,
	pruneCombinationFilter,
	readCombinationFilter,
	writeCombinationFilter,
} from "./filter";

const WHITE = "00000000-0000-4000-8000-0000000000a1" as ColourId;
const NAVY = "00000000-0000-4000-8000-0000000000a2" as ColourId;
const BLACK = "00000000-0000-4000-8000-0000000000a3" as ColourId;
const GREY = "00000000-0000-4000-8000-0000000000a4" as ColourId;
const GONE = "00000000-0000-4000-8000-0000000000a5" as ColourId;
const T1 = "00000000-0000-4000-8000-000000000001" as TagId;
const T2 = "00000000-0000-4000-8000-000000000002" as TagId;

const combination = (
	id: string,
	pieces: [TypeId, ColourId][],
	tags: TagId[] = [],
) => ({
	id,
	pieces: pieces.map(([typeId, colourId]) => ({
		typeId,
		colour: { id: colourId },
	})),
	tags,
});

const ids = (list: { id: string }[]) => list.map((c) => c.id);

// A = White short tee + Navy chino pants, B = White short tee + Black chino
// pants, C = Grey short tee + Navy sweater.
const A = combination("A", [
	["tee_s", WHITE],
	["chino_p", NAVY],
]);
const B = combination("B", [
	["tee_s", WHITE],
	["chino_p", BLACK],
]);
const C = combination("C", [
	["tee_s", GREY],
	["sweater", NAVY],
]);

const only = (pieces: CombinationFilter["pieces"]): CombinationFilter => ({
	pieces,
	tags: [],
	own: "any",
});

// Any never reads what the account owns.
const NONE: ReadonlySet<string> = new Set();

describe("combination filter", () => {
	test("shows only the combinations with a white short tee and some navy piece", () => {
		// Given: A, B, C, in that order, no tags
		// When
		const shown = filterCombinations(
			[A, B, C],
			only([
				{ typeId: "tee_s", colourId: WHITE },
				{ typeId: null, colourId: NAVY },
			]),
			NONE,
		);
		// Then
		expect(ids(shown)).toEqual(["A"]);
	});

	test("matches a row on one piece, not on two", () => {
		// Given: D = Black short tee + White long tee
		const D = combination("D", [
			["tee_s", BLACK],
			["tee_l", WHITE],
		]);
		// When
		const shown = filterCombinations(
			[D],
			only([{ typeId: "tee_s", colourId: WHITE }]),
			NONE,
		);
		// Then
		expect(ids(shown)).toEqual([]);
	});

	test("filters nothing with a row with no type and no colour", () => {
		// Given: A, B, C
		// When
		const shown = filterCombinations([A, B, C], only([BLANK_ROW]), NONE);
		// Then
		expect(ids(shown)).toEqual(["A", "B", "C"]);
	});

	test("keeps the combinations with every picked tag", () => {
		// Given: A with T1 and T2, B with T1, C with T2
		const list = [
			{ ...A, tags: [T1, T2] },
			{ ...B, tags: [T1] },
			{ ...C, tags: [T2] },
		];
		// When
		const shown = filterCombinations(
			list,
			{ pieces: [], tags: [T1, T2], own: "any" },
			NONE,
		);
		// Then
		expect(ids(shown)).toEqual(["A"]);
	});

	test("keeps the newest first", () => {
		// Given: C, B, A, newest first as the server sends them; A and B have a
		// white piece, C has none
		// When
		const shown = filterCombinations(
			[C, B, A],
			only([{ typeId: null, colourId: WHITE }]),
			NONE,
		);
		// Then
		expect(ids(shown)).toEqual(["B", "A"]);
	});

	test("reads the rows and tags of the address and writes them back", () => {
		// Given
		const search = `piece=tee_s.${WHITE}&piece=.${NAVY}&piece=jeans.&piece=.&tag=${T1}&tag=${T1}`;
		// When
		const written = writeCombinationFilter(
			readCombinationFilter(new URLSearchParams(search)),
		).toString();
		// Then
		expect(written).toBe(`piece=tee_s.${WHITE}&piece=.${NAVY}&tag=${T1}`);
	});

	test("drops a deleted tag and a deleted colour", () => {
		// Given
		const filter: CombinationFilter = {
			pieces: [
				{ typeId: "sweater", colourId: GONE },
				{ typeId: null, colourId: GONE },
			],
			tags: [T1, T2],
			own: "any",
		};
		// When
		const pruned = pruneCombinationFilter(
			filter,
			[{ id: T2 }],
			[{ id: WHITE }],
		);
		// Then
		expect(pruned).toEqual({
			pieces: [{ typeId: "sweater", colourId: null }],
			tags: [T2],
			own: "any",
		});
	});

	test("names a row's chip by its type, its colour, or both", () => {
		// Given
		const filter: CombinationFilter = {
			pieces: [
				{ typeId: "tee_s", colourId: WHITE },
				{ typeId: "sweater", colourId: null },
				{ typeId: null, colourId: NAVY },
			],
			tags: [T1],
			own: "any",
		};
		const colours = [
			{ id: WHITE, name: "White", hex: "#F4F2ED" as const },
			{ id: NAVY, name: "Navy", hex: "#1F3A5F" as const },
		];
		// When
		const labels = filterChips(filter, [{ id: T1, name: "work" }], colours).map(
			(c) => c.label,
		);
		// Then
		expect(labels).toEqual(["White short tee", "Sweater", "Navy", "work"]);
	});

	// A owns every piece; B lacks its Black chino pants; C lacks its Navy
	// sweater.
	const owned: ReadonlySet<string> = new Set([
		`tee_s/${WHITE}`,
		`chino_p/${NAVY}`,
		`tee_s/${GREY}`,
	]);

	test("shows every combination with Any", () => {
		// Given: A, B, C; the account owns the White short tee only
		// When
		const shown = filterCombinations(
			[A, B, C],
			{ ...only([]), own: "any" },
			new Set([`tee_s/${WHITE}`]),
		);
		// Then
		expect(ids(shown)).toEqual(["A", "B", "C"]);
	});

	test("shows only the combinations with every piece owned with All of them", () => {
		// Given: A, B, C, and the owned pieces above
		// When
		const shown = filterCombinations(
			[A, B, C],
			{ ...only([]), own: "all" },
			owned,
		);
		// Then
		expect(ids(shown)).toEqual(["A"]);
	});

	test("shows the combinations with a piece not owned with Not all", () => {
		// Given: A, B, C, and the owned pieces above
		// When
		const shown = filterCombinations(
			[A, B, C],
			{ ...only([]), own: "not_all" },
			owned,
		);
		// Then
		expect(ids(shown)).toEqual(["B", "C"]);
	});

	test("keeps Pieces I own in the address", () => {
		// Given
		const filter: CombinationFilter = {
			pieces: [{ typeId: "tee_s", colourId: WHITE }],
			tags: [T1],
			own: "not_all",
		};
		// When
		const written = writeCombinationFilter(filter).toString();
		// Then
		expect({
			written,
			read: readCombinationFilter(new URLSearchParams(written)),
		}).toEqual({
			written:
				"piece=tee_s.00000000-0000-4000-8000-0000000000a1&tag=00000000-0000-4000-8000-000000000001&own=not_all",
			read: filter,
		});
	});
});
