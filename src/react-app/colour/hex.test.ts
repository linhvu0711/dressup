import { describe, expect, test } from "bun:test";
import { hexToHsv, hsvToHex, parseHex, readHexInput } from "@/colour/hex";

describe("hex rules", () => {
	test("reads a code with #", () => {
		// Given: the text "#1f3a5f"
		// When
		const hex = parseHex("#1f3a5f");
		// Then
		expect(hex).toBe("#1F3A5F");
	});

	test("reads a code without #", () => {
		// Given: the text " 1F3A5F "
		// When
		const hex = parseHex(" 1F3A5F ");
		// Then
		expect(hex).toBe("#1F3A5F");
	});

	test("grows a 3-character code to 6", () => {
		// Given: the text "abc"
		// When
		const hex = parseHex("abc");
		// Then
		expect(hex).toBe("#AABBCC");
	});

	test("flags a code that is not a colour", () => {
		// Given: the passing "1F3A5F", and four texts each with one change
		// When
		const read = [
			readHexInput("zz1234", false),
			readHexInput("1F3A5F0", false),
			readHexInput("1F3A", false),
			readHexInput("1F3A", true),
			readHexInput("1F3A5F", false),
		];
		// Then
		expect(read).toEqual([
			{ hex: null, bad: true },
			{ hex: null, bad: true },
			{ hex: null, bad: false },
			{ hex: null, bad: true },
			{ hex: "#1F3A5F", bad: false },
		]);
	});

	test("turns a colour into hue, strength, and light, and back", () => {
		// Given: "#1F3A5F"
		// When
		const [h, s, v] = hexToHsv("#1F3A5F");
		const back = hsvToHex(h, s, v);
		const bright = hsvToHex(214.6875, 1, 1);
		// Then
		expect(h).toBeCloseTo(214.6875, 6);
		expect(s).toBeCloseTo(0.6736842, 6);
		expect(v).toBeCloseTo(0.372549, 6);
		expect([back, bright]).toEqual(["#1F3A5F", "#006CFF"]);
	});
});
