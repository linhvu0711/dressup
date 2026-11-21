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
} from "./test/harness";

type Listed = {
	id: string;
	typeId: string;
	colour: { id: string; name: string; hex: string };
	brand: { id: string; name: string } | null;
	quantity: number;
	name: string | null;
	price: number | null;
	pictureIds: string[];
};

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

// Navy long button-up, no brand, two of them.
const shirt = (ids: Ids) => ({
	id: FIRST_ID,
	typeId: "shirt_l",
	colourId: ids.Navy,
	brandId: null as string | null,
	quantity: 2,
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
						name: null,
						price: null,
						pictureIds: [],
					},
				],
			},
		});
	});

	test("answers 200 to an add sent again with the same id", async () => {
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

	test("adds an item with no brand when brandId is left out", async () => {
		// Given: alice signed in; the shirt with no brandId key
		const { h, headers, ids } = await alice();
		const { brandId: _, ...noBrand } = shirt(ids);
		// When
		const res = await post(h, headers, noBrand);
		// Then
		const { status, body } = await answer(res);
		const { ownedItem } = body as { ownedItem: Listed };
		expect({ status, brand: ownedItem.brand }).toEqual({
			status: 201,
			brand: null,
		});
	});

	test("refuses the same piece and brand a second time", async () => {
		// Given: alice has Zara and a Navy long button-up from Zara
		const { h, headers, ids } = await alice();
		const zara = await postBrand(h, headers, "Zara");
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
		const zara = await postBrand(h, headers, "Zara");
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
					name: null,
					price: null,
					pictureIds: [],
				},
			},
		});
	});

	test("clears the brand when a change leaves brandId out", async () => {
		// Given: brand Zara; the shirt with brand Zara
		const { h, headers, ids } = await alice();
		const zara = await postBrand(h, headers, "Zara");
		await post(h, headers, { ...shirt(ids), brandId: zara });
		// When
		const res = await put(h, headers, FIRST_ID, { quantity: 2 });
		// Then
		const { status, body } = await answer(res);
		const { ownedItem } = body as { ownedItem: Listed };
		expect({ status, brand: ownedItem.brand }).toEqual({
			status: 200,
			brand: null,
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

	test("answers 401 to a signed-out add, change, and delete", async () => {
		// Given: alice has an account; no session headers
		const h = await makeHarness();
		await h.addAccount(ALICE);
		const none = new Headers();
		// When
		const added = await post(h, none, {
			id: FIRST_ID,
			typeId: "shirt_l",
			colourId: "x",
			brandId: null,
			quantity: 2,
		});
		const changed = await put(h, none, FIRST_ID, {
			brandId: null,
			quantity: 1,
		});
		const deleted = await send(
			h,
			none,
			"DELETE",
			`/api/owned-items/${FIRST_ID}`,
		);
		// Then
		expect([
			await answer(added),
			await answer(changed),
			await answer(deleted),
		]).toEqual([
			{ status: 401, body: { error: "unauthorized" } },
			{ status: 401, body: { error: "unauthorized" } },
			{ status: 401, body: { error: "unauthorized" } },
		]);
	});
});
