import { describe, expect, test } from "bun:test";
import type { CombinationId } from "@/combinations/combination";
import type { ColourId } from "@/labels/colour";
import type { TagId } from "@/tags/tag";
import { listColours } from "../colour-store";
import { schema } from "../db";
import { combinationPiece } from "../db/combination-schema";
import { addOwnedItem } from "../owned-item-store";
import { listTags } from "../tag-store";
import {
	beigeChinos,
	FIRST_ID,
	greyPants,
	SECOND_ID,
	THIRD_ID,
	three,
	two,
} from "../test/combination-pieces";
import { ALICE, BOB, count, type Harness, withAccount } from "../test/harness";
import type { Refusal } from "./action";
import { colourActions } from "./colours";
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
		const tagIds: TagId[] = [];
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

describe("listing combinations", () => {
	test("lists the newest first", async () => {
		// Given: three(ids), then two(ids) saved
		const { alice, ids } = await withAlice();
		await combinationActions.save.run(alice, three(ids));
		await combinationActions.save.run(alice, two(ids));
		// When
		const listed = await combinationActions.list.run(alice, {});
		// Then
		expect(listed.ok && listed.value.map((c) => c.id)).toEqual([
			SECOND_ID as CombinationId,
			FIRST_ID as CombinationId,
		]);
	});

	test("lists with no filter and writes no starter colours", async () => {
		// Given: alice's account, no colour list read yet
		const { h } = await withAccount();
		const alice = { db: h.db, userId: ALICE.id };
		// When
		const listed = await combinationActions.list.run(alice, {});
		// Then
		expect({
			listed,
			colours: await count(h, schema.colour),
		}).toEqual({ listed: { ok: true, value: [] }, colours: 0 });
	});
});

const NOT_FOUND_ROW = {
	code: "not_found",
	status: 404,
	body: { error: "not_found" },
	text: "No combination with this id.",
} satisfies Refusal;

const LIMIT_ROW = {
	code: "combination_limit",
	status: 409,
	body: { error: "combination_limit" },
	text: "You have 300 combinations. That is the limit.",
} satisfies Refusal;

const DUPLICATE_ROW = (id: string) =>
	({
		code: "duplicate",
		status: 409,
		body: { error: "duplicate", id },
		text: `You have this combination already, with id ${id}.`,
	}) satisfies Refusal;

const NO_TAG = "5b1f2c3d-0000-4000-8000-000000000000";

const NOT_TAG_ROW = (value: string) =>
	({
		code: "not_tag",
		status: 400,
		body: { error: "invalid", field: "tags" },
		text: `${value} is not one of your tags. list_tags names them.`,
	}) satisfies Refusal;

type Scope = { db: Harness["db"]; userId: string };

// Another tab's write, run after this call's checks and before its batch.
function beforeNextBatch(h: Harness, otherTab: () => Promise<unknown>) {
	const { db } = h;
	const batch = db.batch.bind(db);
	const otherTabFirst: typeof batch = async (items) => {
		db.batch = batch;
		await otherTab();
		return batch(items);
	};
	db.batch = otherTabFirst;
}

const listed = async (scope: Scope) => {
	const result = await combinationActions.list.run(scope, {});
	if (!result.ok) throw new Error("The list was refused");
	return result.value;
};

// Each piece as its type and colour name, bottom layer first.
const piecesOf = (
	c: { pieces: { typeId: string; colour: { name: string } }[] } | undefined,
) => c?.pieces.map((p) => [p.typeId, p.colour.name]);

async function addTags(alice: Scope, names: string[]) {
	const tagIds: TagId[] = [];
	for (const name of names) {
		const added = await tagActions.add.run(alice, { name });
		if (!added.ok) throw new Error(`${name} was not added`);
		tagIds.push(added.value.id);
	}
	return tagIds;
}

