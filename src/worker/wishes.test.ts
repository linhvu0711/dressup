import { describe, expect, test } from "bun:test";
import {
	ALICE,
	alice,
	answer,
	BOB,
	type Harness,
	type Ids,
	makeHarness,
	postBrand,
	send,
} from "./test/harness";

type Link = {
	id: string;
	url: string;
	brand: { id: string; name: string } | null;
	name: string;
	price: number | null;
	pictureIds: string[];
};

type Listed = {
	id: string;
	typeId: string;
	colour: { id: string; name: string; hex: string };
	shopLinks: Link[];
};

const post = (h: Harness, headers: Headers, body: unknown) =>
	send(h, headers, "POST", "/api/wishes", body);

const list = async (h: Harness, headers: Headers) =>
	(
		(await (await send(h, headers, "GET", "/api/wishes")).json()) as {
			wishes: Listed[];
		}
	).wishes;

const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";
const LINK_ID = "33333333-3333-4333-8333-333333333333";
const ZARA_URL = "https://www.zara.com/vn/en/wool-blend-jacket.html";

// The Zara link to the Navy wool jacket.
const zaraLink = (brandId: string | null) => ({
	id: LINK_ID,
	url: ZARA_URL,
	brandId,
	name: "Wool blend jacket",
	price: 2990000,
});

const postLink = (
	h: Harness,
	headers: Headers,
	wishId: string,
	body: unknown,
) => send(h, headers, "POST", `/api/wishes/${wishId}/shop-links`, body);

const linksOf = async (h: Harness, headers: Headers) =>
	(await list(h, headers))[0]?.shopLinks;

// A Navy wool jacket.
const jacket = (ids: Ids) => ({
	id: FIRST_ID,
	typeId: "wool",
	colourId: ids.Navy,
});

describe("POST /api/wishes", () => {
	test("adds a wish and lists it", async () => {
		// Given: alice signed in, her colour ids by name
		const { h, headers, ids } = await alice();
		// When
		const added = await post(h, headers, jacket(ids));
		const listed = await list(h, headers);
		// Then
		expect({ status: added.status, listed }).toEqual({
			status: 201,
			listed: [
				{
					id: FIRST_ID,
					typeId: "wool",
					colour: { id: ids.Navy, name: "Navy", hex: "#1F3A5F" },
					shopLinks: [],
				},
			],
		});
	});

	test("refuses a second wish for one piece", async () => {
		// Given: alice with the wish FIRST_ID for a Navy wool jacket
		const { h, headers, ids } = await alice();
		await post(h, headers, jacket(ids));
		// When
		const res = await post(h, headers, { ...jacket(ids), id: SECOND_ID });
		// Then
		expect({
			...(await answer(res)),
			count: (await list(h, headers)).length,
		}).toEqual({
			status: 409,
			body: { error: "duplicate", id: FIRST_ID },
			count: 1,
		});
	});
});

describe("DELETE /api/wishes/:id", () => {
	test("deletes a wish", async () => {
		// Given: alice with the wish FIRST_ID
		const { h, headers, ids } = await alice();
		await post(h, headers, jacket(ids));
		// When
		const first = await send(h, headers, "DELETE", `/api/wishes/${FIRST_ID}`);
		const second = await send(h, headers, "DELETE", `/api/wishes/${FIRST_ID}`);
		// Then
		expect({
			first: first.status,
			second: await answer(second),
			listed: await list(h, headers),
		}).toEqual({
			first: 204,
			second: { status: 404, body: { error: "not_found" } },
			listed: [],
		});
	});
});

describe("POST /api/wishes/:id/shop-links", () => {
	// Alice with the wish FIRST_ID for a Navy wool jacket and the brand Zara.
	async function aliceWithWish() {
		const { h, headers, ids } = await alice();
		await post(h, headers, jacket(ids));
		const zara = await postBrand(h, headers, "Zara");
		return { h, headers, ids, zara };
	}

	test("adds a shop link to a wish and lists it", async () => {
		// Given
		const { h, headers, zara } = await aliceWithWish();
		// When
		const res = await postLink(h, headers, FIRST_ID, zaraLink(zara));
		// Then
		expect({ status: res.status, links: await linksOf(h, headers) }).toEqual({
			status: 201,
			links: [
				{
					id: LINK_ID,
					url: ZARA_URL,
					brand: { id: zara, name: "Zara" },
					name: "Wool blend jacket",
					price: 2990000,
					pictureIds: [],
				},
			],
		});
	});

	test("adds a shop link with no brand when brandId is left out", async () => {
		// Given: alice's jacket wish; the Zara link with no brandId key
		const { h, headers, ids } = await alice();
		await post(h, headers, jacket(ids));
		const { brandId: _, ...noBrand } = zaraLink(null);
		// When
		const res = await postLink(h, headers, FIRST_ID, noBrand);
		// Then
		const { status, body } = await answer(res);
		const { wish } = body as { wish: Listed };
		expect({ status, brand: wish.shopLinks[0]?.brand }).toEqual({
			status: 201,
			brand: null,
		});
	});

	test("adds a shop link with no price when price is left out", async () => {
		// Given: alice's jacket wish; the Zara link with no price key
		const { h, headers, ids } = await alice();
		await post(h, headers, jacket(ids));
		const { price: _, ...noPrice } = zaraLink(null);
		// When
		const res = await postLink(h, headers, FIRST_ID, noPrice);
		// Then
		const { status, body } = await answer(res);
		const { wish } = body as { wish: Listed };
		expect({ status, price: wish.shopLinks[0]?.price }).toEqual({
			status: 201,
			price: null,
		});
	});

	test("refuses a brand of another account", async () => {
		// Given: the Zara link with bob's brand
		const { h, headers } = await aliceWithWish();
		const bob = await h.addAccount(BOB);
		const bobZara = await postBrand(h, bob, "Zara");
		// When
		const res = await postLink(h, headers, FIRST_ID, zaraLink(bobZara));
		// Then
		expect(await answer(res)).toEqual({
			status: 400,
			body: { error: "invalid", field: "brandId" },
		});
	});
});

