import { describe, expect, test } from "bun:test";
import { ALICE, withAccount } from "../test/harness";
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
