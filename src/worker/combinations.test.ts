import { describe, expect, test } from "bun:test";
import { saveCombination } from "./combination-store";
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
	open: boolean;
	pieces: {
		layer: string;
		typeId: string;
		colour: { id: string; name: string; hex: string };
	}[];
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
	send(h, headers, "POST", "/api/combinations", body);

const list = async (h: Harness, headers: Headers) =>
	(
		(await (await send(h, headers, "GET", "/api/combinations")).json()) as {
			combinations: Listed[];
		}
	).combinations;

const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";

// Khaki Harrington jacket (open) + Black long tee + Navy casual pants.
const three = (ids: Ids) => ({
	id: FIRST_ID,
	pieces: [
		{ typeId: "harrington", colourId: ids.Khaki },
		{ typeId: "tee_l", colourId: ids.Black },
		{ typeId: "casual_p", colourId: ids.Navy },
	],
	open: true,
});

// White short tee + Grey training shorts.
const two = (ids: Ids) => ({
	id: SECOND_ID,
	pieces: [
		{ typeId: "train_sh", colourId: ids.Grey },
		{ typeId: "tee_s", colourId: ids.White },
	],
	open: false,
});

async function alice() {
	const { h, headers } = await withAccount();
	const ids = await colourIds(h, headers);
	return { h, headers, ids };
}

describe("POST /api/combinations", () => {
	test("saves a combination and lists it", async () => {
		// Given: alice signed in, her colour ids by name
		const { h, headers, ids } = await alice();
		// When
		const saved = await post(h, headers, three(ids));
		const listed = await list(h, headers);
		// Then
		expect({ status: saved.status, listed }).toEqual({
			status: 201,
			listed: [
				{
					id: FIRST_ID,
					open: true,
					pieces: [
						{
							layer: "bottom",
							typeId: "casual_p",
							colour: { id: ids.Navy, name: "Navy", hex: "#1F3A5F" },
						},
						{
							layer: "inner_top",
							typeId: "tee_l",
							colour: { id: ids.Black, name: "Black", hex: "#1B1B1F" },
						},
						{
							layer: "jacket",
							typeId: "harrington",
							colour: { id: ids.Khaki, name: "Khaki", hex: "#B8A57C" },
						},
					],
				},
			],
		});
	});

	test("lists the newest first", async () => {
		// Given: alice saved THREE, then TWO
		const { h, headers, ids } = await alice();
		await post(h, headers, three(ids));
		await post(h, headers, two(ids));
		// When
		const listed = await list(h, headers);
		// Then
		expect(listed.map((c) => c.id)).toEqual([SECOND_ID, FIRST_ID]);
	});

	test("saves once when the same save comes twice", async () => {
		// Given: alice
		const { h, headers, ids } = await alice();
		// When
		const first = await post(h, headers, three(ids));
		const again = await post(h, headers, three(ids));
		// Then
		expect({
			statuses: [first.status, again.status],
			count: (await list(h, headers)).length,
		}).toEqual({ statuses: [201, 200], count: 1 });
	});

	test("saves the same pieces with the jacket closed", async () => {
		// Given: alice saved THREE
		const { h, headers, ids } = await alice();
		await post(h, headers, three(ids));
		// When
		const res = await post(h, headers, {
			...three(ids),
			id: SECOND_ID,
			open: false,
		});
		// Then
		expect({
			status: res.status,
			count: (await list(h, headers)).length,
		}).toEqual({ status: 201, count: 2 });
	});

	test("refuses an id another account saved", async () => {
		// Given: bob saved THREE with his own colour ids
		const h = await makeHarness();
		const bob = await h.addAccount(BOB);
		await post(h, bob, three(await colourIds(h, bob)));
		const headers = await h.addAccount(ALICE);
		const ids = await colourIds(h, headers);
		// When
		const res = await post(h, headers, three(ids));
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 409,
			body: { error: "conflict", field: "id" },
		});
	});

	test("refuses a type that is not in the list", async () => {
		// Given: alice, THREE with its first type "jeans"
		const { h, headers, ids } = await alice();
		const body = three(ids);
		body.pieces[0].typeId = "jeans";
		// When
		const res = await post(h, headers, body);
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			listed: await list(h, headers),
		}).toEqual({
			status: 400,
			body: { error: "invalid", field: "pieces.0.typeId" },
			listed: [],
		});
	});
});

