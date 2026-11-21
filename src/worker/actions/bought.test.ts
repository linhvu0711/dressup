import { describe, expect, test } from "bun:test";
import type { OwnedItemId } from "@/closet/owned-item";
import type { BrandId } from "@/labels/brand";
import type { PictureId } from "@/pictures/picture";
import type { ShopLinkId } from "@/wishlist/wish";
import { listColours } from "../colour-store";
import type { Result } from "../result";
import {
	ALICE,
	BOB,
	type Harness,
	type Ids,
	JPEG,
	scopeOf,
	withAccount,
} from "../test/harness";
import type { ActionScope, Refusal } from "./action";
import { boughtActions } from "./bought";
import { brandActions } from "./brands";
import { ownedItemActions } from "./owned-items";
import { pictureActions } from "./pictures";
import { shopLinkActions, wishActions } from "./wishes";

const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "22222222-2222-4222-8222-222222222222" as OwnedItemId;
const LINK_ID = "33333333-3333-4333-8333-333333333333" as ShopLinkId;
const OTHER_LINK_ID = "44444444-4444-4444-8444-444444444444" as ShopLinkId;
const ZARA_URL = "https://www.zara.com/vn/en/wool-blend-jacket.html";

// A setup step that must not be refused.
function held<T>(result: Result<T, Refusal>): T {
	if (!result.ok) throw new Error(`Refused: ${result.error.text}`);
	return result.value;
}

const uploads = async (alice: ActionScope, n: number) => {
	const ids: PictureId[] = [];
	for (let i = 0; i < n; i++)
		ids.push(
			held(await pictureActions.add.run(alice, { bytes: JPEG.slice().buffer }))
				.id,
		);
	return ids;
};

const closet = async (alice: ActionScope) =>
	held(await ownedItemActions.list.run(alice, {}));

const wishlist = async (alice: ActionScope) =>
	held(await wishActions.list.run(alice, {}));

const linkPictures = async (alice: ActionScope) =>
	(await wishlist(alice))[0]?.shopLinks.map((l) => l.pictureIds);

const buy = (alice: ActionScope, linkId: string) =>
	boughtActions.buy.run(alice, { id: linkId });

type Account = { h: Harness; alice: ActionScope; ids: Ids; cos: BrandId };

async function account(): Promise<Account> {
	const { h } = await withAccount();
	const alice = scopeOf(h);
	const ids = Object.fromEntries(
		(await listColours(h.db, ALICE.id)).map((c) => [c.name, c.id]),
	);
	const cos = held(await brandActions.add.run(alice, { name: "COS" })).id;
	return { h, alice, ids, cos };
}

// The wish FIRST_ID for a Navy wool jacket: LINK_ID is a COS link with
// `linkPictures` uploads, OTHER_LINK_ID a Zara link with no brand and the
// picture c.
async function withLinks({ alice, ids, cos }: Account, linkPictures = 2) {
	const link = await uploads(alice, linkPictures);
	const [c] = await uploads(alice, 1);
	await wishActions.add.run(alice, {
		id: FIRST_ID,
		typeId: "wool",
		colourId: ids.Navy,
	});
	await shopLinkActions.add.run(alice, {
		wishId: FIRST_ID,
		id: LINK_ID,
		url: "https://cos.com/jacket",
		brandId: cos,
		name: "Wool jacket",
		price: 4290000,
		pictureIds: link,
	});
	await shopLinkActions.add.run(alice, {
		wishId: FIRST_ID,
		id: OTHER_LINK_ID,
		url: ZARA_URL,
		brandId: null,
		name: "Wool blend jacket",
		price: 2990000,
		pictureIds: [c],
	});
	return { link, c };
}

// The owned item ITEM_ID, a Navy wool jacket of COS, with `pictures` uploads.
async function withItem(
	{ alice, ids, cos }: Account,
	quantity: number,
	pictures: number,
) {
	const itemPictures = await uploads(alice, pictures);
	await ownedItemActions.add.run(alice, {
		id: ITEM_ID,
		typeId: "wool",
		colourId: ids.Navy,
		brandId: cos,
		quantity,
		pictureIds: itemPictures,
	});
	return itemPictures;
}

