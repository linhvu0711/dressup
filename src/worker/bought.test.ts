import { describe, expect, test } from "bun:test";
import {
	ALICE,
	answer,
	BOB,
	colourIds,
	type Harness,
	type Ids,
	makeHarness,
	postBrand,
	send,
	uploadPicture,
} from "./test/harness";

type Item = {
	id: string;
	typeId: string;
	colour: { id: string; name: string; hex: string };
	brand: { id: string; name: string } | null;
	quantity: number;
	pictureIds: string[];
};

type Wish = {
	id: string;
	shopLinks: { id: string; pictureIds: string[] }[];
};

const closet = async (h: Harness, headers: Headers) =>
	(
		(await (await send(h, headers, "GET", "/api/owned-items")).json()) as {
			ownedItems: Item[];
		}
	).ownedItems;

const wishlist = async (h: Harness, headers: Headers) =>
	(
		(await (await send(h, headers, "GET", "/api/wishes")).json()) as {
			wishes: Wish[];
		}
	).wishes;

const linkPictures = async (h: Harness, headers: Headers) =>
	(await wishlist(h, headers))[0]?.shopLinks.map((l) => l.pictureIds);

const buy = (h: Harness, headers: Headers, linkId: string) =>
	send(h, headers, "POST", `/api/shop-links/${linkId}/bought`);

const uploads = async (h: Harness, headers: Headers, n: number) => {
	const ids: string[] = [];
	for (let i = 0; i < n; i++) ids.push(await uploadPicture(h, headers));
	return ids;
};

const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "22222222-2222-4222-8222-222222222222";
const LINK_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_LINK_ID = "44444444-4444-4444-8444-444444444444";
const ZARA_URL = "https://www.zara.com/vn/en/wool-blend-jacket.html";

type Account = { h: Harness; headers: Headers; ids: Ids; cos: string };

async function account(): Promise<Account> {
	const h = await makeHarness();
	const headers = await h.addAccount(ALICE);
	const ids = await colourIds(h, headers);
	return { h, headers, ids, cos: await postBrand(h, headers, "COS") };
}

