import { expect, test } from "bun:test";
import { encodeUnder, fitLongSide, TooBig } from "./shrink";

// An encoder that records each quality and gives a blob of the size the
// table names for it.
const encoderOf = (sizes: Record<number, number>, fallback: number) => {
	const tried: number[] = [];
	const encode = async (quality: number) => {
		tried.push(quality);
		return new Blob([new Uint8Array(sizes[quality] ?? fallback)]);
	};
	return { tried, encode };
};

test("fits a 4000 by 3000 picture to 1600 by 1200", () => {
	// Given: 4000, 3000, 1600
	// When
	const size = fitLongSide(4000, 3000, 1600);
	// Then
	expect(size).toEqual({ width: 1600, height: 1200 });
});

test("fits a tall picture by its height", () => {
	// Given: 3024, 4032, 1600
	// When
	const size = fitLongSide(3024, 4032, 1600);
	// Then
	expect(size).toEqual({ width: 1200, height: 1600 });
});

test("keeps a small picture its size", () => {
	// Given: 800, 600, 1600
	// When
	const size = fitLongSide(800, 600, 1600);
	// Then
	expect(size).toEqual({ width: 800, height: 600 });
});

test("lowers the quality until the file fits", async () => {
	// Given
	const { tried, encode } = encoderOf(
		{ 0.9: 2_000_000, 0.8: 1_400_000, 0.7: 900_000 },
		900_000,
	);
	// When
	const blob = await encodeUnder(encode, 1_048_576);
	// Then
	expect({ tried, bytes: blob.size }).toEqual({
		tried: [0.9, 0.8, 0.7],
		bytes: 900_000,
	});
});

test("gives up when no quality fits", async () => {
	// Given
	const { tried, encode } = encoderOf({}, 2_000_000);
	// When
	const error = await encodeUnder(encode, 1_048_576).catch((e: unknown) => e);
	// Then
	expect({ tooBig: error instanceof TooBig, tried }).toEqual({
		tooBig: true,
		tried: [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3],
	});
});