// Alice with the brand COS and the two links, LINK_ID holding a and b.
async function aliceWithLinks() {
	const owner = await account();
	const {
		link: [a, b],
		c,
	} = await withLinks(owner);
	return { ...owner, a, b, c };
}

// Alice with the COS item ITEM_ID holding d and e, uploaded before the links.
async function aliceWithItem(quantity = 1) {
	const owner = await account();
	const [d, e] = await withItem(owner, quantity, 2);
	const {
		link: [a, b],
		c,
	} = await withLinks(owner);
	return { ...owner, a, b, c, d, e };
}

const NOT_FOUND_ROW = {
	code: "not_found",
	status: 404,
	body: { error: "not_found" },
	text: "No shop link with this id.",
} satisfies Refusal;

const CONFLICT_ROW = {
	code: "conflict",
	status: 409,
	body: { error: "conflict", field: "id" },
	text: "dressup could not do this. Try again.",
} satisfies Refusal;

describe("marking a shop link bought", () => {
	test("answers not_found for a shop link of another account", async () => {
		// Given
		const { h, alice } = await aliceWithLinks();
		await h.addAccount(BOB);
		// When
		const bought = await buy(scopeOf(h, BOB), LINK_ID);
		// Then
		expect({
			bought,
			links: (await wishlist(alice))[0]?.shopLinks.map((l) => l.id),
		}).toEqual({
			bought: { ok: false, error: NOT_FOUND_ROW },
			links: [LINK_ID, OTHER_LINK_ID],
		});
	});

	test("adds 1 to the item of the same piece and brand", async () => {
		// Given
		const { h, alice, a, b, d, e } = await aliceWithItem();
		// When
		const bought = await buy(alice, LINK_ID);
		// Then
		expect({
			created: bought.ok && bought.value.created,
			item: bought.ok && {
				id: bought.value.ownedItem.id,
				quantity: bought.value.ownedItem.quantity,
			},
			pictureIds: bought.ok && bought.value.ownedItem.pictureIds,
			items: (await closet(alice)).length,
			keys: h.pictures.keys(),
		}).toEqual({
			created: false,
			item: { id: ITEM_ID, quantity: 2 },
			pictureIds: [d, e, a, b],
			items: 1,
			keys: [a, b, d, e].sort(),
		});
	});

	test("keeps 8 pictures on the item and deletes the rest", async () => {
		// Given
		const owner = await account();
		const item = await withItem(owner, 1, 6);
		const { link } = await withLinks(owner, 3);
		const { h, alice } = owner;
		// When
		const bought = await buy(alice, LINK_ID);
		// Then
		expect({
			created: bought.ok && bought.value.created,
			pictureIds: bought.ok && bought.value.ownedItem.pictureIds,
			keys: h.pictures.keys(),
		}).toEqual({
			created: false,
			pictureIds: [...item, ...link.slice(0, 2)],
			keys: [...item, ...link.slice(0, 2)].sort(),
		});
	});

	test("refuses Bought at 99 of one item", async () => {
		// Given
		const { h, alice, a, b, c, d, e } = await aliceWithItem(99);
		// When
		const bought = await buy(alice, LINK_ID);
		// Then
		expect({
			bought,
			items: (await closet(alice)).map((i) => ({
				quantity: i.quantity,
				pictureIds: i.pictureIds,
			})),
			links: (await wishlist(alice))[0]?.shopLinks.map((l) => l.id),
			keys: h.pictures.keys(),
		}).toEqual({
			bought: {
				ok: false,
				error: {
					code: "quantity_limit",
					status: 409,
					body: { error: "quantity_limit" },
					text: "You have 99 of this item. That is the limit.",
				},
			},
			items: [{ quantity: 99, pictureIds: [d, e] }],
			links: [LINK_ID, OTHER_LINK_ID],
			keys: [a, b, c, d, e].sort(),
		});
	});

	test("refuses Bought at 500 owned items", async () => {
		// Given
		const { h, alice, a, b, c } = await aliceWithLinks();
		await h.seedOwnedItems(ALICE.id, 500);
		// When
		const bought = await buy(alice, LINK_ID);
		// Then
		expect({
			bought,
			items: (await closet(alice)).length,
			links: await linkPictures(alice),
			keys: h.pictures.keys(),
		}).toEqual({
			bought: {
				ok: false,
				error: {
					code: "owned_item_limit",
					status: 409,
					body: { error: "owned_item_limit" },
					text: "You have 500 items. That is the limit. Delete one to add a new one.",
				},
			},
			items: 500,
			links: [[a, b], [c]],
			keys: [a, b, c].sort(),
		});
	});
});

