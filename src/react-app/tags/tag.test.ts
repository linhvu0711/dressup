import { expect, test } from "bun:test";
import { tagDeleteText, tagUseText } from "./tag";

test("says how many combinations carry a tag", () => {
	// Given: the counts 0, 1, and 3
	const counts = [0, 1, 3];
	// When
	const texts = counts.map(tagUseText);
	// Then
	expect(texts).toEqual(["Not in use", "1 combination", "3 combinations"]);
});

test("says what a delete takes the tag off", () => {
	// Given: the counts 0, 1, and 3
	const counts = [0, 1, 3];
	// When
	const texts = counts.map(tagDeleteText);
	// Then
	expect(texts).toEqual([
		"No combination uses it.",
		"It comes off 1 combination.",
		"It comes off 3 combinations.",
	]);
});
