import { describe, expect, test } from "bun:test";
import { picture } from "./db/picture-schema";
import {
	addOwnedItem,
	changeOwnedItem,
	deleteOwnedItem,
} from "./owned-item-store";
import {
	ALICE,
	BOB,
	type Harness,
	makeHarness,
	withAccount,
} from "./test/harness";

type Ids = Record<string, string>;

type Listed = {
	id: string;
	typeId: string;
	colour: { id: string; name: string; hex: string };
	brand: { id: string; name: string } | null;
	quantity: number;
	pictureIds: string[];
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

// The account's colour ids by name, from its first list.
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
		).json()) as {
			brand: { id: string };
		}
	).brand.id;

const post = (h: Harness, headers: Headers, body: unknown) =>
	send(h, headers, "POST", "/api/owned-items", body);

const put = (h: Harness, headers: Headers, id: string, body: unknown) =>
	send(h, headers, "PUT", `/api/owned-items/${id}`, body);

const list = async (h: Harness, headers: Headers) =>
	(
		(await (await send(h, headers, "GET", "/api/owned-items")).json()) as {
			ownedItems: Listed[];
		}
	).ownedItems;

const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";
const THIRD_ID = "33333333-3333-4333-8333-333333333333";

// Navy long button-up, no brand, two of them.
const shirt = (ids: Ids) => ({
	id: FIRST_ID,
	typeId: "shirt_l",
	colourId: ids.Navy,
	brandId: null as string | null,
	quantity: 2,
});

async function alice() {
	const { h, headers } = await withAccount();
	const ids = await colourIds(h, headers);
	return { h, headers, ids };
}

const answer = async (res: Response) => ({
	status: res.status,
	body: await res.json(),
});