describe("Bought while another write runs", () => {
	test("leaves everything as before when the wish delete fails", async () => {
		// Given
		const { h, alice, a, b, c } = await aliceWithLinks();
		h.addTrigger(
			"CREATE TRIGGER fail_wish_delete BEFORE DELETE ON wish BEGIN SELECT RAISE(ABORT, 'wish delete failed'); END",
		);
		// When
		const bought = buy(alice, LINK_ID);
		// Then
		await expect(bought).rejects.toThrow();
		expect({
			items: await closet(alice),
			links: await linkPictures(alice),
			keys: h.pictures.keys(),
			stored: await h.storedBytes(),
		}).toEqual({
			items: [],
			links: [[a, b], [c]],
			keys: [a, b, c].sort(),
			stored: 300,
		});
	});

	test("makes one item from two Boughts on one wish at once", async () => {
		// Given
		const { h, alice, cos, a, b } = await aliceWithLinks();
		const hold = h.holdBatches();
		// When
		const both = Promise.all([buy(alice, LINK_ID), buy(alice, OTHER_LINK_ID)]);
		await hold.queued(2);
		hold.release();
		const results = await both;
		// Then
		expect({
			oks: results.map((r) => r.ok).sort(),
			refusals: results.flatMap((r) => (r.ok ? [] : [r.error])),
			items: (await closet(alice)).map((i) => ({
				brand: i.brand?.id,
				quantity: i.quantity,
			})),
			wishes: await wishlist(alice),
			keys: h.pictures.keys(),
		}).toEqual({
			oks: [false, true],
			refusals: [NOT_FOUND_ROW],
			items: [{ brand: cos, quantity: 1 }],
			wishes: [],
			keys: [a, b].sort(),
		});
	});

	test("refuses Bought when the quantity changes during it", async () => {
		// Given
		const { h, alice, cos, a, b, c, d, e } = await aliceWithItem();
		const hold = h.holdBatches();
		// When
		const bought = buy(alice, LINK_ID);
		await hold.queued(1);
		await ownedItemActions.change.run(alice, {
			id: ITEM_ID,
			brandId: cos,
			quantity: 5,
		});
		hold.release();
		const result = await bought;
		// Then
		expect({
			result,
			items: (await closet(alice)).map((i) => ({
				quantity: i.quantity,
				pictureIds: i.pictureIds,
			})),
			links: await linkPictures(alice),
			keys: h.pictures.keys(),
		}).toEqual({
			result: { ok: false, error: CONFLICT_ROW },
			items: [{ quantity: 5, pictureIds: [d, e] }],
			links: [[a, b], [c]],
			keys: [a, b, c, d, e].sort(),
		});
	});

	test("refuses Bought when the same item is added during it", async () => {
		// Given
		const { h, alice, ids, cos, a, b, c } = await aliceWithLinks();
		const hold = h.holdBatches();
		// When
		const bought = buy(alice, LINK_ID);
		await hold.queued(1);
		await ownedItemActions.add.run(alice, {
			id: ITEM_ID,
			typeId: "wool",
			colourId: ids.Navy,
			brandId: cos,
			quantity: 1,
		});
		hold.release();
		const result = await bought;
		// Then
		expect({
			result,
			items: (await closet(alice)).map((i) => ({
				id: i.id,
				quantity: i.quantity,
				pictureIds: i.pictureIds,
			})),
			links: await linkPictures(alice),
		}).toEqual({
			result: { ok: false, error: CONFLICT_ROW },
			items: [{ id: ITEM_ID, quantity: 1, pictureIds: [] }],
			links: [[a, b], [c]],
		});
	});
});
