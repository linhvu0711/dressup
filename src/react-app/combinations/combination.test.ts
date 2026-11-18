import { expect, test } from "bun:test";
import { combinationKey, combinationTitle } from "./combination";

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

const piece = (
	typeId: "casual_p" | "tee_l" | "harrington" | "sweater" | "wool" | "shirt_l",
	name: string,
) => ({
	typeId,
	colour: { name },
});

test("names a combination top layer first", () => {
	// Given: Navy casual pants, a Black long tee, an open Khaki Harrington
	const pieces = [
		piece("casual_p", "Navy"),
		piece("tee_l", "Black"),
		piece("harrington", "Khaki"),
	];
	// When
	const title = combinationTitle({ pieces, open: true });
	// Then
	expect(title).toBe(
		"Khaki Harrington jacket (open) + Black long tee + Navy casual pants",
	);
});

test("names a closed jacket with no mark", () => {
	// Given: a Burgundy sweater, a Brown wool jacket, a Navy long button-up
	const pieces = [
		piece("sweater", "Burgundy"),
		piece("wool", "Brown"),
		piece("shirt_l", "Navy"),
	];
	// When
	const title = combinationTitle({ pieces, open: false });
	// Then
	expect(title).toBe(
		"Brown wool jacket + Burgundy sweater + Navy long button-up",
	);
});
