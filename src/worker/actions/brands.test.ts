import { describe, expect, test } from "bun:test";
import { listBrands } from "../brand-store";
import { listColours } from "../colour-store";
import { schema } from "../db";
import { addOwnedItem, listOwnedItems } from "../owned-item-store";
import {
	ALICE,
	BOB,
	count,
	otherTabWrites,
	withAccount,
} from "../test/harness";
import { addShopLink, addWish, listWishes } from "../wish-store";
import type { Refusal } from "./action";
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

const DUPLICATE_ROW = (name: string) =>
	({
		code: "duplicate",
		status: 409,
		body: { error: "duplicate", field: "name" },
		text: `You already have a brand called ${name}.`,
	}) satisfies Refusal;

const BRAND_LIMIT_ROW = {
	code: "brand_limit",
	status: 409,
	body: { error: "brand_limit" },
	text: "You have 100 brands. That is the limit. Delete one to add a new one.",
} satisfies Refusal;

async function addBrands(
	alice: { db: Parameters<typeof listColours>[0]; userId: string },
	n: number,
) {
	for (let i = 1; i <= n; i++)
		await brandActions.add.run(alice, { name: `Brand ${i}` });
}

describe("the rules of a brand name", () => {
	test("refuses a 25-character name", async () => {
		// Given: alice with no brands
		const { alice } = await withAlice();
		// When
		const added = await brandActions.add.run(alice, { name: "B".repeat(25) });
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
});

describe("the brand limit", () => {
	test("adds brand number 100", async () => {
		// Given: alice with 99 brands
		const { h, alice } = await withAlice();
		await addBrands(alice, 99);
		// When
		const added = await brandActions.add.run(alice, { name: "Uniqlo" });
		// Then
		expect({ ok: added.ok, count: await count(h, schema.brand) }).toEqual({
			ok: true,
			count: 100,
		});
	});

	test("adds one of two brands sent at once at 99", async () => {
		// Given: alice with 99 brands
		const { h, alice } = await withAlice();
		await addBrands(alice, 99);
		// When
		const results = await Promise.all([
			brandActions.add.run(alice, { name: "Uniqlo" }),
			brandActions.add.run(alice, { name: "Muji" }),
		]);
		// Then
		expect({
			oks: results.map((r) => r.ok).sort(),
			refused: results.flatMap((r) => (r.ok ? [] : [r.error])),
			count: await count(h, schema.brand),
		}).toEqual({
			oks: [false, true],
			refused: [BRAND_LIMIT_ROW],
			count: 100,
		});
	});
});

describe("two writes at the same time", () => {
	test("answers duplicate when another tab adds the name first", async () => {
		// Given: alice with no brands; another tab stores "zara" between the
		// check and the write
		const { h, alice } = await withAlice();
		otherTabWrites(h, "brand", "INSERT", "Zara");
		// When
		const added = await brandActions.add.run(alice, { name: "Zara" });
		// Then
		expect(added).toEqual({ ok: false, error: DUPLICATE_ROW("Zara") });
	});

	test("answers duplicate when another tab saves the name during a rename", async () => {
		// Given: alice with COS; another tab stores "zara" between the check and
		// the write
		const { h, alice } = await withAlice();
		const cos = await brandActions.add.run(alice, { name: "COS" });
		if (!cos.ok) throw new Error("COS was not added");
		otherTabWrites(h, "brand", "UPDATE", "Zara");
		// When
		const renamed = await brandActions.rename.run(alice, {
			id: cos.value.id,
			name: "Zara",
		});
		// Then
		expect(renamed).toEqual({ ok: false, error: DUPLICATE_ROW("Zara") });
	});
});

describe("renaming a brand", () => {
	test("renames a brand to its own name in another case", async () => {
		// Given: alice with Zara
		const { alice, zara } = await withZara();
		// When
		const renamed = await brandActions.rename.run(alice, {
			id: zara,
			name: "ZARA",
		});
		// Then
		expect(renamed).toEqual({ ok: true, value: { id: zara, name: "ZARA" } });
	});

	test("refuses a rename to another brand's name", async () => {
		// Given: alice with Zara and COS
		const { alice } = await withZara();
		const cos = await brandActions.add.run(alice, { name: "COS" });
		if (!cos.ok) throw new Error("COS was not added");
		// When
		const renamed = await brandActions.rename.run(alice, {
			id: cos.value.id,
			name: "zara",
		});
		// Then
		expect(renamed).toEqual({ ok: false, error: DUPLICATE_ROW("zara") });
	});
});

describe("deleting a brand", () => {
	test("refuses to delete another account's brand", async () => {
		// Given: bob with Zara; alice has an account
		const { h, alice } = await withAlice();
		await h.addAccount(BOB);
		const bob = { db: h.db, userId: BOB.id };
		const zara = await brandActions.add.run(bob, { name: "Zara" });
		if (!zara.ok) throw new Error("Zara was not added");
		// When
		const deleted = await brandActions.delete.run(alice, { id: zara.value.id });
		// Then
		expect({
			deleted,
			bobBrands: (await listBrands(h.db, BOB.id)).map((b) => b.name),
		}).toEqual({
			deleted: {
				ok: false,
				error: {
					code: "not_found",
					status: 404,
					body: { error: "not_found" },
					text: "No brand with this id.",
				},
			},
			bobBrands: ["Zara"],
		});
	});
});

describe("the brand of owned items and shop links", () => {
	const NAVY_SHIRT = {
		typeId: "shirt_l",
		quantity: 1,
	};

	async function withZaraAndNavy() {
		const { h, alice, zara } = await withZara();
		const navy = (await listColours(h.db, ALICE.id)).find(
			(c) => c.name === "Navy",
		);
		if (!navy) throw new Error("No Navy");
		return { h, alice, zara, navy: navy.id };
	}

	const bucket = (h: { pictures: unknown }) => h.pictures as R2Bucket;

	test("clears the brand of its items when the brand goes", async () => {
		// Given: alice with Zara and a Navy long button-up from Zara
		const { h, alice, zara, navy } = await withZaraAndNavy();
		await addOwnedItem(h.db, bucket(h), ALICE.id, {
			...NAVY_SHIRT,
			id: "11111111-1111-4111-8111-111111111111",
			colourId: navy,
			brandId: zara,
		});
		// When
		await brandActions.delete.run(alice, { id: zara });
		// Then
		expect((await listOwnedItems(h.db, ALICE.id))[0]?.brand).toBeNull();
	});

	test("keeps two items of one piece when both lose their brand", async () => {
		// Given: Zara and COS, a Navy long button-up from each
		const { h, alice, zara, navy } = await withZaraAndNavy();
		const cos = await brandActions.add.run(alice, { name: "COS" });
		if (!cos.ok) throw new Error("COS was not added");
		await addOwnedItem(h.db, bucket(h), ALICE.id, {
			...NAVY_SHIRT,
			id: "11111111-1111-4111-8111-111111111111",
			colourId: navy,
			brandId: zara,
		});
		await addOwnedItem(h.db, bucket(h), ALICE.id, {
			...NAVY_SHIRT,
			id: "22222222-2222-4222-8222-222222222222",
			colourId: navy,
			brandId: cos.value.id,
		});
		// When
		await brandActions.delete.run(alice, { id: zara });
		await brandActions.delete.run(alice, { id: cos.value.id });
		// Then
		expect(
			(await listOwnedItems(h.db, ALICE.id)).map((i) => ({
				typeId: i.typeId,
				brand: i.brand,
			})),
		).toEqual([
			{ typeId: "shirt_l", brand: null },
			{ typeId: "shirt_l", brand: null },
		]);
	});

	test("clears the brand of its shop links when the brand goes", async () => {
		// Given: Zara, a wool Navy wish, a shop link with Zara
		const { h, alice, zara, navy } = await withZaraAndNavy();
		const wishId = "11111111-1111-4111-8111-111111111111";
		await addWish(h.db, ALICE.id, {
			id: wishId,
			typeId: "wool",
			colourId: navy,
		});
		await addShopLink(h.db, bucket(h), ALICE.id, wishId, {
			id: "33333333-3333-4333-8333-333333333333",
			url: "https://www.zara.com/vn/en/wool-blend-jacket.html",
			brandId: zara,
			name: "Wool blend jacket",
			price: 2990000,
		});
		// When
		await brandActions.delete.run(alice, { id: zara });
		// Then
		const wishes = await listWishes(h.db, ALICE.id);
		expect(wishes[0]?.shopLinks[0]?.brand).toBeNull();
	});
});
