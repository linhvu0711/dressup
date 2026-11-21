import { describe, expect, test } from "bun:test";
import { listColours } from "../colour-store";
import { saveCombination } from "../combination-store";
import { schema } from "../db";
import { addOwnedItem } from "../owned-item-store";
import {
	ALICE,
	BOB,
	count,
	otherTabWrites,
	scopeOf,
	withAccount,
} from "../test/harness";
import { addWish } from "../wish-store";
import type { ActionScope, Refusal } from "./action";
import { colourActions } from "./colours";

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function withAlice() {
	const { h } = await withAccount();
	return { h, alice: scopeOf(h) };
}

describe("adding a colour", () => {
	test("adds a colour", async () => {
		// Given: alice's account
		const { alice } = await withAlice();
		// When
		const added = await colourActions.add.run(alice, {
			name: "Teal",
			hex: "#2A7F7F",
		});
		// Then
		expect(added).toMatchObject({
			ok: true,
			value: { name: "Teal", hex: "#2A7F7F" },
		});
		expect(added.ok && UUID.test(added.value.id)).toBe(true);
	});

	test("refuses a name the account has, in any case", async () => {
		// Given: the 13 starter colours, Navy among them
		const { alice } = await withAlice();
		// When
		const added = await colourActions.add.run(alice, {
			name: "navy",
			hex: "#2A7F7F",
		});
		// Then
		expect(added).toEqual({
			ok: false,
			error: {
				code: "duplicate",
				status: 409,
				body: { error: "duplicate", field: "name" },
				text: "You already have a colour called navy.",
			},
		});
	});

	test("refuses an empty name", async () => {
		// Given: alice's account
		const { alice } = await withAlice();
		// When
		const added = await colourActions.add.run(alice, {
			name: "   ",
			hex: "#2A7F7F",
		});
		// Then
		expect(added).toEqual({
			ok: false,
			error: {
				code: "invalid",
				status: 400,
				body: { error: "invalid", field: "name" },
				text: "A colour name has 1 to 24 characters.",
			},
		});
	});

	test("refuses a code in small letters", async () => {
		// Given: alice's account
		const { alice } = await withAlice();
		// When
		const added = await colourActions.add.run(alice, {
			name: "Teal",
			hex: "#2a7f7f",
		});
		// Then
		expect(added).toEqual({
			ok: false,
			error: {
				code: "invalid",
				status: 400,
				body: { error: "invalid", field: "hex" },
				text: "That is not a colour written as #RRGGBB with capital letters, such as #1F3A5F.",
			},
		});
	});

	test("refuses colour number 101", async () => {
		// Given: 100 colours, the starters and 87 added
		const { alice } = await withAlice();
		for (let i = 1; i <= 87; i++)
			await colourActions.add.run(alice, {
				name: `Colour ${i}`,
				hex: "#2A7F7F",
			});
		// When
		const added = await colourActions.add.run(alice, {
			name: "Teal",
			hex: "#2A7F7F",
		});
		// Then
		expect(added).toEqual({
			ok: false,
			error: {
				code: "colour_limit",
				status: 409,
				body: { error: "colour_limit" },
				text: "You have 100 colours. That is the limit. Delete one to add a new one.",
			},
		});
	});
});

describe("changing and deleting a colour", () => {
	async function withTeal() {
		const { h, alice } = await withAlice();
		const added = await colourActions.add.run(alice, {
			name: "Teal",
			hex: "#2A7F7F",
		});
		if (!added.ok) throw new Error("Teal was not added");
		return { h, alice, teal: added.value.id };
	}

	test("changes a colour's name and code", async () => {
		// Given: Teal added
		const { alice, teal } = await withTeal();
		// When
		const changed = await colourActions.change.run(alice, {
			id: teal,
			name: "Sea",
			hex: "#2A6F7F",
		});
		// Then
		expect(changed).toEqual({
			ok: true,
			value: { id: teal, name: "Sea", hex: "#2A6F7F" },
		});
	});

	test("refuses to change another account's colour", async () => {
		// Given: Teal added by alice; bob has an account
		const { h, teal } = await withTeal();
		await h.addAccount(BOB);
		const bob = scopeOf(h, BOB);
		// When
		const changed = await colourActions.change.run(bob, {
			id: teal,
			name: "Sea",
			hex: "#2A6F7F",
		});
		// Then
		expect(changed).toEqual({
			ok: false,
			error: {
				code: "not_found",
				status: 404,
				body: { error: "not_found" },
				text: "No colour with this id.",
			},
		});
	});

	test("deletes a colour", async () => {
		// Given: Teal added
		const { alice, teal } = await withTeal();
		// When
		const deleted = await colourActions.delete.run(alice, { id: teal });
		// Then
		expect(deleted).toEqual({
			ok: true,
			value: { id: teal, name: "Teal", hex: "#2A7F7F" },
		});
	});

	test("refuses to delete a colour a combination uses", async () => {
		// Given: a combination of Navy casual pants and a White long tee
		const { h, alice } = await withAlice();
		const colours = await listColours(h.db, ALICE.id);
		const idOf = (name: string) => {
			const found = colours.find((c) => c.name === name);
			if (!found) throw new Error(`No colour ${name}`);
			return found.id;
		};
		await saveCombination(h.db, ALICE.id, {
			id: "11111111-1111-4111-8111-111111111111",
			pieces: [
				{ typeId: "casual_p", colourId: idOf("Navy") },
				{ typeId: "tee_l", colourId: idOf("White") },
			],
		});
		// When
		const deleted = await colourActions.delete.run(alice, {
			id: idOf("Navy"),
		});
		// Then
		expect(deleted).toEqual({
			ok: false,
			error: {
				code: "colour_in_use",
				status: 409,
				body: { error: "colour_in_use" },
				text: "A combination, an owned item, or a wish uses Navy, so it stays. A colour in use cannot be deleted.",
			},
		});
	});
});

