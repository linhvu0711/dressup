import { describe, expect, test } from "bun:test";
import { ALICE, BOB, withAccount } from "../test/harness";
import { tagActions } from "./tags";

async function withAlice() {
	const { h } = await withAccount();
	return { h, alice: { db: h.db, userId: ALICE.id } };
}

async function withWork() {
	const { h, alice } = await withAlice();
	const added = await tagActions.add.run(alice, { name: "Work" });
	if (!added.ok) throw new Error("Work was not added");
	return { h, alice, work: added.value.id };
}

describe("adding a tag", () => {
	test("adds a tag", async () => {
		// Given: alice's account
		const { alice } = await withAlice();
		// When
		const added = await tagActions.add.run(alice, { name: "Work" });
		// Then
		expect(added).toMatchObject({ ok: true, value: { name: "Work" } });
	});

	test("refuses a name the account has in another letter case", async () => {
		// Given: Work added
		const { alice } = await withWork();
		// When
		const added = await tagActions.add.run(alice, { name: "wORK" });
		// Then
		expect(added).toEqual({
			ok: false,
			error: {
				code: "duplicate",
				status: 400,
				body: { error: "duplicate", field: "name" },
				text: "You already have a tag called wORK.",
			},
		});
	});

	test("refuses a name of 25 characters", async () => {
		// Given: alice's account
		const { alice } = await withAlice();
		// When
		const added = await tagActions.add.run(alice, { name: "a".repeat(25) });
		// Then
		expect(added).toEqual({
			ok: false,
			error: {
				code: "name_length",
				status: 400,
				body: { error: "invalid", field: "name" },
				text: "A tag name has 1 to 24 characters.",
			},
		});
	});
});

describe("renaming and deleting a tag", () => {
	test("renames a tag", async () => {
		// Given: Work added
		const { alice, work } = await withWork();
		// When
		const renamed = await tagActions.rename.run(alice, {
			id: work,
			name: "Office",
		});
		// Then
		expect(renamed).toEqual({ ok: true, value: { id: work, name: "Office" } });
	});

	test("answers 404 for a rename of another account's tag", async () => {
		// Given: Work added by alice; bob has an account
		const { h, work } = await withWork();
		await h.addAccount(BOB);
		const bob = { db: h.db, userId: BOB.id };
		// When
		const renamed = await tagActions.rename.run(bob, {
			id: work,
			name: "Mine",
		});
		// Then
		expect(renamed).toEqual({
			ok: false,
			error: {
				code: "not_found",
				status: 404,
				body: { error: "not_found" },
				text: "No tag with this id.",
			},
		});
	});

	test("deletes a tag", async () => {
		// Given: Work added
		const { alice, work } = await withWork();
		// When
		const deleted = await tagActions.delete.run(alice, { id: work });
		// Then
		expect(deleted).toEqual({ ok: true, value: { id: work, name: "Work" } });
	});
});
