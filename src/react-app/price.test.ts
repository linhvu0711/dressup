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
	const typed = ["2990000", "2.990.000a", "0", "1234567890", "", "1.234"];
	// When
	const prices = typed.map((text) => typedPrice(text, ""));
	// Then
	expect(prices).toEqual([
		{ value: 2990000, shown: "2.990.000", cut: false },
		{ value: 2990000, shown: "2.990.000", cut: true },
		{ value: null, shown: "", cut: false },
		{ value: 123456789, shown: "123.456.789", cut: true },
		{ value: null, shown: "", cut: false },
		{ value: 1234, shown: "1.234", cut: false },
	]);
});

test("keeps the shown dots of a price as the user types into it", () => {
	// Given
	const edits = [
		["2.990.0000", "2.990.000"],
		["2.990.00", "2.990.000"],
		["12.990.000", "2.990.000"],
	] as const;
	// When
	const prices = edits.map(([text, before]) => typedPrice(text, before));
	// Then
	expect(prices).toEqual([
		{ value: 29900000, shown: "29.900.000", cut: false },
		{ value: 299000, shown: "299.000", cut: false },
		{ value: 12990000, shown: "12.990.000", cut: false },
	]);
});

test("says a pasted price with a decimal dot was cut", () => {
	// Given
	const pasted = ["784000.00", "784.000"];
	// When
	const prices = pasted.map((text) => typedPrice(text, ""));
	// Then
	expect(prices).toEqual([
		{ value: 78400000, shown: "78.400.000", cut: true },
		{ value: 784000, shown: "784.000", cut: false },
	]);
});
