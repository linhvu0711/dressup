import { describe, expect, test } from "bun:test";
import {
	ALICE,
	BOB,
	type Harness,
	makeHarness,
	withAccount,
} from "./test/harness";
import { addWish } from "./wish-store";

type Ids = Record<string, string>;

type Listed = {
	id: string;
	typeId: string;
	colour: { id: string; name: string; hex: string };
	shopLinks: unknown[];
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

// A Navy wool jacket.
const jacket = (ids: Ids) => ({
	id: FIRST_ID,
	typeId: "wool",
	colourId: ids.Navy,
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
