import { describe, expect, setSystemTime, test } from "bun:test";
import { schema } from "../db";
import { makeHarness } from "./harness";

test("refuses a user id for a table with no user column", async () => {
	// Given: a fresh harness
	const h = await makeHarness();
	// When: a test asks for one account's rows of a table with no user column
	const read = h.rows(schema.pictureStorage as never, "alice-id");
	// Then
	await expect(read).rejects.toThrow(
		"rows: picture_storage has no user column",
	);
});

describe("the clock", () => {
	test("sets the clock to 2000", () => {
		// Given: the real clock
		// When
		setSystemTime(new Date("2000-01-01T00:00:00Z"));
		// Then
		expect(new Date().getUTCFullYear()).toBe(2000);
	});

	// Runs after the test above, which left the clock in 2000.
	test("puts the clock back after each test", () => {
		// Given: the test above set the clock to 2000
		// When
		const year = new Date().getUTCFullYear();
		// Then
		expect(year > 2000).toBe(true);
	});
});
