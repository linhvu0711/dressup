import { describe, expect, test } from "bun:test";
import type { Hex } from "@/colour/hex";
import { scopeOf, withAccount } from "../test/harness";
import { mannequinActions } from "./mannequin";

async function withAlice() {
	const { h } = await withAccount();
	return { h, alice: scopeOf(h) };
}

describe("setting a mannequin colour", () => {
	test("keeps a skin from one device and a hair from another", async () => {
		// Given: alice signed in, no mannequin row
		const { alice } = await withAlice();
		// When
		await mannequinActions.set.run(alice, { part: "skin", hex: "#8D5524" });
		const set = await mannequinActions.set.run(alice, {
			part: "hair",
			hex: "#B55239",
		});
		// Then
		expect(set).toEqual({
			ok: true,
			value: { skin: "#8D5524" as Hex, hair: "#B55239" as Hex },
		});
	});

	test("ends in the same colours when one skin is set twice", async () => {
		// Given: alice signed in, no mannequin row
		const { alice } = await withAlice();
		// When
		await mannequinActions.set.run(alice, { part: "skin", hex: "#8D5524" });
		const set = await mannequinActions.set.run(alice, {
			part: "skin",
			hex: "#8D5524",
		});
		// Then
		expect(set).toEqual({
			ok: true,
			value: { skin: "#8D5524" as Hex, hair: "#141418" as Hex },
		});
	});

	test("refuses a colour that is not a colour code", async () => {
		// Given: alice signed in, no mannequin row
		const { alice } = await withAlice();
		// When
		const set = await mannequinActions.set.run(alice, {
			part: "skin",
			hex: "brown",
		});
		// Then
		expect(set).toEqual({
			ok: false,
			error: {
				code: "invalid",
				status: 400,
				body: { error: "invalid", field: "hex" },
				text: "That is not a colour written as #RRGGBB with capital letters, such as #1F3A5F.",
			},
		});
	});

	test("refuses a part that is not skin or hair", async () => {
		// Given: alice's account
		const { alice } = await withAlice();
		// When
		const set = await mannequinActions.set.run(alice, {
			part: "eyes",
			hex: "brown",
		});
		// Then
		expect(set).toEqual({
			ok: false,
			error: {
				code: "invalid",
				status: 400,
				body: { error: "invalid", field: "part" },
				text: "A part is skin or hair.",
			},
		});
	});
});