const TEAL = { name: "Teal", hex: "#2A7F7F" };

const COLOUR_LIMIT_ROW = {
	code: "colour_limit",
	status: 409,
	body: { error: "colour_limit" },
	text: "You have 100 colours. That is the limit. Delete one to add a new one.",
} satisfies Refusal;

const DUPLICATE_ROW = (name: string) =>
	({
		code: "duplicate",
		status: 409,
		body: { error: "duplicate", field: "name" },
		text: `You already have a colour called ${name}.`,
	}) satisfies Refusal;

const IN_USE_ROW = {
	code: "colour_in_use",
	status: 409,
	body: { error: "colour_in_use" },
	text: "A combination, an owned item, or a wish uses Navy, so it stays. A colour in use cannot be deleted.",
} satisfies Refusal;

const NOT_FOUND_ROW = {
	code: "not_found",
	status: 404,
	body: { error: "not_found" },
	text: "No colour with this id.",
} satisfies Refusal;

// The starter set is 13, so n more makes 13 + n.
async function addColours(alice: ActionScope, n: number) {
	await listColours(alice.db, alice.userId);
	for (let i = 1; i <= n; i++)
		await colourActions.add.run(alice, {
			name: `Colour ${i}`,
			hex: "#2A7F7F",
		});
}

async function navyOf(alice: {
	db: Parameters<typeof listColours>[0];
	userId: string;
}) {
	const navy = (await listColours(alice.db, alice.userId)).find(
		(c) => c.name === "Navy",
	);
	if (!navy) throw new Error("No Navy");
	return navy.id;
}

describe("the rules of a colour name and code", () => {
	test("refuses a name of 25 characters", async () => {
		// Given: alice's account
		const { alice } = await withAlice();
		// When
		const added = await colourActions.add.run(alice, {
			name: "A".repeat(25),
			hex: "#2A7F7F",
		});
		// Then
		expect(added).toEqual({
			ok: false,
			error: {
				code: "invalid",
				status: 400,
				body: { error: "invalid", field: "name" },
				text: "A colour name has 1 to 24 characters.",
			},
		});
	});
});

describe("the colour limit", () => {
	test("adds colour number 100", async () => {
		// Given: alice with 99 colours
		const { h, alice } = await withAlice();
		await addColours(alice, 86);
		// When
		const added = await colourActions.add.run(alice, TEAL);
		// Then
		expect({
			ok: added.ok,
			count: await count(h, schema.colour),
		}).toEqual({ ok: true, count: 100 });
	});

	test("adds one of two colours sent at once at 99", async () => {
		// Given: alice with 99 colours
		const { h, alice } = await withAlice();
		await addColours(alice, 86);
		// When
		const results = await Promise.all([
			colourActions.add.run(alice, TEAL),
			colourActions.add.run(alice, { name: "Sea", hex: "#2A6F7F" }),
		]);
		// Then
		expect({
			oks: results.map((r) => r.ok).sort(),
			refused: results.flatMap((r) => (r.ok ? [] : [r.error])),
			count: await count(h, schema.colour),
		}).toEqual({
			oks: [false, true],
			refused: [COLOUR_LIMIT_ROW],
			count: 100,
		});
	});
});

