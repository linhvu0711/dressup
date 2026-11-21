import { describe, expect, test } from "bun:test";
import { listColours } from "../colour-store";
import { listTags } from "../tag-store";
import { three } from "../test/combination-pieces";
import {
	ALICE,
	BOB,
	otherTabWrites,
	scopeOf,
	withAccount,
} from "../test/harness";
import type { Refusal } from "./action";
import { combinationActions } from "./combinations";
import { tagActions } from "./tags";

async function withAlice() {
	const { h } = await withAccount();
	return { h, alice: scopeOf(h) };
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

	test("adds tag number 101", async () => {
		// Given: alice with 100 tags
		const { alice } = await withAlice();
		for (let i = 1; i <= 100; i++)
			await tagActions.add.run(alice, { name: `Tag ${i}` });
		// When
		const added = await tagActions.add.run(alice, { name: "Tag 101" });
		// Then
		expect({
			ok: added.ok,
			count: (await listTags(alice.db, ALICE.id)).length,
		}).toEqual({ ok: true, count: 101 });
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
		const bob = scopeOf(h, BOB);
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

const DUPLICATE_ROW = (name: string) =>
	({
		code: "duplicate",
		status: 400,
		body: { error: "duplicate", field: "name" },
		text: `You already have a tag called ${name}.`,
	}) satisfies Refusal;

const NAME_LENGTH_ROW = {
	code: "name_length",
	status: 400,
	body: { error: "invalid", field: "name" },
	text: "A tag name has 1 to 24 characters.",
} satisfies Refusal;

describe("adding a tag", () => {
	test("adds a tag once when the same add comes twice", async () => {
		// Given: alice's account
		const { alice } = await withAlice();
		// When
		await tagActions.add.run(alice, { name: "Work" });
		const second = await tagActions.add.run(alice, { name: "Work" });
		// Then
		expect({
			second,
			count: (await listTags(alice.db, ALICE.id)).length,
		}).toEqual({
			second: { ok: false, error: DUPLICATE_ROW("Work") },
			count: 1,
		});
	});

	test("refuses an empty name", async () => {
		// Given: alice's account
		const { alice } = await withAlice();
		// When
		const added = await tagActions.add.run(alice, { name: "   " });
		// Then
		expect(added).toEqual({ ok: false, error: NAME_LENGTH_ROW });
	});

	test("takes a name of 24 characters", async () => {
		// Given: alice's account
		const { alice } = await withAlice();
		// When
		const added = await tagActions.add.run(alice, { name: "a".repeat(24) });
		// Then
		expect(added).toMatchObject({
			ok: true,
			value: { name: "aaaaaaaaaaaaaaaaaaaaaaaa" },
		});
	});

	test("takes a name another account has", async () => {
		// Given: alice with Work; bob has an account
		const { h } = await withWork();
		await h.addAccount(BOB);
		const bob = scopeOf(h, BOB);
		// When
		const added = await tagActions.add.run(bob, { name: "work" });
		// Then
		expect(added).toMatchObject({ ok: true, value: { name: "work" } });
	});
});

describe("renaming a tag", () => {
	test("renames a tag to its own name in another letter case", async () => {
		// Given: alice with Work
		const { alice, work } = await withWork();
		// When
		const renamed = await tagActions.rename.run(alice, {
			id: work,
			name: "WORK",
		});
		// Then
		expect(renamed).toEqual({ ok: true, value: { id: work, name: "WORK" } });
	});

	test("refuses a rename to an empty name", async () => {
		// Given: alice with Work
		const { alice, work } = await withWork();
		// When
		const renamed = await tagActions.rename.run(alice, { id: work, name: "" });
		// Then
		expect(renamed).toEqual({ ok: false, error: NAME_LENGTH_ROW });
	});

	test("renames a tag once when the same rename comes twice", async () => {
		// Given: alice with Work
		const { alice, work } = await withWork();
		// When
		const first = await tagActions.rename.run(alice, {
			id: work,
			name: "Office",
		});
		const second = await tagActions.rename.run(alice, {
			id: work,
			name: "Office",
		});
		// Then
		expect([first, second]).toEqual([
			{ ok: true, value: { id: work, name: "Office" } },
			{ ok: true, value: { id: work, name: "Office" } },
		]);
	});
});

describe("deleting a tag", () => {
	test("answers not found when the same delete comes twice", async () => {
		// Given: alice with Work
		const { alice, work } = await withWork();
		// When
		await tagActions.delete.run(alice, { id: work });
		const second = await tagActions.delete.run(alice, { id: work });
		// Then
		expect(second).toEqual({
			ok: false,
			error: {
				code: "not_found",
				status: 404,
				body: { error: "not_found" },
				text: "No tag with this id.",
			},
		});
	});

	test("deletes a tag and takes it off its combinations", async () => {
		// Given: alice with Work and Weekend and three(ids) saved with both
		const { h, alice, work } = await withWork();
		const weekend = await tagActions.add.run(alice, { name: "Weekend" });
		if (!weekend.ok) throw new Error("Weekend was not added");
		const ids = Object.fromEntries(
			(await listColours(h.db, ALICE.id)).map((c) => [c.name, c.id]),
		);
		await combinationActions.save.run(alice, {
			...three(ids),
			tags: [work, weekend.value.id],
		});
		// When
		await tagActions.delete.run(alice, { id: weekend.value.id });
		const listed = await combinationActions.list.run(alice, {});
		// Then
		expect(
			listed.ok &&
				listed.value.map((c) => ({ pieces: c.pieces.length, tags: c.tags })),
		).toEqual([{ pieces: 3, tags: [work] }]);
	});
});

describe("a name another tab saves at the same time", () => {
	test("answers duplicate when another tab adds the name first", async () => {
		// Given: alice's account; another tab stores "work" between the check and
		// the write
		const { h, alice } = await withAlice();
		otherTabWrites(h, "tag", "INSERT", "Work");
		// When
		const added = await tagActions.add.run(alice, { name: "Work" });
		// Then
		expect(added).toEqual({ ok: false, error: DUPLICATE_ROW("Work") });
	});

	test("answers duplicate when another tab takes the new name first", async () => {
		// Given: alice with Work; another tab stores "office" between the check
		// and the write
		const { h, alice, work } = await withWork();
		otherTabWrites(h, "tag", "UPDATE", "Office");
		// When
		const renamed = await tagActions.rename.run(alice, {
			id: work,
			name: "Office",
		});
		// Then
		expect(renamed).toEqual({ ok: false, error: DUPLICATE_ROW("Office") });
	});
});
