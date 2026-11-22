import { describe, expect, test } from "bun:test";
import type { ColourId } from "@/labels/colour";
import { type Back, pieceLink, readBack } from "./piece-link";

const NAVY = "n1" as ColourId;

describe("back", () => {
	test("reads back the Back a link writes", () => {
		// Given
		const combination: Back = { to: "/combinations/c1?tag=t1" };
		const link = pieceLink(
			{ typeId: "shirt_l", colour: { id: NAVY } },
			combination,
		);
		// When
		const back = readBack(link.state, "/closet");
		// Then
		expect(back).toEqual({ to: "/combinations/c1?tag=t1" });
	});

	test("reads a piece page's Back with the Back inside it", () => {
		// Given: the Back a piece page's card writes
		const piece: Back = {
			to: "/piece/shirt_l/n1",
			state: { to: "/combinations/c1" },
		};
		// When
		const back = readBack(piece, "/closet");
		// Then
		expect(back).toEqual({
			to: "/piece/shirt_l/n1",
			state: { to: "/combinations/c1" },
		});
	});

	test("goes to the fallback for an address of another site", () => {
		// Given: the passing case above with `to` changed
		const state = { to: "https://example.com/closet" };
		// When
		const back = readBack(state, "/wishlist");
		// Then
		expect(back).toEqual({ to: "/wishlist" });
	});

	test("goes to the fallback for a piece address one part short", () => {
		// Given
		const state = { to: "/piece/shirt_l" };
		// When
		const back = readBack(state, "/closet");
		// Then
		expect(back).toEqual({ to: "/closet" });
	});

	test("reads back a combination address with a slash at its end", () => {
		// Given: a bookmarked combination address, which the router opens too
		const state = { to: "/combinations/c1/" };
		// When
		const back = readBack(state, "/closet");
		// Then
		expect(back).toEqual({ to: "/combinations/c1/" });
	});
});
