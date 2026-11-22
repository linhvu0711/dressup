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
	const prices = typed.map((text) => typedPrice(text));
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

test("says a paste with a dot that is not a thousands dot was cut", () => {
	// Given: the field's text after each paste, and the text pasted
	const pastes = [
		["784000.00", "784000.00"],
		["784.50", "784.50"],
		["784.000", "784.000"],
		["1.234.40.000", "40.000"],
	] as const;
	// When
	const prices = pastes.map(([text, pasted]) => typedPrice(text, pasted));
	// Then
	expect(prices).toEqual([
		{ value: 78400000, shown: "78.400.000", cut: true },
		{ value: 78450, shown: "78.450", cut: true },
		{ value: 784000, shown: "784.000", cut: false },
		{ value: 123440000, shown: "123.440.000", cut: false },
	]);
});

test("says a typed dot was cut", () => {
	// Given: the field's text after the key, and the key
	const typed = [
		["784.", "."],
		["7845", "5"],
	] as const;
	// When
	const prices = typed.map(([text, key]) => typedPrice(text, key));
	// Then
	expect(prices).toEqual([
		{ value: 784, shown: "784", cut: true },
		{ value: 7845, shown: "7.845", cut: false },
	]);
});
