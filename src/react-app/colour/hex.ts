import { z } from "zod";

// Colour codes and the picker's hue, strength, and light.

export type Hex = `#${string}`;

export const hexSchema = z
	.string()
	.regex(/^#[0-9A-F]{6}$/)
	.transform((code) => code as Hex);

export function parseHex(text: string): Hex | null {
	let code = text.trim().replace(/^#/, "");
	if (/^[0-9a-f]{3}$/i.test(code)) {
		code = [...code].map((c) => c + c).join("");
	}
	return /^[0-9a-f]{6}$/i.test(code) ? `#${code.toUpperCase()}` : null;
}

// h is 0 to 360, s and v are 0 to 1.
export function hexToHsv(hex: Hex): [h: number, s: number, v: number] {
	const n = Number.parseInt(hex.slice(1), 16);
	const r = (n >> 16) / 255;
	const g = ((n >> 8) & 255) / 255;
	const b = (n & 255) / 255;
	const max = Math.max(r, g, b);
	const d = max - Math.min(r, g, b);
	let h = 0;
	if (d) {
		h =
			max === r
				? ((g - b) / d) % 6
				: max === g
					? (b - r) / d + 2
					: (r - g) / d + 4;
		h *= 60;
		if (h < 0) h += 360;
	}
	return [h, max ? d / max : 0, max];
}

export function hsvToHex(h: number, s: number, v: number): Hex {
	const channel = (n: number) => {
		const k = (n + h / 60) % 6;
		const x = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
		return Math.round(x * 255)
			.toString(16)
			.padStart(2, "0");
	};
	return `#${(channel(5) + channel(3) + channel(1)).toUpperCase()}`;
}

// The red hint shows at once for a letter no code has or a code too long;
// a short code shows it only after the person tried to add it.
export function readHexInput(
	text: string,
	tried: boolean,
): { hex: Hex | null; bad: boolean } {
	const hex = parseHex(text);
	const bad =
		/[^0-9a-f#\s]/i.test(text) ||
		text.replace(/[#\s]/g, "").length > 6 ||
		(tried && !hex);
	return { hex, bad };
}
