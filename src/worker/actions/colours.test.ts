import { describe, expect, test } from "bun:test";
import { listColours } from "../colour-store";
import { saveCombination } from "../combination-store";
import { ALICE, BOB, withAccount } from "../test/harness";
import { colourActions } from "./colours";

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function withAlice() {
	const { h } = await withAccount();
	return { h, alice: { db: h.db, userId: ALICE.id } };
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
		const bob = { db: h.db, userId: BOB.id };
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