describe("POST /api/owned-items", () => {
	test("adds an owned item and lists it", async () => {
		// Given: alice signed in, her colour ids by name, no brand
		const { h, headers, ids } = await alice();
		// When
		const added = await post(h, headers, shirt(ids));
		const listed = await send(h, headers, "GET", "/api/owned-items");
		// Then
		expect({ status: added.status, listed: await listed.json() }).toEqual({
			status: 201,
			listed: {
				ownedItems: [
					{
						id: FIRST_ID,
						typeId: "shirt_l",
						colour: { id: ids.Navy, name: "Navy", hex: "#1F3A5F" },
						brand: null,
						quantity: 2,
						pictureIds: [],
					},
				],
			},
		});
	});

	test("lists the owned items newest first", async () => {
		// Given: alice adds a Navy long button-up, then a White short tee
		const { h, headers, ids } = await alice();
		await post(h, headers, { ...shirt(ids), quantity: 1 });
		await post(h, headers, {
			id: SECOND_ID,
			typeId: "tee_s",
			colourId: ids.White,
			brandId: null,
			quantity: 1,
		});
		// When
		const listed = await list(h, headers);
		// Then
		expect(listed.map((item) => item.id)).toEqual([SECOND_ID, FIRST_ID]);
	});

	test("adds the same item again with the same id once", async () => {
		// Given: alice added the shirt once
		const { h, headers, ids } = await alice();
		await post(h, headers, shirt(ids));
		// When
		const again = await post(h, headers, shirt(ids));
		// Then
		expect({
			status: again.status,
			count: (await list(h, headers)).length,
		}).toEqual({ status: 200, count: 1 });
	});

	test("writes the new quantity when the same item is sent again", async () => {
		// Given: alice added the shirt with 2
		const { h, headers, ids } = await alice();
		await post(h, headers, shirt(ids));
		// When
		const again = await post(h, headers, { ...shirt(ids), quantity: 3 });
		// Then
		expect({
			status: again.status,
			quantities: (await list(h, headers)).map((item) => item.quantity),
		}).toEqual({ status: 200, quantities: [3] });
	});

	test("refuses the same piece and brand a second time", async () => {
		// Given: alice has Zara and a Navy long button-up from Zara
		const { h, headers, ids } = await alice();
		const zara = await addBrand(h, headers, "Zara");
		await post(h, headers, { ...shirt(ids), brandId: zara, quantity: 1 });
		// When
		const res = await post(h, headers, {
			...shirt(ids),
			id: SECOND_ID,
			brandId: zara,
			quantity: 3,
		});
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

	test("refuses the same piece with no brand a second time", async () => {
		// Given: alice has a Navy long button-up with no brand
		const { h, headers, ids } = await alice();
		await post(h, headers, shirt(ids));
		// When
		const res = await post(h, headers, { ...shirt(ids), id: SECOND_ID });
		// Then
		expect(await answer(res)).toEqual({
			status: 409,
			body: { error: "duplicate", id: FIRST_ID },
		});
	});

	test("adds the same piece with another brand", async () => {
		// Given: alice has Zara and COS, and a Navy long button-up from Zara
		const { h, headers, ids } = await alice();
		const zara = await addBrand(h, headers, "Zara");
		const cos = await addBrand(h, headers, "COS");
		await post(h, headers, { ...shirt(ids), brandId: zara });
		// When
		const res = await post(h, headers, {
			...shirt(ids),
			id: SECOND_ID,
			brandId: cos,
		});
		// Then
		expect({
			status: res.status,
			count: (await list(h, headers)).length,
		}).toEqual({ status: 201, count: 2 });
	});

	test("refuses a quantity of 0", async () => {
		// Given: the passing body
		const { h, headers, ids } = await alice();
		// When
		const res = await post(h, headers, { ...shirt(ids), quantity: 0 });
		// Then
		expect(await answer(res)).toEqual({
			status: 400,
			body: { error: "invalid", field: "quantity" },
		});
	});

	test("refuses a quantity of 100", async () => {
		// Given: the passing body
		const { h, headers, ids } = await alice();
		// When
		const res = await post(h, headers, { ...shirt(ids), quantity: 100 });
		// Then
		expect(await answer(res)).toEqual({
			status: 400,
			body: { error: "invalid", field: "quantity" },
		});
	});

	test("refuses a quantity of 1.5", async () => {
		// Given: the passing body
		const { h, headers, ids } = await alice();
		// When
		const res = await post(h, headers, { ...shirt(ids), quantity: 1.5 });
		// Then
		expect(await answer(res)).toEqual({
			status: 400,
			body: { error: "invalid", field: "quantity" },
		});
	});

	test("refuses a type that is not in the list", async () => {
		// Given: the passing body
		const { h, headers, ids } = await alice();
		// When
		const res = await post(h, headers, { ...shirt(ids), typeId: "cape" });
		// Then
		expect(await answer(res)).toEqual({
			status: 400,
			body: { error: "invalid", field: "typeId" },
		});
	});

	test("refuses a colour that is not the account's", async () => {
		// Given: the passing body; bob's Navy id
		const { h, headers, ids } = await alice();
		const bob = await h.addAccount(BOB);
		const bobIds = await colourIds(h, bob);
		// When
		const res = await post(h, headers, {
			...shirt(ids),
			colourId: bobIds.Navy,
		});
		// Then
		expect(await answer(res)).toEqual({
			status: 400,
			body: { error: "invalid", field: "colourId" },
		});
	});

	test("refuses a brand that is not the account's", async () => {
		// Given: the passing body; bob has Zara
		const { h, headers, ids } = await alice();
		const bob = await h.addAccount(BOB);
		const bobZara = await addBrand(h, bob, "Zara");
		// When
		const res = await post(h, headers, { ...shirt(ids), brandId: bobZara });
		// Then
		expect(await answer(res)).toEqual({
			status: 400,
			body: { error: "invalid", field: "brandId" },
		});
	});

	test("refuses item number 501", async () => {
		// Given: alice with 500 owned items, each with a brand
		const { h, headers, ids } = await alice();
		await h.seedOwnedItems("alice-id", 500);
		// When
		const res = await post(h, headers, shirt(ids));
		// Then
		expect({
			...(await answer(res)),
			count: (await list(h, headers)).length,
		}).toEqual({
			status: 409,
			body: { error: "owned_item_limit" },
			count: 500,
		});
	});

	test("answers 401 without a session", async () => {
		// Given: no session headers
		const h = await makeHarness();
		await h.addAccount(ALICE);
		// When
		const res = await send(h, new Headers(), "GET", "/api/owned-items");
		// Then
		expect(await answer(res)).toEqual({
			status: 401,
			body: { error: "unauthorized" },
		});
	});
});

describe("PUT and DELETE /api/owned-items/:id", () => {
	test("changes an item's brand and quantity", async () => {
		// Given: brand Zara; item A shirt_l, Navy, no brand, quantity 2
		const { h, headers, ids } = await alice();
		const zara = await addBrand(h, headers, "Zara");
		await post(h, headers, shirt(ids));
		// When
		const res = await put(h, headers, FIRST_ID, { brandId: zara, quantity: 3 });
		// Then
		expect(await answer(res)).toEqual({
			status: 200,
			body: {
				ownedItem: {
					id: FIRST_ID,
					typeId: "shirt_l",
					colour: { id: ids.Navy, name: "Navy", hex: "#1F3A5F" },
					brand: { id: zara, name: "Zara" },
					quantity: 3,
					pictureIds: [],
				},
			},
		});
	});

	test("keeps the piece when the change names a type", async () => {
		// Given: item A shirt_l, Navy, no brand, quantity 2
		const { h, headers, ids } = await alice();
		await post(h, headers, shirt(ids));
		// When
		const res = await put(h, headers, FIRST_ID, {
			typeId: "tee_s",
			brandId: null,
			quantity: 2,
		});
		// Then
		const { status, body } = await answer(res);
		expect({
			status,
			typeId: (body as { ownedItem: Listed }).ownedItem.typeId,
		}).toEqual({
			status: 200,
			typeId: "shirt_l",
		});
	});

	test("refuses a change to a brand another item of the piece has", async () => {
		// Given: brand Zara; item A shirt_l Navy Zara; item B shirt_l Navy no brand
		const { h, headers, ids } = await alice();
		const zara = await addBrand(h, headers, "Zara");
		await post(h, headers, { ...shirt(ids), brandId: zara });
		await post(h, headers, { ...shirt(ids), id: SECOND_ID });
		// When
		const res = await put(h, headers, SECOND_ID, {
			brandId: zara,
			quantity: 1,
		});
		// Then
		expect(await answer(res)).toEqual({
			status: 409,
			body: { error: "duplicate", id: FIRST_ID },
		});
	});

	test("changes the quantity of one of two no-brand items of a piece", async () => {
		// Given: brands Zara and COS; items A shirt_l Navy Zara and B shirt_l
		// Navy COS; Zara and COS deleted, so A and B both have no brand
		const { h, headers, ids } = await alice();
		const zara = await addBrand(h, headers, "Zara");
		const cos = await addBrand(h, headers, "COS");
		await post(h, headers, { ...shirt(ids), brandId: zara });
		await post(h, headers, { ...shirt(ids), id: SECOND_ID, brandId: cos });
		await send(h, headers, "DELETE", `/api/brands/${zara}`);
		await send(h, headers, "DELETE", `/api/brands/${cos}`);
		// When
		const res = await put(h, headers, FIRST_ID, { brandId: null, quantity: 5 });
		// Then
		const { status, body } = await answer(res);
		expect({
			status,
			quantity: (body as { ownedItem: Listed }).ownedItem.quantity,
		}).toEqual({
			status: 200,
			quantity: 5,
		});
	});

	test("refuses a quantity of 100 on change", async () => {
		// Given: item A shirt_l, Navy, no brand, quantity 2
		const { h, headers, ids } = await alice();
		await post(h, headers, shirt(ids));
		// When
		const res = await put(h, headers, FIRST_ID, {
			brandId: null,
			quantity: 100,
		});
		// Then
		expect(await answer(res)).toEqual({
			status: 400,
			body: { error: "invalid", field: "quantity" },
		});
	});

	test("answers not found for another account's item", async () => {
		// Given: bob's item shirt_l, his Navy; alice signed in
		const { h, headers } = await alice();
		const bob = await h.addAccount(BOB);
		const bobIds = await colourIds(h, bob);
		await post(h, bob, shirt(bobIds));
		// When
		const changed = await put(h, headers, FIRST_ID, {
			brandId: null,
			quantity: 1,
		});
		const deleted = await send(
			h,
			headers,
			"DELETE",
			`/api/owned-items/${FIRST_ID}`,
		);
		// Then
		expect({
			put: await answer(changed),
			delete: await answer(deleted),
			bobCount: (await list(h, bob)).length,
		}).toEqual({
			put: { status: 404, body: { error: "not_found" } },
			delete: { status: 404, body: { error: "not_found" } },
			bobCount: 1,
		});
	});

	test("deletes an item", async () => {
		// Given: item A
		const { h, headers, ids } = await alice();
		await post(h, headers, shirt(ids));
		// When
		const res = await send(
			h,
			headers,
			"DELETE",
			`/api/owned-items/${FIRST_ID}`,
		);
		const listed = await send(h, headers, "GET", "/api/owned-items");
		// Then
		expect({ status: res.status, listed: await listed.json() }).toEqual({
			status: 204,
			listed: { ownedItems: [] },
		});
	});
});

describe("adds at once", () => {
	test("refuses one of two adds that overlap at 499 items", async () => {
		// Given: alice with 499 owned items, each with a brand; two adds of
		// other pieces with no brand
		const { h, headers, ids } = await alice();
		await h.seedOwnedItems("alice-id", 499);
		// When
		const results = await Promise.all([
			addOwnedItem(h.db, bucket(h), "alice-id", shirt(ids)),
			addOwnedItem(h.db, bucket(h), "alice-id", {
				...shirt(ids),
				id: SECOND_ID,
				typeId: "tee_l",
			}),
		]);
		// Then
		expect({
			count: (await list(h, headers)).length,
			oks: results.map((r) => r.ok).sort(),
			refused: results.flatMap((r) => (r.ok ? [] : [r.error as unknown])),
		}).toEqual({
			count: 500,
			oks: [false, true],
			refused: [{ code: "owned_item_limit" }],
		});
	});

	test("refuses the second of two adds of one piece and brand that overlap", async () => {
		// Given: alice; two adds of a Navy long button-up with no brand
		const { h, headers, ids } = await alice();
		// When
		const [first, second] = await Promise.all([
			addOwnedItem(h.db, bucket(h), "alice-id", shirt(ids)),
			addOwnedItem(h.db, bucket(h), "alice-id", {
				...shirt(ids),
				id: THIRD_ID,
			}),
		]);
		// Then
		expect({
			first: first.ok,
			second: second as unknown,
			count: (await list(h, headers)).length,
		}).toEqual({
			first: true,
			second: { ok: false, error: { code: "duplicate", id: FIRST_ID } },
			count: 1,
		});
	});

	test("saves nothing when the colour goes during the add", async () => {
		// Given: alice; a trigger deletes Navy just before the item is written,
		// after the add's colour check passed
		const { h, headers, ids } = await alice();
		h.addTrigger(
			`CREATE TRIGGER drop_navy BEFORE INSERT ON owned_item WHEN NEW.colour_id = '${ids.Navy}' BEGIN DELETE FROM colour WHERE id = NEW.colour_id; END`,
		);
		// When
		const threw = await addOwnedItem(
			h.db,
			bucket(h),
			"alice-id",
			shirt(ids),
		).then(
			() => false,
			() => true,
		);
		// Then
		expect({ threw, count: (await list(h, headers)).length }).toEqual({
			threw: true,
			count: 0,
		});
	});
});

const JPEG = new Uint8Array(100).fill(0x11);
JPEG.set([0xff, 0xd8, 0xff, 0xe0]);

// Uploads a draft picture and gives its id.
const uploadPicture = async ({ app, env }: Harness, headers: Headers) =>
	(
		(await (
			await app.request(
				"/api/pictures",
				{
					method: "POST",
					headers: {
						...Object.fromEntries(headers),
						"content-type": "image/jpeg",
					},
					body: JPEG,
				},
				env,
			)
		).json()) as { picture: { id: string } }
	).picture.id;

const uploads = async (h: Harness, headers: Headers, n: number) => {
	const ids: string[] = [];
	for (let i = 0; i < n; i++) ids.push(await uploadPicture(h, headers));
	return ids;
};

const sorted = (ids: string[]) => [...ids].sort();

const bucket = (h: Harness) => h.pictures as unknown as R2Bucket;

describe("pictures of an item", () => {
	test("adds an item with its pictures and lists them", async () => {
		// Given
		const { h, headers, ids } = await alice();
		const [a, b] = await uploads(h, headers, 2);
		// When
		const added = await post(h, headers, { ...shirt(ids), pictureIds: [a, b] });
		const body = (await added.json()) as { ownedItem: Listed };
		const [listed] = await list(h, headers);
		// Then
		expect({
			status: added.status,
			answered: body.ownedItem.pictureIds,
			listed: listed.pictureIds,
		}).toEqual({ status: 201, answered: [a, b], listed: [a, b] });
	});

	test("lists an item with no pictures and no drafts", async () => {
		// Given
		const { h, headers, ids } = await alice();
		await post(h, headers, shirt(ids));
		await uploadPicture(h, headers);
		// When
		const [listed] = await list(h, headers);
		// Then
		expect(listed.pictureIds).toEqual([]);
	});

	test("removes a picture left out of the list, from the bucket too", async () => {
		// Given
		const { h, headers, ids } = await alice();
		const [a, b] = await uploads(h, headers, 2);
		await post(h, headers, { ...shirt(ids), pictureIds: [a, b] });
		// When
		const changed = await put(h, headers, FIRST_ID, {
			brandId: null,
			quantity: 1,
			pictureIds: [b],
		});
		const body = (await changed.json()) as { ownedItem: Listed };
		const loaded = await send(h, headers, "GET", `/api/pictures/${a}`);
		// Then
		expect({
			status: changed.status,
			pictureIds: body.ownedItem.pictureIds,
			loaded: loaded.status,
			keys: h.pictures.keys(),
		}).toEqual({ status: 200, pictureIds: [b], loaded: 404, keys: [b] });
	});

	test("keeps the pictures when a change leaves pictureIds out", async () => {
		// Given
		const { h, headers, ids } = await alice();
		const [a, b] = await uploads(h, headers, 2);
		await post(h, headers, { ...shirt(ids), pictureIds: [a, b] });
		// When
		const changed = await put(h, headers, FIRST_ID, {
			brandId: null,
			quantity: 3,
		});
		const body = (await changed.json()) as { ownedItem: Listed };
		// Then
		expect({
			status: changed.status,
			quantity: body.ownedItem.quantity,
			pictureIds: body.ownedItem.pictureIds,
		}).toEqual({ status: 200, quantity: 3, pictureIds: [a, b] });
	});

	test("keeps the pictures when a change is refused as duplicate", async () => {
		// Given: a Zara shirt, and a no-brand shirt of the same piece with two
		// pictures
		const { h, headers, ids } = await alice();
		const zara = await addBrand(h, headers, "Zara");
		await post(h, headers, { ...shirt(ids), brandId: zara });
		const [a, b] = await uploads(h, headers, 2);
		await post(h, headers, {
			...shirt(ids),
			id: SECOND_ID,
			pictureIds: [a, b],
		});
		// When
		const refused = await put(h, headers, SECOND_ID, {
			brandId: zara,
			quantity: 1,
			pictureIds: [],
		});
		const second = (await list(h, headers)).find((i) => i.id === SECOND_ID);
		// Then
		expect({
			status: refused.status,
			body: await refused.json(),
			pictureIds: second?.pictureIds,
			keys: h.pictures.keys(),
		}).toEqual({
			status: 409,
			body: { error: "duplicate", id: FIRST_ID },
			pictureIds: [a, b],
			keys: sorted([a, b]),
		});
	});

	test("saves the same list twice to the same state", async () => {
		// Given
		const { h, headers, ids } = await alice();
		const [a, b] = await uploads(h, headers, 2);
		await post(h, headers, { ...shirt(ids), pictureIds: [a, b] });
		const change = { brandId: null, quantity: 1, pictureIds: [a, b] };
		// When
		const first = await put(h, headers, FIRST_ID, change);
		const second = await put(h, headers, FIRST_ID, change);
		// Then
		expect({
			statuses: [first.status, second.status],
			lists: [
				((await first.json()) as { ownedItem: Listed }).ownedItem.pictureIds,
				((await second.json()) as { ownedItem: Listed }).ownedItem.pictureIds,
			],
			keys: h.pictures.keys(),
		}).toEqual({
			statuses: [200, 200],
			lists: [
				[a, b],
				[a, b],
			],
			keys: sorted([a, b]),
		});
	});

	test("takes the list again when an add is sent twice", async () => {
		// Given
		const { h, headers, ids } = await alice();
		const [a, b] = await uploads(h, headers, 2);
		await post(h, headers, { ...shirt(ids), pictureIds: [a] });
		// When
		const again = await post(h, headers, { ...shirt(ids), pictureIds: [a, b] });
		// Then
		expect({
			status: again.status,
			pictureIds: ((await again.json()) as { ownedItem: Listed }).ownedItem
				.pictureIds,
		}).toEqual({ status: 200, pictureIds: [a, b] });
	});

	test("adds an item with 8 pictures", async () => {
		// Given
		const { h, headers, ids } = await alice();
		const eight = await uploads(h, headers, 8);
		// When
		const added = await post(h, headers, { ...shirt(ids), pictureIds: eight });
		// Then
		expect({
			status: added.status,
			pictureIds: ((await added.json()) as { ownedItem: Listed }).ownedItem
				.pictureIds,
		}).toEqual({ status: 201, pictureIds: eight });
	});

	test("refuses an item with 9 pictures", async () => {
		// Given
		const { h, headers, ids } = await alice();
		const nine = await uploads(h, headers, 9);
		// When
		const refused = await answer(
			await post(h, headers, { ...shirt(ids), pictureIds: nine }),
		);
		// Then
		expect({ ...refused, listed: await list(h, headers) }).toEqual({
			status: 409,
			body: { error: "picture_limit" },
			listed: [],
		});
	});

	test("refuses a picture of another account in the list", async () => {
		// Given
		const { h, headers, ids } = await alice();
		const a = await uploadPicture(h, headers);
		const bobs = await uploadPicture(h, await h.addAccount(BOB));
		// When
		const refused = await answer(
			await post(h, headers, { ...shirt(ids), pictureIds: [a, bobs] }),
		);
		// Then
		expect(refused).toEqual({
			status: 400,
			body: { error: "invalid", field: "pictureIds" },
		});
	});

	test("refuses a picture of another item in the list", async () => {
		// Given: a Navy tee with picture o
		const { h, headers, ids } = await alice();
		const o = await uploadPicture(h, headers);
		await post(h, headers, {
			...shirt(ids),
			id: SECOND_ID,
			typeId: "tee_l",
			pictureIds: [o],
		});
		const a = await uploadPicture(h, headers);
		// When
		const refused = await answer(
			await post(h, headers, { ...shirt(ids), pictureIds: [a, o] }),
		);
		const other = (await list(h, headers)).find((i) => i.id === SECOND_ID);
		// Then
		expect({ ...refused, other: other?.pictureIds }).toEqual({
			status: 400,
			body: { error: "invalid", field: "pictureIds" },
			other: [o],
		});
	});
});

describe("picture lists at once", () => {
	test("leaves one list when two saves of one item overlap", async () => {
		// Given: two lists of 8 drafts; the harness runs batches one at a time,
		// in the order they are sent
		const { h, headers, ids } = await alice();
		await post(h, headers, shirt(ids));
		const all = await uploads(h, headers, 16);
		const L1 = all.slice(0, 8);
		const L2 = all.slice(8);
		// When
		await Promise.all([
			changeOwnedItem(h.db, bucket(h), "alice-id", FIRST_ID, {
				brandId: null,
				quantity: 1,
				pictureIds: L1,
			}),
			changeOwnedItem(h.db, bucket(h), "alice-id", FIRST_ID, {
				brandId: null,
				quantity: 1,
				pictureIds: L2,
			}),
		]);
		const [listed] = await list(h, headers);
		// Then
		expect({ listed: listed.pictureIds, objects: h.pictures.keys() }).toEqual({
			listed: L2,
			objects: sorted(L2),
		});
	});

	test("attaches nothing when the item goes during the change", async () => {
		// Given: another tab deletes the item just before the change's batch
		const { h, headers, ids } = await alice();
		await post(h, headers, shirt(ids));
		const a = await uploadPicture(h, headers);
		const { db } = h;
		const batch = db.batch;
		const otherTabFirst: typeof batch = async (items) => {
			db.batch = batch;
			await deleteOwnedItem(db, "alice-id", FIRST_ID);
			return batch(items);
		};
		db.batch = otherTabFirst;
		// When
		const changed = await changeOwnedItem(db, bucket(h), "alice-id", FIRST_ID, {
			brandId: null,
			quantity: 1,
			pictureIds: [a],
		});
		const [row] = await h.rows(picture);
		// Then
		expect({ changed: changed as unknown, owner: row?.ownedItemId }).toEqual({
			changed: { ok: false, error: { code: "not_found" } },
			owner: null,
		});
	});
});
