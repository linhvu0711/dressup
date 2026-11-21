import { describe, expect, test } from "bun:test";
import type { CombinationId } from "@/combinations/combination";
import type { ColourId } from "@/labels/colour";
import { listColours } from "../colour-store";
import {
	FIRST_ID,
	greyPants,
	SECOND_ID,
	three,
} from "../test/combination-pieces";
import { ALICE, BOB, withAccount } from "../test/harness";
import { combinationActions } from "./combinations";
import { tagActions } from "./tags";

const idsOf = async (
	h: { db: Parameters<typeof listColours>[0] },
	userId: string,
) =>
	Object.fromEntries(
		(await listColours(h.db, userId)).map((c) => [c.name, c.id]),
	) as Record<string, ColourId>;

async function withAlice() {
	const { h } = await withAccount();
	const alice = { db: h.db, userId: ALICE.id };
	return { h, alice, ids: await idsOf(h, ALICE.id) };
}

describe("saving a combination", () => {
	test("saves a combination", async () => {
		// Given: alice's account and her colour ids by name
		const { alice, ids } = await withAlice();
		// When
		const saved = await combinationActions.save.run(alice, three(ids));
		// Then
		expect(saved).toEqual({
			ok: true,
			value: {
				created: true,
				combination: {
					id: FIRST_ID as CombinationId,
					tags: [],
					pieces: [
						{
							layer: "bottom",
							typeId: "casual_p",
							colour: { id: ids.Navy, name: "Navy", hex: "#1F3A5F" },
						},
						{
							layer: "inner_top",
							typeId: "tee_l",
							colour: { id: ids.Black, name: "Black", hex: "#1B1B1F" },
						},
						{
							layer: "jacket",
							typeId: "harrington",
							colour: { id: ids.Khaki, name: "Khaki", hex: "#B8A57C" },
						},
					],
				},
			},
		});
	});

	test("refuses a type that is not in the list", async () => {
		// Given: alice's account
		const { alice, ids } = await withAlice();
		const input = three(ids);
		input.pieces[0] = { typeId: "jeans", colourId: ids.Khaki };
		// When
		const saved = await combinationActions.save.run(alice, input);
		// Then
		expect(saved).toEqual({
			ok: false,
			error: {
				code: "not_type",
				status: 400,
				body: { error: "invalid", field: "pieces.0.typeId" },
				text: "jeans is not a type. list_types names the types.",
			},
		});
	});

	test("refuses a colour that is not the account's", async () => {
		// Given: bob has an account and his own colours
		const { h, alice, ids } = await withAlice();
		await h.addAccount(BOB);
		const bobIds = await idsOf(h, BOB.id);
		// When
		const saved = await combinationActions.save.run(alice, {
			id: FIRST_ID,
			pieces: [
				{ typeId: "harrington", colourId: ids.Khaki },
				{ typeId: "tee_l", colourId: bobIds.Black },
				{ typeId: "casual_p", colourId: ids.Navy },
			],
		});
		// Then
		expect(saved).toEqual({
			ok: false,
			error: {
				code: "not_colour",
				status: 400,
				body: { error: "invalid", field: "pieces.1.colourId" },
				text: `${bobIds.Black} is not one of your colours. list_colours names them.`,
			},
		});
	});

	test("refuses a tag that is not the account's", async () => {
		// Given: alice's account
		const { alice, ids } = await withAlice();
		// When
		const saved = await combinationActions.save.run(alice, {
			...three(ids),
			tags: ["5b1f2c3d-0000-4000-8000-000000000000"],
		});
		// Then
		expect(saved).toEqual({
			ok: false,
			error: {
				code: "not_tag",
				status: 400,
				body: { error: "invalid", field: "tags" },
				text: "5b1f2c3d-0000-4000-8000-000000000000 is not one of your tags. list_tags names them.",
			},
		});
	});

	test("refuses a combination with 51 tags", async () => {
		// Given: 51 tags
		const { alice, ids } = await withAlice();
		const tagIds: string[] = [];
		for (let i = 1; i <= 51; i++) {
			const added = await tagActions.add.run(alice, { name: `t${i}` });
			if (added.ok) tagIds.push(added.value.id);
		}
		// When
		const saved = await combinationActions.save.run(alice, {
			...three(ids),
			tags: tagIds,
		});
		// Then
		expect(saved).toEqual({
			ok: false,
			error: {
				code: "too_many_tags",
				status: 400,
				body: { error: "invalid", field: "tags" },
				text: "A combination has at most 50 tags.",
			},
		});
	});

	test("refuses one piece", async () => {
		// Given: alice's account
		const { alice, ids } = await withAlice();
		// When
		const saved = await combinationActions.save.run(alice, {
			id: FIRST_ID,
			pieces: [{ typeId: "casual_p", colourId: ids.Navy }],
		});
		// Then
		expect(saved).toEqual({
			ok: false,
			error: {
				code: "pieces_count",
				status: 400,
				body: { error: "invalid", field: "pieces" },
				text: "A combination has 2 to 4 pieces.",
			},
		});
	});

	test("refuses two pieces in one layer", async () => {
		// Given: alice's account
		const { alice, ids } = await withAlice();
		// When
		const saved = await combinationActions.save.run(alice, {
			id: FIRST_ID,
			pieces: [
				{ typeId: "casual_p", colourId: ids.Navy },
				{ typeId: "chino_sh", colourId: ids.Black },
				{ typeId: "tee_l", colourId: ids.White },
			],
		});
		// Then
		expect(saved).toEqual({
			ok: false,
			error: {
				code: "same_layer",
				status: 400,
				body: { error: "invalid", field: "pieces.1.typeId" },
				text: "Casual pants and Chino shorts are both in the bottom layer. A combination has at most one piece for each layer.",
			},
		});
	});

	test("refuses an id that is not a uuid", async () => {
		// Given: alice's account
		const { alice, ids } = await withAlice();
		// When
		const saved = await combinationActions.save.run(alice, {
			...three(ids),
			id: "not-a-uuid",
		});
		// Then
		expect(saved).toEqual({
			ok: false,
			error: {
				code: "invalid",
				status: 400,
				body: { error: "invalid", field: "id" },
				text: "id is not valid.",
			},
		});
	});

	test("refuses an id another account saved", async () => {
		// Given: bob saved a combination with FIRST_ID
		const { h, alice, ids } = await withAlice();
		await h.addAccount(BOB);
		const bob = { db: h.db, userId: BOB.id };
		await combinationActions.save.run(bob, three(await idsOf(h, BOB.id)));
		// When
		const saved = await combinationActions.save.run(alice, three(ids));
		// Then
		expect(saved).toEqual({
			ok: false,
			error: {
				code: "conflict",
				status: 409,
				body: { error: "conflict", field: "id" },
				text: "dressup could not do this. Try again.",
			},
		});
	});

	test("refuses the same pieces in another order", async () => {
		// Given: three(ids) saved
		const { alice, ids } = await withAlice();
		await combinationActions.save.run(alice, three(ids));
		// When
		const saved = await combinationActions.save.run(alice, {
			id: SECOND_ID,
			pieces: [
				{ typeId: "casual_p", colourId: ids.Navy },
				{ typeId: "harrington", colourId: ids.Khaki },
				{ typeId: "tee_l", colourId: ids.Black },
			],
		});
		// Then
		expect(saved).toEqual({
			ok: false,
			error: {
				code: "duplicate",
				status: 409,
				body: { error: "duplicate", id: FIRST_ID },
				text: "You have this combination already, with id 11111111-1111-4111-8111-111111111111.",
			},
		});
	});

	test("refuses combination number 301", async () => {
		// Given: 300 combinations
		const { h, alice, ids } = await withAlice();
		await h.seedCombinations(ALICE.id, 300);
		// When
		const saved = await combinationActions.save.run(alice, three(ids));
		// Then
		expect(saved).toEqual({
			ok: false,
			error: {
				code: "combination_limit",
				status: 409,
				body: { error: "combination_limit" },
				text: "You have 300 combinations. That is the limit.",
			},
		});
	});
});