describe("two writes at the same time", () => {
	test("answers duplicate when another tab adds the name first", async () => {
		// Given: alice; another tab stores "teal" between the check and the write
		const { h, alice } = await withAlice();
		otherTabWrites(h, "colour", "INSERT", "Teal");
		// When
		const added = await colourActions.add.run(alice, TEAL);
		// Then
		expect(added).toEqual({ ok: false, error: DUPLICATE_ROW("Teal") });
	});

	test("answers duplicate when another tab takes the new name first", async () => {
		// Given: alice with Teal; another tab stores "sea" between the check and
		// the write
		const { h, alice } = await withAlice();
		const added = await colourActions.add.run(alice, TEAL);
		if (!added.ok) throw new Error("Teal was not added");
		otherTabWrites(h, "colour", "UPDATE", "Sea");
		// When
		const changed = await colourActions.change.run(alice, {
			id: added.value.id,
			name: "Sea",
			hex: "#2A6F7F",
		});
		// Then
		expect(changed).toEqual({ ok: false, error: DUPLICATE_ROW("Sea") });
	});
});

describe("changing a name", () => {
	async function withTeal() {
		const { h, alice } = await withAlice();
		const added = await colourActions.add.run(alice, TEAL);
		if (!added.ok) throw new Error("Teal was not added");
		return { h, alice, teal: added.value.id };
	}

	test("changes the case of a colour's own name", async () => {
		// Given: alice with Teal
		const { alice, teal } = await withTeal();
		// When
		const changed = await colourActions.change.run(alice, {
			id: teal,
			name: "TEAL",
			hex: "#2A7F7F",
		});
		// Then
		expect(changed).toEqual({
			ok: true,
			value: { id: teal, name: "TEAL", hex: "#2A7F7F" },
		});
	});

	test("refuses to change a colour to a name another colour has", async () => {
		// Given: alice with Teal
		const { alice, teal } = await withTeal();
		// When
		const changed = await colourActions.change.run(alice, {
			id: teal,
			name: "navy",
			hex: "#2A7F7F",
		});
		// Then
		expect(changed).toEqual({ ok: false, error: DUPLICATE_ROW("navy") });
	});
});

describe("the same-name rule", () => {
	test("refuses écru when the account has Écru", async () => {
		// Given: alice with Écru
		const { alice } = await withAlice();
		const ecru = await colourActions.add.run(alice, {
			name: "Écru",
			hex: "#E8DCC4",
		});
		if (!ecru.ok) throw new Error("Écru was not added");
		// When
		const added = await colourActions.add.run(alice, {
			name: "écru",
			hex: "#2A7F7F",
		});
		// Then
		expect(added).toEqual({ ok: false, error: DUPLICATE_ROW("écru") });
	});

	test("takes Do beside Đỏ", async () => {
		// Given: alice with Đỏ
		const { alice } = await withAlice();
		const red = await colourActions.add.run(alice, {
			name: "Đỏ",
			hex: "#C8102E",
		});
		if (!red.ok) throw new Error("Đỏ was not added");
		// When
		const added = await colourActions.add.run(alice, {
			name: "Do",
			hex: "#2A7F7F",
		});
		// Then
		expect(added).toMatchObject({
			ok: true,
			value: { name: "Do", hex: "#2A7F7F" },
		});
	});
});

describe("deleting a colour", () => {
	test("refuses to delete a colour an owned item uses", async () => {
		// Given: alice with a Navy long button-up, no brand, in her closet
		const { h, alice } = await withAlice();
		const navy = await navyOf(alice);
		await addOwnedItem(h.db, h.pictures as unknown as R2Bucket, ALICE.id, {
			id: "11111111-1111-4111-8111-111111111111",
			typeId: "shirt_l",
			colourId: navy,
			brandId: null,
			quantity: 1,
		});
		// When
		const deleted = await colourActions.delete.run(alice, { id: navy });
		// Then
		expect(deleted).toEqual({ ok: false, error: IN_USE_ROW });
	});

	test("refuses to delete another account's colour", async () => {
		// Given: alice with Teal; bob has an account
		const { h, alice } = await withAlice();
		const added = await colourActions.add.run(alice, TEAL);
		if (!added.ok) throw new Error("Teal was not added");
		await h.addAccount(BOB);
		const bob = scopeOf(h, BOB);
		// When
		const deleted = await colourActions.delete.run(bob, {
			id: added.value.id,
		});
		// Then
		expect({
			error: deleted.ok ? deleted.ok : deleted.error,
			colours: (await listColours(h.db, ALICE.id)).length,
		}).toEqual({ error: NOT_FOUND_ROW, colours: 14 });
	});

	test("refuses to delete a colour a wish uses", async () => {
		// Given: alice with a Navy wool wish
		const { h, alice } = await withAlice();
		const navy = await navyOf(alice);
		await addWish(h.db, ALICE.id, {
			id: "11111111-1111-4111-8111-111111111111",
			typeId: "wool",
			colourId: navy,
		});
		// When
		const deleted = await colourActions.delete.run(alice, { id: navy });
		// Then
		expect(deleted).toEqual({ ok: false, error: IN_USE_ROW });
	});
});
