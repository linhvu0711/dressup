import { describe, expect, test } from "bun:test";
import { modeById, outfitOf } from "@/dress/modes";
import { pickColour, pickMode, startDressState } from "@/dress/state";

describe("dress state", () => {
	test("starts with Polo + sweater and each starter set", () => {
		// Given: nothing
		// When
		const s = startDressState();
		// Then
		expect({
			modeId: s.modeId,
			sweater: s.swatches.sweater,
			padded: s.swatches.padded,
			shirt_l: s.swatches.shirt_l,
			pickedSweater: s.picked.sweater,
			pickedShirt: s.picked.shirt_l,
			open: s.open,
		}).toEqual({
			modeId: "polo-sweater",
			sweater: ["#1F3A5F", "#8C8A84", "#E6DFD0", "#7A2E2E"],
			padded: ["#1B1B1F", "#1F3A5F", "#55633F"],
			shirt_l: ["#BFD3EA", "#F3F1EC", "#1F3A5F"],
			pickedSweater: "#1F3A5F",
			pickedShirt: "#BFD3EA",
			open: [],
		});
	});

	test("keeps a garment's colour in another mode", () => {
		// Given: the sweater picked in dark red
		const picked = pickColour(startDressState(), "sweater", "#7A2E2E");
		// When
		const s = pickMode(picked, "tee-sweater");
		const outfit = outfitOf(modeById(s.modeId), s.picked);
		// Then
		expect(outfit).toEqual([
			{ garment: "casual_p", color: "#8C8A84" },
			{ garment: "tee_l", color: "#F3F1EC" },
			{ garment: "sweater", color: "#7A2E2E" },
		]);
	});
});
