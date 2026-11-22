import { z } from "zod";

export const PRICE_MAX = 999_999_999;

// A price in whole VND; null when the user leaves it empty.
export const priceSchema = z.number().int().min(1).max(PRICE_MAX).nullable();

// Dots as vi-VN writes them, with a plain space before ₫: the currency style
// puts a no-break space there.
const digits = new Intl.NumberFormat("vi-VN");

export const priceText = (price: number): string => `${digits.format(price)} ₫`;

const PRICE_DIGITS = String(PRICE_MAX).length;

// Digits, with dots only as vi-VN thousands: "784.000" is one, "784000.00"
// and "784.50" are not.
const THOUSANDS = /^\d{1,3}(\.\d{3})*$|^\d+$/;

// A price as the user types it: digits only, no leading zero, at most the
// digits of the highest price, shown with dots. Cut says the typing lost a
// mark or a digit; the dots are the ones it shows, not a slip. A key, a
// paste, or a drop is judged on the text it put in, since the field's dots
// move as it reformats: a dot put in that is not a thousands dot is cut, so
// "784000.00" does not pass as 78.400.000 unseen.
export function typedPrice(
	text: string,
	put?: string,
): {
	value: number | null;
	shown: string;
	cut: boolean;
} {
	const all = text.replace(/\D/g, "").replace(/^0+/, "");
	const cut =
		/[^\d.]/.test(text) ||
		all.length > PRICE_DIGITS ||
		(put !== undefined && !THOUSANDS.test(put.trim()));
	const kept = all.slice(0, PRICE_DIGITS);
	if (kept === "") return { value: null, shown: "", cut };
	const value = Number(kept);
	return { value, shown: digits.format(value), cut };
}
