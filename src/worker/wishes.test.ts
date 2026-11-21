import { describe, expect, test } from "bun:test";
import {
	ALICE,
	alice,
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
import { addShopLink, addWish } from "./wish-store";

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
const OTHER_LINK_ID = "44444444-4444-4444-8444-444444444444";
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

const uploads = (h: Harness, headers: Headers, n: number) =>
	Array.from({ length: n }).reduce<Promise<string[]>>(
		async (ids) => [...(await ids), await uploadPicture(h, headers)],
		Promise.resolve([]),
	);

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

	test("lists wishes newest first", async () => {
		// Given: alice with a wish for a White short tee, then a Navy wool jacket
		const { h, headers, ids } = await alice();
		await post(h, headers, {
			id: SECOND_ID,
			typeId: "tee_s",
			colourId: ids.White,
		});
		await post(h, headers, jacket(ids));
		// When
		const listed = await list(h, headers);
		// Then
		expect(listed.map((wish) => wish.typeId)).toEqual(["wool", "tee_s"]);
	});

	test("gives back the same wish when an add is sent twice", async () => {
		// Given: alice; the add of the Navy wool jacket sent once
		const { h, headers, ids } = await alice();
		await post(h, headers, jacket(ids));
		// When
		const again = await post(h, headers, jacket(ids));
		// Then
		expect({
			status: again.status,
			count: (await list(h, headers)).length,
		}).toEqual({ status: 200, count: 1 });
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

	test("adds a wish for a piece the closet holds", async () => {
		// Given: alice with an owned Navy wool jacket, no brand, quantity 1
		const { h, headers, ids } = await alice();
		await send(h, headers, "POST", "/api/owned-items", {
			id: SECOND_ID,
			typeId: "wool",
			colourId: ids.Navy,
			brandId: null,
			quantity: 1,
		});
		// When
		const res = await post(h, headers, jacket(ids));
		// Then
		const owned = (await (
			await send(h, headers, "GET", "/api/owned-items")
		).json()) as { ownedItems: unknown[] };
		expect({ status: res.status, owned: owned.ownedItems.length }).toEqual({
			status: 201,
			owned: 1,
		});
	});

	test("refuses wish number 201", async () => {
		// Given: alice with 200 wishes
		const { h, headers, ids } = await alice();
		await h.seedWishes("alice-id", 200);
		// When: a Mustard training pant, a piece the seed does not hold
		const res = await post(h, headers, {
			id: FIRST_ID,
			typeId: "train_p",
			colourId: ids.Mustard,
		});
		// Then
		expect({
			...(await answer(res)),
			count: (await list(h, headers)).length,
		}).toEqual({ status: 409, body: { error: "wish_limit" }, count: 200 });
	});

	test("refuses a type that is not a type", async () => {
		// Given: the add of the Navy wool jacket with the type "cape"
		const { h, headers, ids } = await alice();
		// When
		const res = await post(h, headers, { ...jacket(ids), typeId: "cape" });
		// Then
		expect(await answer(res)).toEqual({
			status: 400,
			body: { error: "invalid", field: "typeId" },
		});
	});

	test("refuses a colour of another account", async () => {
		// Given: the add of the Navy wool jacket with bob's Navy
		const { h, headers } = await alice();
		const bob = await h.addAccount(BOB);
		const bobIds = await colourIds(h, bob);
		// When
		const res = await post(h, headers, jacket(bobIds));
		// Then
		expect(await answer(res)).toEqual({
			status: 400,
			body: { error: "invalid", field: "colourId" },
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

	test("answers not_found for a wish of another account", async () => {
		// Given: bob with the wish FIRST_ID
		const h = await makeHarness();
		const headers = await h.addAccount(ALICE);
		const bob = await h.addAccount(BOB);
		await post(h, bob, jacket(await colourIds(h, bob)));
		// When
		const res = await send(h, headers, "DELETE", `/api/wishes/${FIRST_ID}`);
		// Then
		expect({
			...(await answer(res)),
			bob: (await list(h, bob)).length,
		}).toEqual({ status: 404, body: { error: "not_found" }, bob: 1 });
	});
});

describe("wish adds at once", () => {
	test("refuses one of two adds that overlap at 199 wishes", async () => {
		// Given: alice with 199 wishes; two adds of pieces the seed does not hold
		const { h, headers, ids } = await alice();
		await h.seedWishes("alice-id", 199);
		// When
		const results = await Promise.all([
			addWish(h.db, "alice-id", {
				id: FIRST_ID,
				typeId: "train_p",
				colourId: ids.Mustard,
			}),
			addWish(h.db, "alice-id", {
				id: SECOND_ID,
				typeId: "train_sh",
				colourId: ids.Mustard,
			}),
		]);
		// Then
		expect({
			count: (await list(h, headers)).length,
			oks: results.map((r) => r.ok).sort(),
			refused: results.flatMap((r) => (r.ok ? [] : [r.error as unknown])),
		}).toEqual({
			count: 200,
			oks: [false, true],
			refused: [{ code: "wish_limit" }],
		});
	});

	test("refuses the second of two adds of one piece that overlap", async () => {
		// Given: alice; two adds of a Navy wool jacket
		const { h, headers, ids } = await alice();
		// When
		const results = await Promise.all([
			addWish(h.db, "alice-id", jacket(ids)),
			addWish(h.db, "alice-id", { ...jacket(ids), id: SECOND_ID }),
		]);
		// Then
		const listed = await list(h, headers);
		expect({
			count: listed.length,
			oks: results.map((r) => r.ok).sort(),
			refused: results.flatMap((r) => (r.ok ? [] : [r.error as unknown])),
		}).toEqual({
			count: 1,
			oks: [false, true],
			refused: [{ code: "duplicate", id: listed[0]?.id }],
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

	test("adds a shop link with no brand and no price", async () => {
		// Given
		const { h, headers } = await aliceWithWish();
		// When
		const res = await postLink(h, headers, FIRST_ID, {
			...zaraLink(null),
			price: null,
		});
		// Then
		const [link] = (await linksOf(h, headers)) ?? [];
		expect({
			status: res.status,
			brand: link?.brand,
			price: link?.price,
		}).toEqual({ status: 201, brand: null, price: null });
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

	test("gives back the same shop link when an add is sent twice", async () => {
		// Given: the Zara link added once
		const { h, headers, zara } = await aliceWithWish();
		await postLink(h, headers, FIRST_ID, zaraLink(zara));
		// When
		const again = await postLink(h, headers, FIRST_ID, zaraLink(zara));
		// Then
		expect({
			status: again.status,
			count: (await linksOf(h, headers))?.length,
		}).toEqual({ status: 200, count: 1 });
	});

	const refusals: [string, Record<string, unknown>, string][] = [
		[
			"refuses an address that is not http or https",
			{ url: "javascript:alert(1)" },
			"url",
		],
		["refuses an address that does not parse", { url: "https://[" }, "url"],
		[
			"refuses an address of 2,001 characters",
			{ url: `https://a.example/${"a".repeat(1983)}` },
			"url",
		],
		["refuses an empty name", { name: "  " }, "name"],
		["refuses a name of 81 characters", { name: "a".repeat(81) }, "name"],
		["refuses a price of 1.000.000.000", { price: 1000000000 }, "price"],
		["refuses a price that is not whole", { price: 1.5 }, "price"],
	];
	for (const [name, change, field] of refusals)
		test(name, async () => {
			// Given: the Zara link with one field changed
			const { h, headers, zara } = await aliceWithWish();
			// When
			const res = await postLink(h, headers, FIRST_ID, {
				...zaraLink(zara),
				...change,
			});
			// Then
			expect(await answer(res)).toEqual({
				status: 400,
				body: { error: "invalid", field },
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

	test("answers not_found for a shop link on a wish of another account", async () => {
		// Given: bob's wish FIRST_ID
		const h = await makeHarness();
		const headers = await h.addAccount(ALICE);
		const bob = await h.addAccount(BOB);
		await post(h, bob, jacket(await colourIds(h, bob)));
		// When
		const res = await postLink(h, headers, FIRST_ID, zaraLink(null));
		// Then
		expect(await answer(res)).toEqual({
			status: 404,
			body: { error: "not_found" },
		});
	});

	test("refuses shop link number 11", async () => {
		// Given: alice's wish with 10 links
		const { h, headers, zara } = await aliceWithWish();
		await h.seedShopLinks("alice-id", FIRST_ID, 10);
		// When
		const res = await postLink(h, headers, FIRST_ID, zaraLink(zara));
		// Then
		expect({
			...(await answer(res)),
			count: (await linksOf(h, headers))?.length,
		}).toEqual({ status: 409, body: { error: "shop_link_limit" }, count: 10 });
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

	test("deletes a wish with its shop links", async () => {
		// Given: alice's wish with 2 links
		const { h, headers, ids } = await alice();
		await post(h, headers, jacket(ids));
		await h.seedShopLinks("alice-id", FIRST_ID, 2);
		// When
		const res = await send(h, headers, "DELETE", `/api/wishes/${FIRST_ID}`);
		// Then
		expect({
			status: res.status,
			links: h.accountRows("alice-id").shop_link,
		}).toEqual({ status: 204, links: 0 });
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

describe("shop link adds at once", () => {
	test("refuses one of two shop link adds that overlap at 9 links", async () => {
		// Given: alice's wish with 9 links; two adds of other links
		const { h, headers, ids } = await alice();
		await post(h, headers, jacket(ids));
		await h.seedShopLinks("alice-id", FIRST_ID, 9);
		// When
		const results = await Promise.all([
			addShopLink(h.db, h.env.PICTURES, "alice-id", FIRST_ID, zaraLink(null)),
			addShopLink(h.db, h.env.PICTURES, "alice-id", FIRST_ID, {
				...zaraLink(null),
				id: OTHER_LINK_ID,
			}),
		]);
		// Then
		expect({
			count: (await linksOf(h, headers))?.length,
			oks: results.map((r) => r.ok).sort(),
			refused: results.flatMap((r) => (r.ok ? [] : [r.error as unknown])),
		}).toEqual({
			count: 10,
			oks: [false, true],
			refused: [{ code: "shop_link_limit" }],
		});
	});

	test("adds no shop link to a wish removed during the add", async () => {
		// Given: alice's wish with no link; a trigger deletes the wish just
		// before the link is written, after the add's wish check passed
		const { h, headers, ids } = await alice();
		await post(h, headers, jacket(ids));
		h.addTrigger(
			"CREATE TRIGGER drop_wish BEFORE INSERT ON shop_link BEGIN DELETE FROM wish WHERE id = NEW.wish_id; END",
		);
		// When
		const res = await postLink(h, headers, FIRST_ID, zaraLink(null));
		// Then: the failed insert rolls back the trigger's delete with it, so
		// the wish stays and no link is left with no wish
		expect({
			status: res.status,
			links: h.accountRows("alice-id").shop_link ?? 0,
			wishes: (await list(h, headers)).length,
		}).toEqual({ status: 500, links: 0, wishes: 1 });
	});
});

describe("shop link pictures", () => {
	// Alice with the wish FIRST_ID for a Navy wool jacket.
	async function aliceWithWish() {
		const { h, headers, ids } = await alice();
		await post(h, headers, jacket(ids));
		return { h, headers };
	}

	const change = (pictureIds?: string[]) => ({
		url: ZARA_URL,
		brandId: null,
		name: "Wool blend jacket",
		price: 2990000,
		...(pictureIds === undefined ? {} : { pictureIds }),
	});

	test("adds a shop link with its pictures and lists them", async () => {
		// Given
		const { h, headers } = await aliceWithWish();
		const [a, b] = await uploads(h, headers, 2);
		// When
		const res = await postLink(h, headers, FIRST_ID, {
			...zaraLink(null),
			pictureIds: [a, b],
		});
		// Then
		expect({
			status: res.status,
			pictureIds: (await linksOf(h, headers))?.[0]?.pictureIds,
			keys: h.pictures.keys(),
		}).toEqual({ status: 201, pictureIds: [a, b], keys: [a, b].sort() });
	});

	test("refuses a shop link with 9 pictures", async () => {
		// Given
		const { h, headers } = await aliceWithWish();
		const nine = await uploads(h, headers, 9);
		// When
		const refused = await answer(
			await postLink(h, headers, FIRST_ID, {
				...zaraLink(null),
				pictureIds: nine,
			}),
		);
		// Then
		expect({ refused, links: await linksOf(h, headers) }).toEqual({
			refused: { status: 409, body: { error: "picture_limit" } },
			links: [],
		});
	});

	test("refuses a picture of another shop link in the list", async () => {
		// Given
		const { h, headers } = await aliceWithWish();
		const [a] = await uploads(h, headers, 1);
		await postLink(h, headers, FIRST_ID, {
			...zaraLink(null),
			pictureIds: [a],
		});
		// When
		const refused = await answer(
			await postLink(h, headers, FIRST_ID, {
				...zaraLink(null),
				id: OTHER_LINK_ID,
				pictureIds: [a],
			}),
		);
		// Then
		expect({
			refused,
			pictureIds: (await linksOf(h, headers))?.map((l) => l.pictureIds),
		}).toEqual({
			refused: { status: 400, body: { error: "invalid", field: "pictureIds" } },
			pictureIds: [[a]],
		});
	});

	test("ends with the same pictures when one change is sent twice", async () => {
		// Given
		const { h, headers } = await aliceWithWish();
		const [a, b, c] = await uploads(h, headers, 3);
		await postLink(h, headers, FIRST_ID, {
			...zaraLink(null),
			pictureIds: [a, b],
		});
		// When
		const first = await send(
			h,
			headers,
			"PUT",
			`/api/shop-links/${LINK_ID}`,
			change([b, c]),
		);
		const second = await send(
			h,
			headers,
			"PUT",
			`/api/shop-links/${LINK_ID}`,
			change([b, c]),
		);
		// Then
		expect({
			statuses: [first.status, second.status],
			pictureIds: (await linksOf(h, headers))?.[0]?.pictureIds,
			keys: h.pictures.keys(),
		}).toEqual({
			statuses: [200, 200],
			pictureIds: [b, c],
			keys: [b, c].sort(),
		});
	});

	test("keeps a shop link's pictures when a change leaves pictureIds out", async () => {
		// Given
		const { h, headers } = await aliceWithWish();
		const [a] = await uploads(h, headers, 1);
		await postLink(h, headers, FIRST_ID, {
			...zaraLink(null),
			pictureIds: [a],
		});
		// When
		const res = await send(h, headers, "PUT", `/api/shop-links/${LINK_ID}`, {
			...change(),
			price: 2490000,
		});
		// Then
		const [link] = (await linksOf(h, headers)) ?? [];
		expect({
			status: res.status,
			price: link?.price,
			pictureIds: link?.pictureIds,
		}).toEqual({ status: 200, price: 2490000, pictureIds: [a] });
	});

	// LINK_ID holds a and b, OTHER_LINK_ID holds c.
	async function twoLinksWithPictures() {
		const { h, headers } = await aliceWithWish();
		const [a, b, c] = await uploads(h, headers, 3);
		await postLink(h, headers, FIRST_ID, {
			...zaraLink(null),
			pictureIds: [a, b],
		});
		await postLink(h, headers, FIRST_ID, {
			...zaraLink(null),
			id: OTHER_LINK_ID,
			pictureIds: [c],
		});
		return { h, headers, a, b, c };
	}

	test("deletes a shop link with its pictures, from the bucket too", async () => {
		// Given
		const { h, headers, a, c } = await twoLinksWithPictures();
		// When
		const res = await send(h, headers, "DELETE", `/api/shop-links/${LINK_ID}`);
		const loaded = await send(h, headers, "GET", `/api/pictures/${a}`);
		// Then
		expect({
			status: res.status,
			keys: h.pictures.keys(),
			loaded: loaded.status,
		}).toEqual({ status: 204, keys: [c], loaded: 404 });
	});

	test("deletes a wish with the pictures of its links, from the bucket too", async () => {
		// Given: plus an owned item holding d
		const { h, headers } = await twoLinksWithPictures();
		const [d] = await uploads(h, headers, 1);
		const ids = await colourIds(h, headers);
		await send(h, headers, "POST", "/api/owned-items", {
			id: SECOND_ID,
			typeId: "shirt_l",
			colourId: ids.Navy,
			brandId: null,
			quantity: 1,
			pictureIds: [d],
		});
		// When
		const res = await send(h, headers, "DELETE", `/api/wishes/${FIRST_ID}`);
		// Then
		expect({ status: res.status, keys: h.pictures.keys() }).toEqual({
			status: 204,
			keys: [d],
		});
	});
});