// The wish FIRST_ID for a Navy wool jacket: LINK_ID is a COS link with
// `linkPictures` uploads, OTHER_LINK_ID a Zara link with no brand and the
// picture c.
async function withLinks({ h, headers, ids, cos }: Account, linkPictures = 2) {
	const link = await uploads(h, headers, linkPictures);
	const c = await uploadPicture(h, headers);
	await send(h, headers, "POST", "/api/wishes", {
		id: FIRST_ID,
		typeId: "wool",
		colourId: ids.Navy,
	});
	await send(h, headers, "POST", `/api/wishes/${FIRST_ID}/shop-links`, {
		id: LINK_ID,
		url: "https://cos.com/jacket",
		brandId: cos,
		name: "Wool jacket",
		price: 4290000,
		pictureIds: link,
	});
	await send(h, headers, "POST", `/api/wishes/${FIRST_ID}/shop-links`, {
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
	{ h, headers, ids, cos }: Account,
	quantity: number,
	pictures: number,
) {
	const itemPictures = await uploads(h, headers, pictures);
	await send(h, headers, "POST", "/api/owned-items", {
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
		link: [a = "", b = ""],
		c,
	} = await withLinks(owner);
	return { ...owner, a, b, c };
}

// Alice with the COS item ITEM_ID holding d and e, uploaded before the links.
async function aliceWithItem(quantity = 1) {
	const owner = await account();
	const [d = "", e = ""] = await withItem(owner, quantity, 2);
	const {
		link: [a = "", b = ""],
		c,
	} = await withLinks(owner);
	return { ...owner, a, b, c, d, e };
}

describe("POST /api/shop-links/:id/bought", () => {
	test("moves a shop link to the closet with its brand and pictures", async () => {
		// Given
		const { h, headers, ids, cos, a, b } = await aliceWithLinks();
		// When
		const res = await answer(await buy(h, headers, LINK_ID));
		const items = await closet(h, headers);
		// Then
		expect({
			res,
			items: items.length,
			wishes: await wishlist(h, headers),
			keys: h.pictures.keys(),
			links: h.accountRows("alice-id").shop_link ?? 0,
		}).toEqual({
			res: {
				status: 201,
				body: {
					ownedItem: {
						id: items[0]?.id,
						typeId: "wool",
						colour: { id: ids.Navy, name: "Navy", hex: "#1F3A5F" },
						brand: { id: cos, name: "COS" },
						quantity: 1,
						pictureIds: [a, b],
					},
				},
			},
			items: 1,
			wishes: [],
			keys: [a, b].sort(),
			links: 0,
		});
	});

	test("answers not_found to a second Bought of one link", async () => {
		// Given
		const { h, headers } = await aliceWithLinks();
		await buy(h, headers, LINK_ID);
		// When
		const res = await answer(await buy(h, headers, LINK_ID));
		// Then
		expect({
			res,
			quantities: (await closet(h, headers)).map((i) => i.quantity),
		}).toEqual({
			res: { status: 404, body: { error: "not_found" } },
			quantities: [1],
		});
	});

	test("answers not_found for a shop link of another account", async () => {
		// Given
		const { h, headers } = await aliceWithLinks();
		const bob = await h.addAccount(BOB);
		// When
		const res = await answer(await buy(h, bob, LINK_ID));
		// Then
		expect({
			res,
			links: (await wishlist(h, headers))[0]?.shopLinks.map((l) => l.id),
		}).toEqual({
			res: { status: 404, body: { error: "not_found" } },
			links: [LINK_ID, OTHER_LINK_ID],
		});
	});

	test("adds 1 to the item of the same piece and brand", async () => {
		// Given
		const { h, headers, a, b, d, e } = await aliceWithItem();
		// When
		const res = await buy(h, headers, LINK_ID);
		const { ownedItem } = (await res.json()) as { ownedItem: Item };
		// Then
		expect({
			status: res.status,
			item: { id: ownedItem.id, quantity: ownedItem.quantity },
			pictureIds: ownedItem.pictureIds,
			items: (await closet(h, headers)).length,
			keys: h.pictures.keys(),
		}).toEqual({
			status: 200,
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
		const { h, headers } = owner;
		// When
		const res = await buy(h, headers, LINK_ID);
		const { ownedItem } = (await res.json()) as { ownedItem: Item };
		// Then
		expect({
			status: res.status,
			pictureIds: ownedItem.pictureIds,
			keys: h.pictures.keys(),
		}).toEqual({
			status: 200,
			pictureIds: [...item, ...link.slice(0, 2)],
			keys: [...item, ...link.slice(0, 2)].sort(),
		});
	});

	test("refuses Bought at 99 of one item", async () => {
		// Given
		const { h, headers, a, b, c, d, e } = await aliceWithItem(99);
		// When
		const res = await answer(await buy(h, headers, LINK_ID));
		// Then
		expect({
			res,
			items: (await closet(h, headers)).map((i) => ({
				quantity: i.quantity,
				pictureIds: i.pictureIds,
			})),
			links: (await wishlist(h, headers))[0]?.shopLinks.map((l) => l.id),
			keys: h.pictures.keys(),
		}).toEqual({
			res: { status: 409, body: { error: "quantity_limit" } },
			items: [{ quantity: 99, pictureIds: [d, e] }],
			links: [LINK_ID, OTHER_LINK_ID],
			keys: [a, b, c, d, e].sort(),
		});
	});

	test("refuses Bought at 500 owned items", async () => {
		// Given
		const { h, headers, a, b, c } = await aliceWithLinks();
		await h.seedOwnedItems("alice-id", 500);
		// When
		const res = await answer(await buy(h, headers, LINK_ID));
		// Then
		expect({
			res,
			items: (await closet(h, headers)).length,
			links: await linkPictures(h, headers),
			keys: h.pictures.keys(),
		}).toEqual({
			res: { status: 409, body: { error: "owned_item_limit" } },
			items: 500,
			links: [[a, b], [c]],
			keys: [a, b, c].sort(),
		});
	});
});

describe("Bought while another write runs", () => {
	test("leaves everything as before when the wish delete fails", async () => {
		// Given
		const { h, headers, a, b, c } = await aliceWithLinks();
		h.addTrigger(
			"CREATE TRIGGER fail_wish_delete BEFORE DELETE ON wish BEGIN SELECT RAISE(ABORT, 'wish delete failed'); END",
		);
		// When
		const res = await buy(h, headers, LINK_ID);
		// Then
		expect({
			status: res.status,
			items: await closet(h, headers),
			links: await linkPictures(h, headers),
			keys: h.pictures.keys(),
			stored: await h.storedBytes(),
		}).toEqual({
			status: 500,
			items: [],
			links: [[a, b], [c]],
			keys: [a, b, c].sort(),
			stored: 300,
		});
	});

	test("makes one item from two Boughts on one wish at once", async () => {
		// Given
		const { h, headers, cos, a, b } = await aliceWithLinks();
		const hold = h.holdBatches();
		// When
		const both = Promise.all([
			buy(h, headers, LINK_ID).then(answer),
			buy(h, headers, OTHER_LINK_ID).then(answer),
		]);
		await hold.queued(2);
		hold.release();
		const results = await both;
		// Then
		expect({
			statuses: results.map((r) => r.status).sort(),
			refusals: results.flatMap((r) => (r.status === 201 ? [] : [r.body])),
			items: (await closet(h, headers)).map((i) => ({
				brand: i.brand?.id,
				quantity: i.quantity,
			})),
			wishes: await wishlist(h, headers),
			keys: h.pictures.keys(),
		}).toEqual({
			statuses: [201, 404],
			refusals: [{ error: "not_found" }],
			items: [{ brand: cos, quantity: 1 }],
			wishes: [],
			keys: [a, b].sort(),
		});
	});

	test("refuses Bought when the quantity changes during it", async () => {
		// Given
		const { h, headers, cos, a, b, c, d, e } = await aliceWithItem();
		const hold = h.holdBatches();
		// When
		const bought = buy(h, headers, LINK_ID).then(answer);
		await hold.queued(1);
		await send(h, headers, "PUT", `/api/owned-items/${ITEM_ID}`, {
			brandId: cos,
			quantity: 5,
		});
		hold.release();
		const result = await bought;
		// Then
		expect({
			result,
			items: (await closet(h, headers)).map((i) => ({
				quantity: i.quantity,
				pictureIds: i.pictureIds,
			})),
			links: await linkPictures(h, headers),
			keys: h.pictures.keys(),
		}).toEqual({
			result: { status: 409, body: { error: "conflict", field: "id" } },
			items: [{ quantity: 5, pictureIds: [d, e] }],
			links: [[a, b], [c]],
			keys: [a, b, c, d, e].sort(),
		});
	});

	test("refuses Bought when the same item is added during it", async () => {
		// Given
		const { h, headers, ids, cos, a, b, c } = await aliceWithLinks();
		const hold = h.holdBatches();
		// When
		const bought = buy(h, headers, LINK_ID).then(answer);
		await hold.queued(1);
		await send(h, headers, "POST", "/api/owned-items", {
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
			items: (await closet(h, headers)).map((i) => ({
				id: i.id,
				quantity: i.quantity,
				pictureIds: i.pictureIds,
			})),
			links: await linkPictures(h, headers),
		}).toEqual({
			result: { status: 409, body: { error: "conflict", field: "id" } },
			items: [{ id: ITEM_ID, quantity: 1, pictureIds: [] }],
			links: [[a, b], [c]],
		});
	});
});
