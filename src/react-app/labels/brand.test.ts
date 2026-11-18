import { expect, test } from "bun:test";
import { brandDeleteText } from "./brand";

test("says how many items lose their brand", () => {
	// Given
	const counts = [0, 1, 3];
	// When
	const texts = counts.map(brandDeleteText);
	// Then
	expect(texts).toEqual([
		"No item uses it.",
		"1 item loses its brand.",
		"3 items lose their brand.",
	]);
});
