import { describe, expect, test } from "bun:test";
import { countText, limitText } from "@/count-text";

describe("count text", () => {
	test("writes one and many", () => {
		// Given: the noun "shop link", and "wish" with "wishes"
		// When
		const texts = [
			countText(1, "shop link"),
			countText(2, "shop link"),
			countText(3, "wish", "wishes"),
		];
		// Then
		expect(texts).toEqual(["1 shop link", "2 shop links", "3 wishes"]);
	});

	test("writes the limit sentence", () => {
		// Given: the limit 100 and "colours"
		// When
		const text = limitText(100, "colours");
		// Then
		expect(text).toBe(
			"You have 100 colours. That is the limit. Delete one to add a new one.",
		);
	});
});
