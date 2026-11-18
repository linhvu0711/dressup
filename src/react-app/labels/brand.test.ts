import { expect, test } from "bun:test";
import { brandDeleteText } from "./brand";

test("says how many items lose their brand", () => {
	// Given
	const counts = [0, 1, 3];
	// When
	const texts = counts.map((n) => brandDeleteText(n, 0));
	// Then
	expect(texts).toEqual([
		"No item uses it.",
		"1 item loses its brand.",
		"3 items lose their brand.",
	]);
});

test("says how many items and shop links lose their brand", () => {
	// Given
	const counts = [
		[0, 1],
		[0, 2],
		[1, 1],
		[3, 2],
	] as const;
	// When
	const texts = counts.map(([items, shopLinks]) =>
		brandDeleteText(items, shopLinks),
	);
	// Then
	expect(texts).toEqual([
		"1 shop link loses its brand.",
		"2 shop links lose their brand.",
		"1 item and 1 shop link lose their brand.",
		"3 items and 2 shop links lose their brand.",
	]);
});