describe("PUT /api/shop-links/:id", () => {
	test("changes a shop link", async () => {
		// Given: the Zara link on alice's wish
		const { h, headers, ids } = await alice();
		await post(h, headers, jacket(ids));
		const zara = await postBrand(h, headers, "Zara");
		await postLink(h, headers, FIRST_ID, zaraLink(zara));
		const change = {
			url: ZARA_URL,
			brandId: null,
			name: "Wool blend jacket",
			price: 2490000,
		};
		// When
		const first = await send(
			h,
			headers,
			"PUT",
			`/api/shop-links/${LINK_ID}`,
			change,
		);
		const second = await send(
			h,
			headers,
			"PUT",
			`/api/shop-links/${LINK_ID}`,
			change,
		);
		// Then
		const links = (await linksOf(h, headers)) ?? [];
		expect({
			statuses: [first.status, second.status],
			links: links.map((link) => ({ brand: link.brand, price: link.price })),
		}).toEqual({
			statuses: [200, 200],
			links: [{ brand: null, price: 2490000 }],
		});
	});

	test("clears a shop link's brand when a change leaves brandId out", async () => {
		// Given: the Zara link with brand Zara on alice's wish
		const { h, headers, ids } = await alice();
		await post(h, headers, jacket(ids));
		const zara = await postBrand(h, headers, "Zara");
		await postLink(h, headers, FIRST_ID, zaraLink(zara));
		// When
		const res = await send(h, headers, "PUT", `/api/shop-links/${LINK_ID}`, {
			url: ZARA_URL,
			name: "Wool blend jacket",
			price: 2990000,
		});
		// Then
		const { status, body } = await answer(res);
		const { wish } = body as { wish: Listed };
		expect({ status, brand: wish.shopLinks[0]?.brand }).toEqual({
			status: 200,
			brand: null,
		});
	});

	test("refuses a shop link change with an empty name", async () => {
		// Given: the Zara link on alice's wish
		const { h, headers, ids } = await alice();
		await post(h, headers, jacket(ids));
		await postLink(h, headers, FIRST_ID, zaraLink(null));
		// When
		const res = await send(h, headers, "PUT", `/api/shop-links/${LINK_ID}`, {
			url: ZARA_URL,
			brandId: null,
			name: "",
			price: 2990000,
		});
		// Then
		expect(await answer(res)).toEqual({
			status: 400,
			body: { error: "invalid", field: "name" },
		});
	});
});

describe("DELETE /api/shop-links/:id", () => {
	test("deletes a shop link", async () => {
		// Given: the Zara link on alice's wish
		const { h, headers, ids } = await alice();
		await post(h, headers, jacket(ids));
		await postLink(h, headers, FIRST_ID, zaraLink(null));
		// When
		const first = await send(
			h,
			headers,
			"DELETE",
			`/api/shop-links/${LINK_ID}`,
		);
		const second = await send(
			h,
			headers,
			"DELETE",
			`/api/shop-links/${LINK_ID}`,
		);
		// Then
		expect({
			first: first.status,
			second: await answer(second),
			links: await linksOf(h, headers),
		}).toEqual({
			first: 204,
			second: { status: 404, body: { error: "not_found" } },
			links: [],
		});
	});

	test("answers 401 to signed-out wish and shop link writes", async () => {
		// Given: alice has an account; no session headers
		const h = await makeHarness();
		await h.addAccount(ALICE);
		const none = new Headers();
		// When
		const answers = [
			await post(h, none, { id: FIRST_ID, typeId: "wool", colourId: "x" }),
			await send(h, none, "DELETE", `/api/wishes/${FIRST_ID}`),
			await postLink(h, none, FIRST_ID, zaraLink(null)),
			await send(h, none, "PUT", `/api/shop-links/${LINK_ID}`, zaraLink(null)),
			await send(h, none, "DELETE", `/api/shop-links/${LINK_ID}`),
		];
		// Then
		expect(await Promise.all(answers.map(answer))).toEqual(
			Array(5).fill({ status: 401, body: { error: "unauthorized" } }),
		);
	});
});