describe("changing and deleting a combination", () => {
	test("changes a combination and keeps its id", async () => {
		// Given: three(ids) saved
		const { alice, ids } = await withAlice();
		await combinationActions.save.run(alice, three(ids));
		// When
		const changed = await combinationActions.change.run(alice, greyPants(ids));
		// Then
		expect({
			id: changed.ok && changed.value.id,
			pieces:
				changed.ok &&
				changed.value.pieces.map((p) => [p.typeId, p.colour.name]),
		}).toEqual({
			id: FIRST_ID as CombinationId,
			pieces: [
				["casual_p", "Grey"],
				["tee_l", "Black"],
				["harrington", "Khaki"],
			],
		});
	});

	test("refuses a change to a combination that is gone", async () => {
		// Given: nothing saved
		const { alice, ids } = await withAlice();
		// When
		const changed = await combinationActions.change.run(alice, greyPants(ids));
		// Then
		expect(changed).toEqual({
			ok: false,
			error: {
				code: "not_found",
				status: 404,
				body: { error: "not_found" },
				text: "No combination with this id.",
			},
		});
	});

	test("deletes a combination", async () => {
		// Given: a combination changed
		const { alice, ids } = await withAlice();
		await combinationActions.save.run(alice, three(ids));
		await combinationActions.change.run(alice, greyPants(ids));
		// When
		const deleted = await combinationActions.delete.run(alice, {
			id: FIRST_ID,
		});
		// Then
		expect(deleted).toEqual({ ok: true, value: FIRST_ID as CombinationId });
	});
});
