import { expect, test } from "bun:test";
import { priceText, typedPrice } from "./price";

test("writes a price in VND with dots", () => {
	// Given
	const prices = [588000, 999999999];
	// When
	const texts = prices.map(priceText);
	// Then
	expect(texts).toEqual(["588.000 ₫", "999.999.999 ₫"]);
});

test("keeps the digits of a typed price and shows its dots", () => {
	// Given
	const typed = ["2990000", "2.990.000a", "0", "1234567890", ""];
	// When
	const prices = typed.map(typedPrice);
	// Then
	expect(prices).toEqual([
		{ value: 2990000, shown: "2.990.000" },
		{ value: 2990000, shown: "2.990.000" },
		{ value: null, shown: "" },
		{ value: 123456789, shown: "123.456.789" },
		{ value: null, shown: "" },
	]);
});
