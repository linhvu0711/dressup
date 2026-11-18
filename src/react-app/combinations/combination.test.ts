import { expect, test } from "bun:test";
import { combinationKey } from "./combination";

test("keys pieces with no jacket the same, open or not", () => {
	// Given: Navy casual pants and a Black long tee, as colour ids n and b
	const pieces = [
		{ typeId: "casual_p", colourId: "n" },
		{ typeId: "tee_l", colourId: "b" },
	] as const;
	// When
	const keys = [combinationKey(pieces, true), combinationKey(pieces, false)];
	// Then
	expect(keys).toEqual(["casual_p:n+tee_l:b", "casual_p:n+tee_l:b"]);
});
