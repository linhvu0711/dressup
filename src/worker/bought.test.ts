import { describe, expect, test } from "bun:test";
import { ALICE, BOB, type Harness, makeHarness } from "./test/harness";

type Ids = Record<string, string>;

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

const send = (
	{ app, env }: Harness,
	headers: Headers,
	method: string,
	path: string,
	body?: unknown,
) =>
	app.request(
		path,
		{
			method,
			headers: {
				...Object.fromEntries(headers),
				...(body === undefined ? {} : { "content-type": "application/json" }),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		},
		env,
	);

const answer = async (res: Response) => ({
	status: res.status,
	body: await res.json(),
});

const colourIds = async (h: Harness, headers: Headers): Promise<Ids> => {
	const { colours } = (await (
		await send(h, headers, "GET", "/api/colours")
	).json()) as { colours: { id: string; name: string }[] };
	return Object.fromEntries(colours.map((c) => [c.name, c.id]));
};

const addBrand = async (h: Harness, headers: Headers, name: string) =>
	(
		(await (
			await send(h, headers, "POST", "/api/brands", { name })
		).json()) as { brand: { id: string } }
	).brand.id;

// A small JPEG uploaded as a draft of the account, by id.
async function uploaded(h: Harness, headers: Headers): Promise<string> {
	const body = new Uint8Array(100).fill(0x11);
	body.set([0xff, 0xd8, 0xff, 0xe0]);
	const res = await h.app.request(
		"/api/pictures",
		{
			method: "POST",
			headers: { ...Object.fromEntries(headers), "content-type": "image/jpeg" },
			body,
		},
		h.env,
	);
	return ((await res.json()) as { picture: { id: string } }).picture.id;
}

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

const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const LINK_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_LINK_ID = "44444444-4444-4444-8444-444444444444";
const ZARA_URL = "https://www.zara.com/vn/en/wool-blend-jacket.html";

// Alice with the brand COS and the wish FIRST_ID for a Navy wool jacket:
// LINK_ID is a COS link with the pictures a and b, OTHER_LINK_ID a Zara
// link with no brand and the picture c.
async function aliceWithLinks(h: Harness, headers: Headers) {
	const ids = await colourIds(h, headers);
	const cos = await addBrand(h, headers, "COS");
	const a = await uploaded(h, headers);
	const b = await uploaded(h, headers);
	const c = await uploaded(h, headers);
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
		pictureIds: [a, b],
	});
	await send(h, headers, "POST", `/api/wishes/${FIRST_ID}/shop-links`, {
		id: OTHER_LINK_ID,
		url: ZARA_URL,
		brandId: null,
		name: "Wool blend jacket",
		price: 2990000,
		pictureIds: [c],
	});
	return { ids, cos, a, b, c };
}

async function alice() {
	const h = await makeHarness();
	const headers = await h.addAccount(ALICE);
	return { h, headers, ...(await aliceWithLinks(h, headers)) };
}

describe("POST /api/shop-links/:id/bought", () => {
	test("moves a shop link to the closet with its brand and pictures", async () => {
		// Given
		const { h, headers, ids, cos, a, b } = await alice();
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
		const { h, headers } = await alice();
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
		const { h, headers } = await alice();
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
});