describe("combination rules", () => {
	const refusal = async (h: Harness, headers: Headers, body: unknown) => {
		const res = await post(h, headers, body);
		return { status: res.status, body: await res.json() };
	};

	test("refuses one piece", async () => {
		// Given: alice, THREE with only its casual_p piece
		const { h, headers, ids } = await alice();
		const body = { ...three(ids), pieces: [three(ids).pieces[2]] };
		// When
		const refused = await refusal(h, headers, body);
		// Then
		expect({ ...refused, listed: await list(h, headers) }).toEqual({
			status: 400,
			body: { error: "invalid", field: "pieces" },
			listed: [],
		});
	});

	test("refuses five pieces", async () => {
		// Given: alice, THREE plus a Navy sweater and Black chino shorts
		const { h, headers, ids } = await alice();
		const body = three(ids);
		body.pieces.push(
			{ typeId: "sweater", colourId: ids.Navy },
			{ typeId: "chino_sh", colourId: ids.Black },
		);
		// When
		const refused = await refusal(h, headers, body);
		// Then
		expect(refused).toEqual({
			status: 400,
			body: { error: "invalid", field: "pieces" },
		});
	});

	test("refuses two pieces in one layer", async () => {
		// Given: alice, Navy casual pants, Black chino shorts, White long tee
		const { h, headers, ids } = await alice();
		const body = {
			...three(ids),
			pieces: [
				{ typeId: "casual_p", colourId: ids.Navy },
				{ typeId: "chino_sh", colourId: ids.Black },
				{ typeId: "tee_l", colourId: ids.White },
			],
		};
		// When
		const refused = await refusal(h, headers, body);
		// Then
		expect(refused).toEqual({
			status: 400,
			body: { error: "invalid", field: "pieces.1.typeId" },
		});
	});

	test("refuses a colour that is not the account's", async () => {
		// Given: alice; THREE with bob's Black id as its second colour
		const { h, headers, ids } = await alice();
		const bob = await h.addAccount(BOB);
		const bobIds = await colourIds(h, bob);
		const body = three(ids);
		body.pieces[1].colourId = bobIds.Black;
		// When
		const refused = await refusal(h, headers, body);
		// Then
		expect(refused).toEqual({
			status: 400,
			body: { error: "invalid", field: "pieces.1.colourId" },
		});
	});
});

describe("duplicate", () => {
	test("refuses the same pieces and jacket state", async () => {
		// Given: alice saved THREE
		const { h, headers, ids } = await alice();
		await post(h, headers, three(ids));
		const [jacket, tee, pants] = three(ids).pieces;
		// When: the same pieces in another order, with a new id
		const res = await post(h, headers, {
			id: SECOND_ID,
			pieces: [pants, jacket, tee],
			open: true,
		});
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			count: (await list(h, headers)).length,
		}).toEqual({
			status: 409,
			body: { error: "duplicate", id: FIRST_ID },
			count: 1,
		});
	});

	test("refuses the same pieces with no jacket sent open and closed", async () => {
		// Given: alice saved TWO (no jacket, open false)
		const { h, headers, ids } = await alice();
		await post(h, headers, two(ids));
		// When
		const res = await post(h, headers, {
			...two(ids),
			id: "33333333-3333-4333-8333-333333333333",
			open: true,
		});
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 409,
			body: { error: "duplicate", id: SECOND_ID },
		});
	});

	test("answers duplicate when another tab saves the same pieces first", async () => {
		// Given: alice; her save's write waits until another tab saved the same
		// pieces with id 33333333-…, as looks.test.ts races two changes
		const { h, headers, ids } = await alice();
		const { db } = h;
		const batch = db.batch.bind(db);
		const otherTabFirst: typeof batch = async (items) => {
			db.batch = batch;
			await saveCombination(db, "alice-id", {
				...three(ids),
				id: "33333333-3333-4333-8333-333333333333",
			});
			return batch(items);
		};
		db.batch = otherTabFirst;
		// When
		const saved = await saveCombination(db, "alice-id", three(ids));
		// Then
		expect({
			saved: saved as unknown,
			ids: (await list(h, headers)).map((c) => c.id),
		}).toEqual({
			saved: {
				ok: false,
				error: {
					code: "duplicate",
					id: "33333333-3333-4333-8333-333333333333",
				},
			},
			ids: ["33333333-3333-4333-8333-333333333333"],
		});
	});
});

