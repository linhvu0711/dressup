import { z } from "zod";

export const PRICE_MAX = 999_999_999;

// A price in whole VND; null when the user leaves it empty.
export const priceSchema = z.number().int().min(1).max(PRICE_MAX).nullable();

// Dots as vi-VN writes them, with a plain space before ₫: the currency style
// puts a no-break space there.
const digits = new Intl.NumberFormat("vi-VN");

export const priceText = (price: number): string => `${digits.format(price)} ₫`;

const PRICE_DIGITS = String(PRICE_MAX).length;

// A price as the user types it: digits only, no leading zero, at most the
// digits of the highest price, shown with dots. Before is what the field
// showed, so its dots are the field's own. Cut says the edit lost a mark or a
// digit, or put in a dot that is not a thousands dot, as the decimal dot of a
// pasted "784000.00" is.
export function typedPrice(
	text: string,
	before: string,
): {
	value: number | null;
	shown: string;
	cut: boolean;
} {
	const all = text.replace(/\D/g, "").replace(/^0+/, "");
	const kept = all.slice(0, PRICE_DIGITS);
	const shown = kept === "" ? "" : digits.format(Number(kept));
	const cut =
		/[^\d.]/.test(text) ||
		all.length > PRICE_DIGITS ||
		(edited(before, text).includes(".") && text !== shown);
	return { value: kept === "" ? null : Number(kept), shown, cut };
}

// What an edit put in: the new text past the start and the end it shares
// with the old text.
function edited(before: string, text: string): string {
	let start = 0;
	while (
		start < before.length &&
		start < text.length &&
		before[start] === text[start]
	)
		start++;
	let end = 0;
	while (
		end < before.length - start &&
		end < text.length - start &&
		before[before.length - 1 - end] === text[text.length - 1 - end]
	)
		end++;
	return text.slice(start, text.length - end);
}
