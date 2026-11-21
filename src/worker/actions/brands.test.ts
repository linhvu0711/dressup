import { describe, expect, test } from "bun:test";
import { ALICE, BOB, withAccount } from "../test/harness";
import { brandActions } from "./brands";

async function withAlice() {
	const { h } = await withAccount();
	return { h, alice: { db: h.db, userId: ALICE.id } };
}

async function withZara() {
	const { h, alice } = await withAlice();
	const added = await brandActions.add.run(alice, { name: "Zara" });
	if (!added.ok) throw new Error("Zara was not added");
	return { h, alice, zara: added.value.id };
}

describe("adding a brand", () => {
	test("adds a brand", async () => {
		// Given: alice's account
		const { alice } = await withAlice();
		// When
		const added = await brandActions.add.run(alice, { name: "  Uniqlo  " });
		// Then
		expect(added).toMatchObject({ ok: true, value: { name: "Uniqlo" } });
	});

	test("refuses a name the account has in another case", async () => {
		// Given: Zara added
		const { alice } = await withZara();
		// When
		const added = await brandActions.add.run(alice, { name: "zara" });
		// Then
		expect(added).toEqual({
			ok: false,
			error: {
				code: "duplicate",
				status: 409,
				body: { error: "duplicate", field: "name" },
				text: "You already have a brand called zara.",
			},
		});
	});

	test("refuses an empty name", async () => {
		// Given: alice's account
		const { alice } = await withAlice();
		// When
		const added = await brandActions.add.run(alice, { name: "   " });
		// Then
		expect(added).toEqual({
			ok: false,
			error: {
				code: "invalid",
				status: 400,
				body: { error: "invalid", field: "name" },
				text: "A brand name has 1 to 24 characters.",
			},
		});
	});

	test("refuses brand number 101", async () => {
		// Given: "Brand 1" to "Brand 100" added
		const { alice } = await withAlice();
		for (let i = 1; i <= 100; i++)
			await brandActions.add.run(alice, { name: `Brand ${i}` });
		// When
		const added = await brandActions.add.run(alice, { name: "Uniqlo" });
		// Then
		expect(added).toEqual({
			ok: false,
			error: {
				code: "brand_limit",
				status: 409,
				body: { error: "brand_limit" },
				text: "You have 100 brands. That is the limit. Delete one to add a new one.",
			},
		});
	});
});

describe("renaming and deleting a brand", () => {
	test("renames a brand", async () => {
		// Given: Zara added
		const { alice, zara } = await withZara();
		// When
		const renamed = await brandActions.rename.run(alice, {
			id: zara,
			name: "Zara Home",
		});
		// Then
		expect(renamed).toEqual({
			ok: true,
			value: { id: zara, name: "Zara Home" },
		});
	});

	test("answers not found for another account's brand", async () => {
		// Given: Zara added by alice; bob has an account
		const { h, zara } = await withZara();
		await h.addAccount(BOB);
		const bob = { db: h.db, userId: BOB.id };
		// When
		const renamed = await brandActions.rename.run(bob, {
			id: zara,
			name: "Mine",
		});
		// Then
		expect(renamed).toEqual({
			ok: false,
			error: {
				code: "not_found",
				status: 404,
				body: { error: "not_found" },
				text: "No brand with this id.",
			},
		});
	});

	test("deletes a brand", async () => {
		// Given: Zara added
		const { alice, zara } = await withZara();
		// When
		const deleted = await brandActions.delete.run(alice, { id: zara });
		// Then
		expect(deleted).toEqual({ ok: true, value: { id: zara, name: "Zara" } });
	});
});
