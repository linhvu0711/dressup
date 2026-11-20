import { expect, test } from "bun:test";
import { schema } from "../db";
import { makeHarness } from "./harness";

test("refuses a user id for a table with no user column", async () => {
	const h = await makeHarness();
	await expect(
		h.rows(schema.pictureStorage as never, "alice-id"),
	).rejects.toThrow("rows: picture_storage has no user column");
});
