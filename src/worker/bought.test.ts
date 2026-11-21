import { describe, expect, test } from "bun:test";
import {
	ALICE,
	answer,
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

const buy = (h: Harness, headers: Headers, linkId: string) =>
	send(h, headers, "POST", `/api/shop-links/${linkId}/bought`);

const uploads = async (h: Harness, headers: Headers, n: number) => {
	const ids: string[] = [];
	for (let i = 0; i < n; i++) ids.push(await uploadPicture(h, headers));
	return ids;
};

const FIRST_ID = "11111111-1111-4111-8111-111111111111";
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

// Alice with the brand COS and the two links, LINK_ID holding a and b.
async function aliceWithLinks() {
	const owner = await account();
	const {
		link: [a = "", b = ""],
		c,
	} = await withLinks(owner);
	return { ...owner, a, b, c };
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

	test("answers 200 when Bought adds 1 to an item", async () => {
		// Given: alice owns the Navy wool COS jacket once, and wishes for it
		const owner = await account();
		const { h, headers, ids, cos } = owner;
		await send(h, headers, "POST", "/api/owned-items", {
			id: FIRST_ID,
			typeId: "wool",
			colourId: ids.Navy,
			brandId: cos,
			quantity: 1,
		});
		await withLinks(owner);
		// When
		const res = await buy(h, headers, LINK_ID);
		// Then
		const { ownedItem } = (await res.json()) as { ownedItem: Item };
		expect({ status: res.status, quantity: ownedItem.quantity }).toEqual({
			status: 200,
			quantity: 2,
		});
	});

	test("answers 401 to a signed-out Bought", async () => {
		// Given: alice has an account; no session headers
		const h = await makeHarness();
		await h.addAccount(ALICE);
		// When
		const res = await buy(h, new Headers(), LINK_ID);
		// Then
		expect(await answer(res)).toEqual({
			status: 401,
			body: { error: "unauthorized" },
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
});
