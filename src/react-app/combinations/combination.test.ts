import { expect, test } from "bun:test";
import { combinationTitle, pieceName, wornLayers } from "./combination";

const piece = (
	typeId: "casual_p" | "tee_l" | "harrington" | "sweater" | "wool" | "shirt_l",
	name: string,
) => ({
	typeId,
	colour: { name },
});

test("names a combination top layer first", () => {
	// Given: Navy casual pants, a Black long tee, a Khaki Harrington jacket
	const pieces = [
		piece("casual_p", "Navy"),
		piece("tee_l", "Black"),
		piece("harrington", "Khaki"),
	];
	// When
	const title = combinationTitle({ pieces });
	// Then
	expect(title).toBe(
		"Khaki Harrington jacket + Black long tee + Navy casual pants",
	);
});

test("draws the pieces bottom layer first", () => {
	// Given: a Khaki Harrington, a Black long tee, Navy pants
	const pieces = [
		{ typeId: "harrington", hex: "#B8A57C" },
		{ typeId: "tee_l", hex: "#1B1B1F" },
		{ typeId: "casual_p", hex: "#1F3A5F" },
	] as const;
	// When
	const layers = wornLayers(pieces);
	// Then
	expect(layers).toEqual([
		{ typeId: "casual_p", color: "#1F3A5F" },
		{ typeId: "tee_l", color: "#1B1B1F" },
		{ typeId: "harrington", color: "#B8A57C" },
	]);
});

test("wears a pale blank bottom and top with no pieces", () => {
	// Given: no pieces
	// When
	const layers = wornLayers([]);
	// Then
	expect(layers).toEqual([
		{ typeId: "casual_p", color: "#E2DED7" },
		{ typeId: "tee_s", color: "#E2DED7" },
	]);
});

test("wears no blank top under a sweater", () => {
	// Given: a Burgundy sweater alone
	const pieces = [{ typeId: "sweater", hex: "#6E1F2F" }] as const;
	// When
	const layers = wornLayers(pieces);
	// Then
	expect(layers).toEqual([
		{ typeId: "casual_p", color: "#E2DED7" },
		{ typeId: "sweater", color: "#6E1F2F" },
	]);
});

test("names one piece by its colour and type", () => {
	// Given
	const piece = { typeId: "shirt_l", colour: { name: "Navy" } } as const;
	// When
	const name = pieceName(piece);
	// Then
	expect(name).toBe("Navy long button-up");
});
