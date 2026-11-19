import { expect, test } from "bun:test";
import {
	combinationKey,
	combinationTitle,
	pieceName,
	wornLayers,
} from "./combination";

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

test("draws the pieces bottom layer first", () => {
	// Given: an open-or-closed Khaki Harrington, a Black long tee, Navy pants
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
