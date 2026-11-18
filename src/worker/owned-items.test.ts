import { describe, expect, test } from "bun:test";
import { addOwnedItem } from "./owned-item-store";
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

describe("adds at once", () => {
	test("refuses one of two adds that overlap at 499 items", async () => {
		// Given: alice with 499 owned items, each with a brand; two adds of
		// other pieces with no brand
		const { h, headers, ids } = await alice();
		await h.seedOwnedItems("alice-id", 499);
		// When
		const results = await Promise.all([
			addOwnedItem(h.db, "alice-id", shirt(ids)),
			addOwnedItem(h.db, "alice-id", {
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
			addOwnedItem(h.db, "alice-id", shirt(ids)),
			addOwnedItem(h.db, "alice-id", { ...shirt(ids), id: THIRD_ID }),
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
		const threw = await addOwnedItem(h.db, "alice-id", shirt(ids)).then(
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
