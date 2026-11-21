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
// digits of the highest price, shown with dots. Cut says the typing lost a
// mark or a digit; the dots are the ones it shows, not a slip.
export function typedPrice(text: string): {
	value: number | null;
	shown: string;
	cut: boolean;
} {
	const all = text.replace(/\D/g, "").replace(/^0+/, "");
	const cut = /[^\d.]/.test(text) || all.length > PRICE_DIGITS;
	const kept = all.slice(0, PRICE_DIGITS);
	if (kept === "") return { value: null, shown: "", cut };
	const value = Number(kept);
	return { value, shown: digits.format(value), cut };
}