describe("combination limit", () => {
	const count = async (h: Harness, headers: Headers) =>
		(await list(h, headers)).length;

	test("refuses combination number 301", async () => {
		// Given: alice with 300 combinations
		const { h, headers, ids } = await alice();
		await h.seedCombinations("alice-id", 300);
		// When
		const res = await post(h, headers, three(ids));
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			count: await count(h, headers),
		}).toEqual({
			status: 409,
			body: { error: "combination_limit" },
			count: 300,
		});
	});

	test("saves combination number 300", async () => {
		// Given: alice with 299 combinations
		const { h, headers, ids } = await alice();
		await h.seedCombinations("alice-id", 299);
		// When
		const res = await post(h, headers, three(ids));
		// Then
		expect({ status: res.status, count: await count(h, headers) }).toEqual({
			status: 201,
			count: 300,
		});
	});

	test("saves one of two combinations sent at once at 299", async () => {
		// Given: alice with 299 combinations; the seed makes no jacket, so
		// neither save below is a duplicate
		const { h, headers, ids } = await alice();
		await h.seedCombinations("alice-id", 299);
		// When
		const results = await Promise.all([
			saveCombination(h.db, "alice-id", three(ids)),
			saveCombination(h.db, "alice-id", {
				...three(ids),
				id: SECOND_ID,
				open: false,
			}),
		]);
		// Then
		expect({
			count: await count(h, headers),
			oks: results.map((r) => r.ok).sort(),
			refused: results.flatMap((r) => (r.ok ? [] : [r.error as unknown])),
		}).toEqual({
			count: 300,
			oks: [false, true],
			refused: [{ code: "combination_limit" }],
		});
	});
});

describe("GET /api/combinations", () => {
	test("refuses without a session", async () => {
		// Given: no session
		const h = await makeHarness();
		// When
		const res = await h.app.request("/api/combinations", {}, h.env);
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 401,
			body: { error: "unauthorized" },
		});
	});

	test("lists only own combinations", async () => {
		// Given: alice saved THREE; bob signed in
		const { h, headers, ids } = await alice();
		await post(h, headers, three(ids));
		const bob = await h.addAccount(BOB);
		// When
		const res = await send(h, bob, "GET", "/api/combinations");
		// Then
		expect(await res.json()).toEqual({ combinations: [] });
	});

	test("shows a colour's new name on its combination", async () => {
		// Given: alice saved THREE, then changed Navy to Ink #22324A
		const { h, headers, ids } = await alice();
		await post(h, headers, three(ids));
		await send(h, headers, "PUT", `/api/colours/${ids.Navy}`, {
			id: ids.Navy,
			name: "Ink",
			hex: "#22324A",
		});
		// When
		const [listed] = await list(h, headers);
		// Then
		expect(listed.pieces[0].colour).toEqual({
			id: ids.Navy,
			name: "Ink",
			hex: "#22324A",
		});
	});
});
