import { describe, expect, setSystemTime, test } from "bun:test";
import { schema } from "../db";
import { makeHarness } from "./harness";

test("refuses a user id for a table with no user column", async () => {
	const h = await makeHarness();
	await expect(
		h.rows(schema.pictureStorage as never, "alice-id"),
	).rejects.toThrow("rows: picture_storage has no user column");
});

describe("the clock", () => {
	test("sets the clock to 2000", () => {
		setSystemTime(new Date("2000-01-01T00:00:00Z"));
		expect(new Date().getUTCFullYear()).toBe(2000);
	});

	test("puts the clock back after each test", () => {
		expect(new Date().getUTCFullYear() > 2000).toBe(true);
	});
});