describe("the rules of the pieces", () => {
	test("refuses five pieces", async () => {
		// Given: alice's account
		const { alice, ids } = await withAlice();
		const input = three(ids);
		input.pieces.push(
			{ typeId: "sweater", colourId: ids.Navy },
			{ typeId: "chino_sh", colourId: ids.Black },
		);
		// When
		const saved = await combinationActions.save.run(alice, input);
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
});

describe("two saves at the same time", () => {
	test("answers duplicate when another tab saves the same pieces first", async () => {
		// Given: alice; her save's write waits until another tab saved the same
		// pieces with id 33333333-...
		const { h, alice, ids } = await withAlice();
		beforeNextBatch(h, () =>
			combinationActions.save.run(alice, { ...three(ids), id: THIRD_ID }),
		);
		// When
		const saved = await combinationActions.save.run(alice, three(ids));
		// Then
		expect({
			saved,
			ids: (await listed(alice)).map((c) => c.id),
		}).toEqual({
			saved: { ok: false, error: DUPLICATE_ROW(THIRD_ID) },
			ids: [THIRD_ID as CombinationId],
		});
	});

	test("keeps no piece of a colour deleted while the save writes", async () => {
		// Given: alice; a trigger deletes Navy just before its piece is written,
		// after the save's colour check passed
		const { h, alice, ids } = await withAlice();
		h.addTrigger(
			`CREATE TRIGGER drop_navy BEFORE INSERT ON combination_piece WHEN NEW.colour_id = '${ids.Navy}' BEGIN DELETE FROM colour WHERE id = NEW.colour_id; END`,
		);
		// When
		const outcome = await combinationActions.save.run(alice, three(ids)).then(
			() => "resolved",
			() => "rejected",
		);
		// Then
		expect({ outcome, list: await listed(alice) }).toEqual({
			outcome: "rejected",
			list: [],
		});
	});
});

describe("the combination limit", () => {
	test("saves combination number 300", async () => {
		// Given: alice with 299 combinations
		const { h, alice, ids } = await withAlice();
		await h.seedCombinations(ALICE.id, 299);
		// When
		const saved = await combinationActions.save.run(alice, three(ids));
		// Then
		expect({ ok: saved.ok, count: await count(h, schema.combination) }).toEqual(
			{ ok: true, count: 300 },
		);
	});

	test("saves one of two combinations sent at once at 299", async () => {
		// Given: alice with 299 combinations; the seed makes no jacket, so neither
		// save below is a duplicate
		const { h, alice, ids } = await withAlice();
		await h.seedCombinations(ALICE.id, 299);
		// When
		const results = await Promise.all([
			combinationActions.save.run(alice, three(ids)),
			combinationActions.save.run(alice, { ...greyPants(ids), id: SECOND_ID }),
		]);
		// Then
		expect({
			oks: results.map((r) => r.ok).sort(),
			refused: results.flatMap((r) => (r.ok ? [] : [r.error])),
			count: await count(h, schema.combination),
		}).toEqual({
			oks: [false, true],
			refused: [LIMIT_ROW],
			count: 300,
		});
	});
});

describe("tags on a combination", () => {
	test("saves a combination with its tags and lists them", async () => {
		// Given: alice with tags Work and Weekend
		const { alice, ids } = await withAlice();
		const [work, weekend] = await addTags(alice, ["Work", "Weekend"]);
		// When
		const saved = await combinationActions.save.run(alice, {
			...three(ids),
			tags: [work, weekend],
		});
		// Then
		expect(saved.ok && saved.value.combination.tags).toEqual([work, weekend]);
	});

	test("saves a combination with no tags when the input has none", async () => {
		// Given: alice's account
		const { alice, ids } = await withAlice();
		// When
		const saved = await combinationActions.save.run(alice, three(ids));
		// Then
		expect(saved.ok && saved.value.combination.tags).toEqual([]);
	});

	test("writes the tags of a save sent again with other tags", async () => {
		// Given: alice with Work and Weekend; three(ids) saved with Work
		const { alice, ids } = await withAlice();
		const [work, weekend] = await addTags(alice, ["Work", "Weekend"]);
		await combinationActions.save.run(alice, { ...three(ids), tags: [work] });
		// When
		const again = await combinationActions.save.run(alice, {
			...three(ids),
			tags: [weekend],
		});
		// Then
		expect({
			created: again.ok && again.value.created,
			tags: again.ok && again.value.combination.tags,
			listed: (await listed(alice)).map((c) => c.tags),
		}).toEqual({ created: false, tags: [weekend], listed: [[weekend]] });
	});

	test("saves a combination's tags once when the same save comes twice", async () => {
		// Given: alice with Work
		const { alice, ids } = await withAlice();
		const [work] = await addTags(alice, ["Work"]);
		const input = { ...three(ids), tags: [work] };
		// When
		const first = await combinationActions.save.run(alice, input);
		const second = await combinationActions.save.run(alice, input);
		// Then
		expect({
			created: [first, second].map((r) => r.ok && r.value.created),
			tags: (await listed(alice)).map((c) => c.tags),
		}).toEqual({ created: [true, false], tags: [[work]] });
	});

	test("saves a combination with 50 tags", async () => {
		// Given: alice with tags t1 to t50
		const { alice, ids } = await withAlice();
		const tagIds = await addTags(
			alice,
			Array.from({ length: 50 }, (_, i) => `t${i + 1}`),
		);
		// When
		const saved = await combinationActions.save.run(alice, {
			...three(ids),
			tags: tagIds,
		});
		// Then
		expect(saved.ok && saved.value.combination.tags.length).toEqual(50);
	});

	test("refuses a tag id that is not a uuid", async () => {
		// Given: alice with Work
		const { alice, ids } = await withAlice();
		const [work] = await addTags(alice, ["Work"]);
		// When
		const saved = await combinationActions.save.run(alice, {
			...three(ids),
			tags: [work, "work"],
		});
		// Then
		expect(saved).toEqual({ ok: false, error: NOT_TAG_ROW("work") });
	});

	test("refuses a combination with tags at the combination limit", async () => {
		// Given: alice with 300 combinations and Work
		const { h, alice, ids } = await withAlice();
		await h.seedCombinations(ALICE.id, 300);
		const [work] = await addTags(alice, ["Work"]);
		// When
		const saved = await combinationActions.save.run(alice, {
			...three(ids),
			tags: [work],
		});
		// Then
		expect(saved).toEqual({ ok: false, error: LIMIT_ROW });
	});

	test("refuses a tag another account has", async () => {
		// Given: alice's account; bob's tag Work
		const { h, alice, ids } = await withAlice();
		await h.addAccount(BOB);
		const bob = { db: h.db, userId: BOB.id };
		const [bobWork] = await addTags(bob, ["Work"]);
		// When
		const saved = await combinationActions.save.run(alice, {
			...three(ids),
			tags: [bobWork],
		});
		// Then
		expect({
			saved,
			bobTags: (await listTags(h.db, BOB.id)).map((t) => t.name),
		}).toEqual({
			saved: { ok: false, error: NOT_TAG_ROW(bobWork) },
			bobTags: ["Work"],
		});
	});

	test("saves a combination without a tag deleted while the save writes", async () => {
		// Given: alice with Work and Weekend; another tab deletes Weekend after
		// the save's tag check and before its batch
		const { h, alice, ids } = await withAlice();
		const [work, weekend] = await addTags(alice, ["Work", "Weekend"]);
		beforeNextBatch(h, () => tagActions.delete.run(alice, { id: weekend }));
		// When
		const saved = await combinationActions.save.run(alice, {
			...three(ids),
			tags: [work, weekend],
		});
		// Then
		expect({
			ok: saved.ok,
			tags: (await listed(alice)).map((c) => c.tags),
		}).toEqual({ ok: true, tags: [[work]] });
	});

	test("changes only a combination's tags", async () => {
		// Given: alice with Work and Weekend; three(ids) saved with Work
		const { alice, ids } = await withAlice();
		const [work, weekend] = await addTags(alice, ["Work", "Weekend"]);
		await combinationActions.save.run(alice, { ...three(ids), tags: [work] });
		// When
		const changed = await combinationActions.change.run(alice, {
			...three(ids),
			tags: [weekend],
		});
		// Then
		expect({
			tags: changed.ok && changed.value.tags,
			pieces: changed.ok && piecesOf(changed.value),
		}).toEqual({
			tags: [weekend],
			pieces: [
				["casual_p", "Navy"],
				["tee_l", "Black"],
				["harrington", "Khaki"],
			],
		});
	});

	test("keeps a combination's tags when a change leaves them out", async () => {
		// Given: alice with Work; three(ids) saved with it
		const { alice, ids } = await withAlice();
		const [work] = await addTags(alice, ["Work"]);
		await combinationActions.save.run(alice, { ...three(ids), tags: [work] });
		// When
		const changed = await combinationActions.change.run(alice, {
			id: FIRST_ID,
			pieces: beigeChinos(ids),
		});
		// Then
		expect(changed.ok && changed.value.tags).toEqual([work]);
	});

	test("changes a combination's tags once when the same change comes twice", async () => {
		// Given: alice with Work and Weekend; three(ids) saved with Work
		const { alice, ids } = await withAlice();
		const [work, weekend] = await addTags(alice, ["Work", "Weekend"]);
		await combinationActions.save.run(alice, { ...three(ids), tags: [work] });
		const input = { ...three(ids), tags: [work, weekend] };
		// When
		const first = await combinationActions.change.run(alice, input);
		const second = await combinationActions.change.run(alice, input);
		// Then
		expect([first, second].map((r) => r.ok && r.value.tags)).toEqual([
			[work, weekend],
			[work, weekend],
		]);
	});

	test("refuses a change with a tag that is not the account's", async () => {
		// Given: alice with Work; three(ids) saved with it
		const { alice, ids } = await withAlice();
		const [work] = await addTags(alice, ["Work"]);
		await combinationActions.save.run(alice, { ...three(ids), tags: [work] });
		// When
		const changed = await combinationActions.change.run(alice, {
			...three(ids),
			tags: [NO_TAG],
		});
		// Then
		expect({
			changed,
			tags: (await listed(alice)).map((c) => c.tags),
		}).toEqual({
			changed: { ok: false, error: NOT_TAG_ROW(NO_TAG) },
			tags: [[work]],
		});
	});

	test("answers not_found when another tab deletes the combination during a tag change", async () => {
		// Given: alice with Work; three(ids) saved with no tags; another tab
		// deletes it before the change writes
		const { h, alice, ids } = await withAlice();
		const [work] = await addTags(alice, ["Work"]);
		await combinationActions.save.run(alice, three(ids));
		beforeNextBatch(h, () =>
			combinationActions.delete.run(alice, { id: FIRST_ID }),
		);
		// When
		const changed = await combinationActions.change.run(alice, {
			...three(ids),
			tags: [work],
		});
		// Then
		expect(changed).toEqual({ ok: false, error: NOT_FOUND_ROW });
	});

	test("changes a combination without a tag deleted while the change writes", async () => {
		// Given: alice with Work and Weekend; three(ids) saved with no tags;
		// another tab deletes Weekend before the change writes
		const { h, alice, ids } = await withAlice();
		const [work, weekend] = await addTags(alice, ["Work", "Weekend"]);
		await combinationActions.save.run(alice, three(ids));
		beforeNextBatch(h, () => tagActions.delete.run(alice, { id: weekend }));
		// When
		const changed = await combinationActions.change.run(alice, {
			...three(ids),
			tags: [work, weekend],
		});
		// Then
		expect({
			ok: changed.ok,
			tags: (await listed(alice)).map((c) => c.tags),
		}).toEqual({ ok: true, tags: [[work]] });
	});

	test("keeps one tab's tags when two tabs change them at once", async () => {
		// Given: alice with Work and Weekend; three(ids) saved with no tags;
		// another tab sets Weekend before this change writes
		const { h, alice, ids } = await withAlice();
		const [work, weekend] = await addTags(alice, ["Work", "Weekend"]);
		await combinationActions.save.run(alice, three(ids));
		beforeNextBatch(h, () =>
			combinationActions.change.run(alice, {
				...three(ids),
				tags: [weekend],
			}),
		);
		// When
		await combinationActions.change.run(alice, { ...three(ids), tags: [work] });
		// Then
		expect((await listed(alice)).map((c) => c.tags)).toEqual([[work]]);
	});
});

describe("changing a combination", () => {
	test("changes nothing more when the same change comes twice", async () => {
		// Given: alice; three(ids), two(ids) saved; greyPants(ids) changed once
		const { alice, ids } = await withAlice();
		await combinationActions.save.run(alice, three(ids));
		await combinationActions.save.run(alice, two(ids));
		const first = await combinationActions.change.run(alice, greyPants(ids));
		const listedOnce = await listed(alice);
		// When
		const again = await combinationActions.change.run(alice, greyPants(ids));
		// Then
		expect({ again, listed: await listed(alice) }).toEqual({
			again: first,
			listed: listedOnce,
		});
	});

	test("refuses a change into a combination the account has", async () => {
		// Given: alice; three(ids), two(ids) saved
		const { alice, ids } = await withAlice();
		await combinationActions.save.run(alice, three(ids));
		await combinationActions.save.run(alice, two(ids));
		// When
		const changed = await combinationActions.change.run(alice, {
			id: FIRST_ID,
			pieces: two(ids).pieces,
		});
		// Then
		expect(changed).toEqual({ ok: false, error: DUPLICATE_ROW(SECOND_ID) });
	});

	test("refuses a change to another account's combination", async () => {
		// Given: bob saved Black long tee + Navy casual pants under FIRST_ID, with
		// no jacket; alice has an account
		const { h, alice, ids } = await withAlice();
		await h.addAccount(BOB);
		const bob = { db: h.db, userId: BOB.id };
		const bobIds = await idsOf(h, BOB.id);
		await combinationActions.save.run(bob, {
			id: FIRST_ID,
			pieces: [
				{ typeId: "tee_l", colourId: bobIds.Black },
				{ typeId: "casual_p", colourId: bobIds.Navy },
			],
		});
		const bobsBefore = await listed(bob);
		// When
		const changed = await combinationActions.change.run(alice, greyPants(ids));
		// Then
		expect({ changed, bobs: await listed(bob) }).toEqual({
			changed: { ok: false, error: NOT_FOUND_ROW },
			bobs: bobsBefore,
		});
	});

	test("answers duplicate when another tab changes a combination into the same pieces first", async () => {
		// Given: alice saved three(ids), two(ids), and a third; before the
		// change writes, another tab changes the third into Beige chinos
		const { h, alice, ids } = await withAlice();
		await combinationActions.save.run(alice, three(ids));
		await combinationActions.save.run(alice, two(ids));
		await combinationActions.save.run(alice, {
			id: THIRD_ID,
			pieces: [
				{ typeId: "casual_p", colourId: ids.Grey },
				{ typeId: "tee_s", colourId: ids.White },
			],
		});
		beforeNextBatch(h, () =>
			combinationActions.change.run(alice, {
				id: THIRD_ID,
				pieces: beigeChinos(ids),
			}),
		);
		// When
		const changed = await combinationActions.change.run(alice, {
			id: FIRST_ID,
			pieces: beigeChinos(ids),
		});
		// Then
		expect({
			changed,
			pieces: piecesOf((await listed(alice)).find((c) => c.id === FIRST_ID)),
		}).toEqual({
			changed: { ok: false, error: DUPLICATE_ROW(THIRD_ID) },
			pieces: [
				["casual_p", "Navy"],
				["tee_l", "Black"],
				["harrington", "Khaki"],
			],
		});
	});

	test("answers not_found when another tab deletes the combination during a change", async () => {
		// Given: alice saved three(ids); another tab deletes it before the change
		// writes
		const { h, alice, ids } = await withAlice();
		await combinationActions.save.run(alice, three(ids));
		beforeNextBatch(h, () =>
			combinationActions.delete.run(alice, { id: FIRST_ID }),
		);
		// When
		const changed = await combinationActions.change.run(alice, {
			id: FIRST_ID,
			pieces: beigeChinos(ids),
		});
		// Then
		expect({
			changed,
			listed: await listed(alice),
			pieces: (await h.rows(combinationPiece)).filter(
				(p) => p.combinationId === FIRST_ID,
			),
		}).toEqual({
			changed: { ok: false, error: NOT_FOUND_ROW },
			listed: [],
			pieces: [],
		});
	});

	test("keeps one tab's pieces whole when two tabs change one combination", async () => {
		// Given: alice saved three(ids); another tab changes it into four pieces
		// before this change writes
		const { h, alice, ids } = await withAlice();
		await combinationActions.save.run(alice, three(ids));
		beforeNextBatch(h, () =>
			combinationActions.change.run(alice, {
				id: FIRST_ID,
				pieces: [
					{ typeId: "casual_p", colourId: ids.Grey },
					{ typeId: "tee_l", colourId: ids.Black },
					{ typeId: "sweater", colourId: ids.Navy },
					{ typeId: "harrington", colourId: ids.Khaki },
				],
			}),
		);
		// When
		const changed = await combinationActions.change.run(alice, {
			id: FIRST_ID,
			pieces: beigeChinos(ids),
		});
		// Then
		expect({
			ok: changed.ok,
			pieces: piecesOf((await listed(alice))[0]),
		}).toEqual({
			ok: true,
			pieces: [
				["chino_p", "Beige"],
				["tee_l", "White"],
			],
		});
	});

	test("keeps the old pieces when a colour is deleted while a change writes", async () => {
		// Given: alice saved three(ids); a trigger deletes Beige just before its
		// piece is written, after the change's colour check passed
		const { h, alice, ids } = await withAlice();
		await combinationActions.save.run(alice, three(ids));
		h.addTrigger(
			`CREATE TRIGGER drop_beige BEFORE INSERT ON combination_piece WHEN NEW.colour_id = '${ids.Beige}' BEGIN DELETE FROM colour WHERE id = NEW.colour_id; END`,
		);
		// When
		const outcome = await combinationActions.change
			.run(alice, { id: FIRST_ID, pieces: beigeChinos(ids) })
			.then(
				() => "resolved",
				() => "rejected",
			);
		// Then
		expect({
			outcome,
			pieces: piecesOf((await listed(alice))[0]),
		}).toEqual({
			outcome: "rejected",
			pieces: [
				["casual_p", "Navy"],
				["tee_l", "Black"],
				["harrington", "Khaki"],
			],
		});
	});
});

describe("deleting a combination", () => {
	test("refuses to delete another account's combination", async () => {
		// Given: bob saved three(bobIds); alice has an account
		const { h, alice } = await withAlice();
		await h.addAccount(BOB);
		const bob = { db: h.db, userId: BOB.id };
		await combinationActions.save.run(bob, three(await idsOf(h, BOB.id)));
		// When
		const deleted = await combinationActions.delete.run(alice, {
			id: FIRST_ID,
		});
		// Then
		expect({
			deleted,
			bobs: (await listed(bob)).map((c) => c.id),
		}).toEqual({
			deleted: { ok: false, error: NOT_FOUND_ROW },
			bobs: [FIRST_ID as CombinationId],
		});
	});
});

describe("listing the account's combinations", () => {
	test("lists only own combinations", async () => {
		// Given: alice saved three(ids); bob has an account
		const { h, alice, ids } = await withAlice();
		await combinationActions.save.run(alice, three(ids));
		await h.addAccount(BOB);
		const bob = { db: h.db, userId: BOB.id };
		// When
		const listedForBob = await combinationActions.list.run(bob, {});
		// Then
		expect(listedForBob).toEqual({ ok: true, value: [] });
	});

	test("shows a colour's new name on its combination", async () => {
		// Given: alice saved three(ids), then changed Navy to Ink #22324A
		const { alice, ids } = await withAlice();
		await combinationActions.save.run(alice, three(ids));
		await colourActions.change.run(alice, {
			id: ids.Navy,
			name: "Ink",
			hex: "#22324A",
		});
		// When
		const [first] = await listed(alice);
		// Then
		expect(first.pieces[0].colour).toEqual({
			id: ids.Navy,
			name: "Ink",
			hex: "#22324A",
		});
	});
});

describe("filtering the list", () => {
	test("lists the combinations that hold every piece row and carry every tag", async () => {
		// Given: alice with Work; two(ids), three(ids) with Work, and Navy chino
		// pants with a White short tee and Work, saved in that order
		const { alice, ids } = await withAlice();
		const [work] = await addTags(alice, ["Work"]);
		await combinationActions.save.run(alice, two(ids));
		await combinationActions.save.run(alice, { ...three(ids), tags: [work] });
		await combinationActions.save.run(alice, {
			id: THIRD_ID,
			pieces: [
				{ typeId: "chino_p", colourId: ids.Navy },
				{ typeId: "tee_s", colourId: ids.White },
			],
			tags: [work],
		});
		// When
		const found = await combinationActions.list.run(alice, {
			pieces: [
				{ typeId: "tee_s", colourId: ids.White },
				{ colourId: ids.Navy },
			],
			tags: [work],
		});
		// Then
		expect(
			found.ok && found.value.map((c) => c.pieces.map((p) => p.typeId)),
		).toEqual([["chino_p", "tee_s"]]);
	});

	describe("with Pieces I own", () => {
		// two(ids) and three(ids) saved; the closet has both pieces of two(ids)
		async function withTwoPiecesOwned() {
			const { h, alice, ids } = await withAlice();
			await combinationActions.save.run(alice, two(ids));
			await combinationActions.save.run(alice, three(ids));
			for (const [typeId, colour] of [
				["train_sh", "Grey"],
				["tee_s", "White"],
			] as const)
				await addOwnedItem(h.db, h.pictures as unknown as R2Bucket, ALICE.id, {
					id: crypto.randomUUID(),
					typeId,
					colourId: ids[colour],
					brandId: null,
					quantity: 1,
				});
			return alice;
		}

		test("lists only the combinations whose pieces the closet has all of with own all", async () => {
			// Given
			const alice = await withTwoPiecesOwned();
			// When
			const found = await combinationActions.list.run(alice, { own: "all" });
			// Then
			expect(
				found.ok && found.value.map((c) => c.pieces.map((p) => p.typeId)),
			).toEqual([["train_sh", "tee_s"]]);
		});

		test("lists the combinations with a piece the closet lacks with own not_all", async () => {
			// Given
			const alice = await withTwoPiecesOwned();
			// When
			const found = await combinationActions.list.run(alice, {
				own: "not_all",
			});
			// Then
			expect(
				found.ok && found.value.map((c) => c.pieces.map((p) => p.typeId)),
			).toEqual([["casual_p", "tee_l", "harrington"]]);
		});
	});

	test("refuses a type in a filter that is not a type", async () => {
		// Given: alice's account
		const { alice } = await withAlice();
		// When
		const found = await combinationActions.list.run(alice, {
			pieces: [{ typeId: "jeans" }],
		});
		// Then
		expect(found).toEqual({
			ok: false,
			error: {
				code: "not_type",
				status: 400,
				body: { error: "invalid", field: "pieces.0.typeId" },
				text: "jeans is not a type. list_types names the types.",
			},
		});
	});

	test("refuses a colour in a filter that is not the account's", async () => {
		// Given: alice's account
		const { alice } = await withAlice();
		// When
		const found = await combinationActions.list.run(alice, {
			pieces: [{ colourId: "not-a-colour" }],
		});
		// Then
		expect(found).toEqual({
			ok: false,
			error: {
				code: "not_colour",
				status: 400,
				body: { error: "invalid", field: "pieces.0.colourId" },
				text: "not-a-colour is not one of your colours. list_colours names them.",
			},
		});
	});
});
