import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { changeCombination, saveCombination } from "./combination-store";
import { combination, combinationPiece } from "./db/combination-schema";
import { deleteTag } from "./tag-store";
import {
	ALICE,
	alice,
	BOB,
	colourIds,
	type Harness,
	type Ids,
	makeHarness,
	send,
} from "./test/harness";

type Listed = {
	id: string;
	tags: string[];
	pieces: {
		layer: string;
		typeId: string;
		colour: { id: string; name: string; hex: string };
	}[];
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

// Khaki Harrington jacket + Black long tee + Navy casual pants.
const three = (ids: Ids) => ({
	id: FIRST_ID,
	pieces: [
		{ typeId: "harrington", colourId: ids.Khaki },
		{ typeId: "tee_l", colourId: ids.Black },
		{ typeId: "casual_p", colourId: ids.Navy },
	],
});

// White short tee + Grey training shorts.
const two = (ids: Ids) => ({
	id: SECOND_ID,
	pieces: [
		{ typeId: "train_sh", colourId: ids.Grey },
		{ typeId: "tee_s", colourId: ids.White },
	],
});

const THIRD_ID = "33333333-3333-4333-8333-333333333333";

// Each piece of a listed combination as its type and colour name, bottom
// layer first.
const piecesOf = (listed: Listed | undefined) =>
	listed?.pieces.map((p) => [p.typeId, p.colour.name]);

const put = (h: Harness, headers: Headers, id: string, body: unknown) =>
	send(h, headers, "PUT", `/api/combinations/${id}`, body);

// THREE with Grey casual pants in place of Navy.
const greyPants = (ids: Ids) => ({
	...three(ids),
	pieces: [
		{ typeId: "harrington", colourId: ids.Khaki },
		{ typeId: "tee_l", colourId: ids.Black },
		{ typeId: "casual_p", colourId: ids.Grey },
	],
});

// Beige chino pants and a White long tee: the pieces the races change into.
const beigeChinos = (ids: Ids) => [
	{ typeId: "chino_p", colourId: ids.Beige },
	{ typeId: "tee_l", colourId: ids.White },
];

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
					tags: [],
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
	test("refuses the same pieces in another order", async () => {
		// Given: alice saved THREE
		const { h, headers, ids } = await alice();
		await post(h, headers, three(ids));
		const [jacket, tee, pants] = three(ids).pieces;
		// When: the same pieces in another order, with a new id
		const res = await post(h, headers, {
			id: SECOND_ID,
			pieces: [pants, jacket, tee],
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

	test("answers duplicate when another tab saves the same pieces first", async () => {
		// Given: alice; her save's write waits until another tab saved the same
		// pieces with id 33333333-…
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
			saveCombination(h.db, "alice-id", { ...greyPants(ids), id: SECOND_ID }),
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

describe("PUT /api/combinations/:id", () => {
	test("changes a combination and keeps its id and place", async () => {
		// Given: alice saved THREE, then TWO, so TWO is first
		const { h, headers, ids } = await alice();
		await post(h, headers, three(ids));
		await post(h, headers, two(ids));
		// When
		const res = await put(h, headers, FIRST_ID, greyPants(ids));
		const listed = await list(h, headers);
		// Then
		expect({
			status: res.status,
			ids: listed.map((c) => c.id),
			pieces: piecesOf(listed[1]),
		}).toEqual({
			status: 200,
			ids: [SECOND_ID, FIRST_ID],
			pieces: [
				["casual_p", "Grey"],
				["tee_l", "Black"],
				["harrington", "Khaki"],
			],
		});
	});

	test("changes nothing more when the same change comes twice", async () => {
		// Given: alice saved THREE, then TWO; THREE changed once
		const { h, headers, ids } = await alice();
		await post(h, headers, three(ids));
		await post(h, headers, two(ids));
		const first = await put(h, headers, FIRST_ID, greyPants(ids));
		const firstBody = await first.json();
		const listedOnce = await list(h, headers);
		// When
		const again = await put(h, headers, FIRST_ID, greyPants(ids));
		// Then
		expect({
			status: again.status,
			body: await again.json(),
			listed: await list(h, headers),
		}).toEqual({ status: 200, body: firstBody, listed: listedOnce });
	});

	test("refuses a change into a combination the account has", async () => {
		// Given: alice saved THREE, then TWO
		const { h, headers, ids } = await alice();
		await post(h, headers, three(ids));
		await post(h, headers, two(ids));
		const before = await list(h, headers);
		// When
		const res = await put(h, headers, FIRST_ID, { ...two(ids), id: FIRST_ID });
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			listed: await list(h, headers),
		}).toEqual({
			status: 409,
			body: { error: "duplicate", id: SECOND_ID },
			listed: before,
		});
	});

	test("refuses a change to a combination that is gone", async () => {
		// Given: alice saved THREE, then it was deleted
		const { h, headers, ids } = await alice();
		await post(h, headers, three(ids));
		await h.db.delete(combination).where(eq(combination.id, FIRST_ID));
		// When
		const res = await put(h, headers, FIRST_ID, greyPants(ids));
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			listed: await list(h, headers),
		}).toEqual({ status: 404, body: { error: "not_found" }, listed: [] });
	});

	test("refuses a change to another account's combination", async () => {
		// Given: bob saved THREE with his own colour ids; alice signed in
		const h = await makeHarness();
		const bob = await h.addAccount(BOB);
		await post(h, bob, three(await colourIds(h, bob)));
		const bobsBefore = await list(h, bob);
		const headers = await h.addAccount(ALICE);
		const ids = await colourIds(h, headers);
		// When
		const res = await put(h, headers, FIRST_ID, greyPants(ids));
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			bobs: await list(h, bob),
		}).toEqual({
			status: 404,
			body: { error: "not_found" },
			bobs: bobsBefore,
		});
	});

	test("refuses a change whose id is not the address's", async () => {
		// Given: alice saved THREE, then TWO
		const { h, headers, ids } = await alice();
		await post(h, headers, three(ids));
		await post(h, headers, two(ids));
		// When
		const res = await put(h, headers, FIRST_ID, {
			...greyPants(ids),
			id: SECOND_ID,
		});
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "id" },
		});
	});
});

describe("DELETE /api/combinations/:id", () => {
	const del = (h: Harness, headers: Headers, id: string) =>
		send(h, headers, "DELETE", `/api/combinations/${id}`);

	test("deletes a combination and frees its colours", async () => {
		// Given: alice saved THREE
		const { h, headers, ids } = await alice();
		await post(h, headers, three(ids));
		// When
		const res = await del(h, headers, FIRST_ID);
		// Then
		const { colours } = (await (
			await send(h, headers, "GET", "/api/colours")
		).json()) as { colours: { name: string; inUse: boolean }[] };
		expect({
			status: res.status,
			listed: await list(h, headers),
			inUse: colours
				.filter((c) => ["Khaki", "Black", "Navy"].includes(c.name))
				.map((c) => c.inUse),
		}).toEqual({ status: 204, listed: [], inUse: [false, false, false] });
	});

	test("refuses to delete a combination that is gone", async () => {
		// Given: alice saved THREE and deleted it
		const { h, headers, ids } = await alice();
		await post(h, headers, three(ids));
		await del(h, headers, FIRST_ID);
		// When
		const res = await del(h, headers, FIRST_ID);
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			listed: await list(h, headers),
		}).toEqual({ status: 404, body: { error: "not_found" }, listed: [] });
	});

	test("refuses to delete another account's combination", async () => {
		// Given: bob saved THREE with his own colour ids; alice signed in
		const h = await makeHarness();
		const bob = await h.addAccount(BOB);
		await post(h, bob, three(await colourIds(h, bob)));
		const headers = await h.addAccount(ALICE);
		// When
		const res = await del(h, headers, FIRST_ID);
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			bobs: (await list(h, bob)).map((c) => c.id),
		}).toEqual({
			status: 404,
			body: { error: "not_found" },
			bobs: [FIRST_ID],
		});
	});
});

describe("changes at once", () => {
	test("answers duplicate when another tab changes a combination into the same pieces first", async () => {
		// Given: alice saved THREE, TWO, and a third; before THREE's change
		// writes, another tab changes the third into Beige chinos
		const { h, headers, ids } = await alice();
		const { db } = h;
		await post(h, headers, three(ids));
		await post(h, headers, two(ids));
		await post(h, headers, {
			id: THIRD_ID,
			pieces: [
				{ typeId: "casual_p", colourId: ids.Grey },
				{ typeId: "tee_s", colourId: ids.White },
			],
		});
		const batch = db.batch.bind(db);
		const otherTabFirst: typeof batch = async (items) => {
			db.batch = batch;
			await changeCombination(db, "alice-id", THIRD_ID, {
				pieces: beigeChinos(ids),
			});
			return batch(items);
		};
		db.batch = otherTabFirst;
		// When
		const changed = await changeCombination(db, "alice-id", FIRST_ID, {
			pieces: beigeChinos(ids),
		});
		// Then
		expect({
			changed: changed as unknown,
			pieces: piecesOf((await list(h, headers)).find((c) => c.id === FIRST_ID)),
		}).toEqual({
			changed: { ok: false, error: { code: "duplicate", id: THIRD_ID } },
			pieces: [
				["casual_p", "Navy"],
				["tee_l", "Black"],
				["harrington", "Khaki"],
			],
		});
	});

	test("answers not_found when another tab deletes the combination during a change", async () => {
		// Given: alice saved THREE; another tab deletes it before the change
		// writes
		const { h, headers, ids } = await alice();
		const { db } = h;
		await post(h, headers, three(ids));
		const batch = db.batch.bind(db);
		const otherTabFirst: typeof batch = async (items) => {
			db.batch = batch;
			await db.delete(combination).where(eq(combination.id, FIRST_ID));
			return batch(items);
		};
		db.batch = otherTabFirst;
		// When
		const changed = await changeCombination(db, "alice-id", FIRST_ID, {
			pieces: beigeChinos(ids),
		});
		// Then
		expect({
			changed: changed as unknown,
			listed: await list(h, headers),
			pieces: (await h.rows(combinationPiece)).filter(
				(p) => p.combinationId === FIRST_ID,
			),
		}).toEqual({
			changed: { ok: false, error: { code: "not_found" } },
			listed: [],
			pieces: [],
		});
	});

	test("keeps one tab's pieces whole when two tabs change one combination", async () => {
		// Given: alice saved THREE; another tab changes it into four pieces
		// before this change writes
		const { h, headers, ids } = await alice();
		const { db } = h;
		await post(h, headers, three(ids));
		const batch = db.batch.bind(db);
		const otherTabFirst: typeof batch = async (items) => {
			db.batch = batch;
			await changeCombination(db, "alice-id", FIRST_ID, {
				pieces: [
					{ typeId: "casual_p", colourId: ids.Grey },
					{ typeId: "tee_l", colourId: ids.Black },
					{ typeId: "sweater", colourId: ids.Navy },
					{ typeId: "harrington", colourId: ids.Khaki },
				],
			});
			return batch(items);
		};
		db.batch = otherTabFirst;
		// When
		const changed = await changeCombination(db, "alice-id", FIRST_ID, {
			pieces: beigeChinos(ids),
		});
		// Then
		expect({
			ok: changed.ok,
			pieces: piecesOf((await list(h, headers))[0]),
		}).toEqual({
			ok: true,
			pieces: [
				["chino_p", "Beige"],
				["tee_l", "White"],
			],
		});
	});

	test("keeps the old pieces when a colour is deleted while a change writes", async () => {
		// Given: alice saved THREE; a trigger deletes Beige just before its
		// piece is written, after the change's colour check passed
		const { h, headers, ids } = await alice();
		await post(h, headers, three(ids));
		h.addTrigger(
			`CREATE TRIGGER drop_beige BEFORE INSERT ON combination_piece WHEN NEW.colour_id = '${ids.Beige}' BEGIN DELETE FROM colour WHERE id = NEW.colour_id; END`,
		);
		// When
		const threw = await changeCombination(h.db, "alice-id", FIRST_ID, {
			pieces: beigeChinos(ids),
		}).then(
			() => false,
			() => true,
		);
		// Then
		expect({ threw, pieces: piecesOf((await list(h, headers))[0]) }).toEqual({
			threw: true,
			pieces: [
				["casual_p", "Navy"],
				["tee_l", "Black"],
				["harrington", "Khaki"],
			],
		});
	});
});

describe("a colour deleted during a save", () => {
	test("keeps no piece of a colour deleted while the save writes", async () => {
		// Given: alice; a trigger deletes Navy just before its piece is written,
		// after the save's colour check passed
		const { h, headers, ids } = await alice();
		h.addTrigger(
			`CREATE TRIGGER drop_navy BEFORE INSERT ON combination_piece WHEN NEW.colour_id = '${ids.Navy}' BEGIN DELETE FROM colour WHERE id = NEW.colour_id; END`,
		);
		// When
		const threw = await saveCombination(h.db, "alice-id", three(ids)).then(
			() => false,
			() => true,
		);
		// Then
		expect({ threw, combinations: (await list(h, headers)).length }).toEqual({
			threw: true,
			combinations: 0,
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

// The id of a tag the account adds through the page's route.
const addTag = async (h: Harness, headers: Headers, name: string) =>
	(
		(await (await send(h, headers, "POST", "/api/tags", { name })).json()) as {
			tag: { id: string };
		}
	).tag.id;

const NO_TAG = "5b1f2c3d-0000-4000-8000-000000000000";

describe("tags on a combination", () => {
	const refusal = async (h: Harness, headers: Headers, body: unknown) => {
		const res = await post(h, headers, body);
		return { status: res.status, body: await res.json() };
	};

	test("saves a combination with its tags and lists them", async () => {
		// Given: alice; tags Work and Weekend
		const { h, headers, ids } = await alice();
		const work = await addTag(h, headers, "Work");
		const weekend = await addTag(h, headers, "Weekend");
		// When
		const saved = await post(h, headers, {
			...three(ids),
			tags: [work, weekend],
		});
		const listed = await list(h, headers);
		// Then
		expect({ status: saved.status, tags: listed.map((c) => c.tags) }).toEqual({
			status: 201,
			tags: [[work, weekend]],
		});
	});

	test("saves a combination with no tags when the body has none", async () => {
		// Given: alice; THREE with no tags key
		const { h, headers, ids } = await alice();
		// When
		const saved = await post(h, headers, three(ids));
		const listed = await list(h, headers);
		// Then
		expect({ status: saved.status, tags: listed.map((c) => c.tags) }).toEqual({
			status: 201,
			tags: [[]],
		});
	});

	test("writes the tags of a save sent again with other tags", async () => {
		// Given: alice; tags Work and Weekend; THREE saved with Work, its
		// answer lost
		const { h, headers, ids } = await alice();
		const work = await addTag(h, headers, "Work");
		const weekend = await addTag(h, headers, "Weekend");
		const body = three(ids);
		await post(h, headers, { ...body, tags: [work] });
		// When: the same save is sent again with Weekend picked instead
		const again = await post(h, headers, { ...body, tags: [weekend] });
		const listed = await list(h, headers);
		// Then
		expect({
			status: again.status,
			answered: ((await again.json()) as { combination: { tags: string[] } })
				.combination.tags,
			listed: listed.map((c) => c.tags),
		}).toEqual({ status: 200, answered: [weekend], listed: [[weekend]] });
	});

	test("saves a combination's tags once when the same save comes twice", async () => {
		// Given: alice; tag Work; THREE with it
		const { h, headers, ids } = await alice();
		const work = await addTag(h, headers, "Work");
		const body = { ...three(ids), tags: [work] };
		// When
		const first = await post(h, headers, body);
		const second = await post(h, headers, body);
		const listed = await list(h, headers);
		// Then
		expect({
			statuses: [first.status, second.status],
			tags: listed.map((c) => c.tags),
		}).toEqual({ statuses: [201, 200], tags: [[work]] });
	});

	test("saves a combination with 50 tags", async () => {
		// Given: alice; 50 tags t1 to t50
		const { h, headers, ids } = await alice();
		const tags: string[] = [];
		for (let i = 1; i <= 50; i++) tags.push(await addTag(h, headers, `t${i}`));
		// When
		const res = await post(h, headers, { ...three(ids), tags });
		// Then
		const body = (await res.json()) as { combination: Listed };
		expect({ status: res.status, count: body.combination.tags.length }).toEqual(
			{ status: 201, count: 50 },
		);
	});

	test("refuses a combination with 51 tags", async () => {
		// Given: alice; 51 tags t1 to t51
		const { h, headers, ids } = await alice();
		const tags: string[] = [];
		for (let i = 1; i <= 51; i++) tags.push(await addTag(h, headers, `t${i}`));
		// When
		const refused = await refusal(h, headers, { ...three(ids), tags });
		// Then
		expect(refused).toEqual({
			status: 400,
			body: { error: "invalid", field: "tags" },
		});
	});

	test("refuses a tag that is not the account's", async () => {
		// Given: alice; tag Work and a uuid no tag has
		const { h, headers, ids } = await alice();
		const work = await addTag(h, headers, "Work");
		// When
		const refused = await refusal(h, headers, {
			...three(ids),
			tags: [work, NO_TAG],
		});
		// Then
		expect(refused).toEqual({
			status: 400,
			body: { error: "invalid", field: "tags" },
		});
	});

	test("refuses a tag id that is not a uuid", async () => {
		// Given: alice; tag Work and the id "work"
		const { h, headers, ids } = await alice();
		const work = await addTag(h, headers, "Work");
		// When
		const refused = await refusal(h, headers, {
			...three(ids),
			tags: [work, "work"],
		});
		// Then
		expect(refused).toEqual({
			status: 400,
			body: { error: "invalid", field: "tags" },
		});
	});

	test("refuses a combination with tags at the combination limit", async () => {
		// Given: alice with 300 combinations; tag Work
		const { h, headers, ids } = await alice();
		await h.seedCombinations("alice-id", 300);
		const work = await addTag(h, headers, "Work");
		// When
		const refused = await refusal(h, headers, { ...three(ids), tags: [work] });
		// Then
		expect(refused).toEqual({
			status: 409,
			body: { error: "combination_limit" },
		});
	});

	test("refuses a tag another account has", async () => {
		// Given: alice; bob's tag Work
		const { h, headers, ids } = await alice();
		const bob = await h.addAccount(BOB);
		const bobWork = await addTag(h, bob, "Work");
		// When
		const refused = await refusal(h, headers, {
			...three(ids),
			tags: [bobWork],
		});
		const bobTags = (await (await send(h, bob, "GET", "/api/tags")).json()) as {
			tags: { name: string }[];
		};
		// Then
		expect({ refused, bobTags: bobTags.tags.map((t) => t.name) }).toEqual({
			refused: { status: 400, body: { error: "invalid", field: "tags" } },
			bobTags: ["Work"],
		});
	});

	test("saves a combination without a tag deleted while the save writes", async () => {
		// Given: alice; tags Work and Weekend; another tab deletes Weekend
		// after the save's tag check and before its batch
		const { h, headers, ids } = await alice();
		const { db } = h;
		const work = await addTag(h, headers, "Work");
		const weekend = await addTag(h, headers, "Weekend");
		const batch = db.batch.bind(db);
		const otherTabFirst: typeof batch = async (items) => {
			db.batch = batch;
			await deleteTag(db, "alice-id", weekend);
			return batch(items);
		};
		db.batch = otherTabFirst;
		// When
		const saved = await saveCombination(db, "alice-id", {
			...three(ids),
			tags: [work, weekend],
		});
		// Then
		expect({
			ok: saved.ok,
			tags: (await list(h, headers)).map((c) => c.tags),
		}).toEqual({ ok: true, tags: [[work]] });
	});

	test("changes only a combination's tags", async () => {
		// Given: alice; tags Work and Weekend; THREE saved with Work
		const { h, headers, ids } = await alice();
		const work = await addTag(h, headers, "Work");
		const weekend = await addTag(h, headers, "Weekend");
		await post(h, headers, { ...three(ids), tags: [work] });
		// When
		const res = await put(h, headers, FIRST_ID, {
			...three(ids),
			tags: [weekend],
		});
		const [listed] = await list(h, headers);
		// Then
		expect({
			status: res.status,
			tags: listed.tags,
			pieces: piecesOf(listed),
		}).toEqual({
			status: 200,
			tags: [weekend],
			pieces: [
				["casual_p", "Navy"],
				["tee_l", "Black"],
				["harrington", "Khaki"],
			],
		});
	});

	test("keeps a combination's tags when a change leaves them out", async () => {
		// Given: alice; tag Work; THREE saved with it
		const { h, headers, ids } = await alice();
		const work = await addTag(h, headers, "Work");
		await post(h, headers, { ...three(ids), tags: [work] });
		// When
		const res = await put(h, headers, FIRST_ID, {
			...three(ids),
			pieces: beigeChinos(ids),
		});
		const [listed] = await list(h, headers);
		// Then
		expect({ status: res.status, tags: listed.tags }).toEqual({
			status: 200,
			tags: [work],
		});
	});

	test("changes a combination's tags once when the same change comes twice", async () => {
		// Given: alice; tags Work and Weekend; THREE saved with Work
		const { h, headers, ids } = await alice();
		const work = await addTag(h, headers, "Work");
		const weekend = await addTag(h, headers, "Weekend");
		await post(h, headers, { ...three(ids), tags: [work] });
		const body = { ...three(ids), tags: [work, weekend] };
		// When
		const first = await put(h, headers, FIRST_ID, body);
		const second = await put(h, headers, FIRST_ID, body);
		const [listed] = await list(h, headers);
		// Then
		expect({
			statuses: [first.status, second.status],
			tags: listed.tags,
		}).toEqual({ statuses: [200, 200], tags: [work, weekend] });
	});

	test("refuses a change with a tag that is not the account's", async () => {
		// Given: alice; tag Work; THREE saved with it
		const { h, headers, ids } = await alice();
		const work = await addTag(h, headers, "Work");
		await post(h, headers, { ...three(ids), tags: [work] });
		// When
		const res = await put(h, headers, FIRST_ID, {
			...three(ids),
			tags: [NO_TAG],
		});
		const [listed] = await list(h, headers);
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			tags: listed.tags,
		}).toEqual({
			status: 400,
			body: { error: "invalid", field: "tags" },
			tags: [work],
		});
	});

	test("answers not_found when another tab deletes the combination during a tag change", async () => {
		// Given: alice; tag Work; THREE saved with no tags; another tab deletes
		// it before the change writes
		const { h, headers, ids } = await alice();
		const { db } = h;
		const work = await addTag(h, headers, "Work");
		await post(h, headers, three(ids));
		const batch = db.batch.bind(db);
		const otherTabFirst: typeof batch = async (items) => {
			db.batch = batch;
			await db.delete(combination).where(eq(combination.id, FIRST_ID));
			return batch(items);
		};
		db.batch = otherTabFirst;
		// When
		const changed = await changeCombination(db, "alice-id", FIRST_ID, {
			pieces: three(ids).pieces,
			tags: [work],
		});
		// Then
		expect(changed as unknown).toEqual({
			ok: false,
			error: { code: "not_found" },
		});
	});

	test("changes a combination without a tag deleted while the change writes", async () => {
		// Given: alice; tags Work and Weekend; THREE saved with no tags;
		// another tab deletes Weekend before the change writes
		const { h, headers, ids } = await alice();
		const { db } = h;
		const work = await addTag(h, headers, "Work");
		const weekend = await addTag(h, headers, "Weekend");
		await post(h, headers, three(ids));
		const batch = db.batch.bind(db);
		const otherTabFirst: typeof batch = async (items) => {
			db.batch = batch;
			await deleteTag(db, "alice-id", weekend);
			return batch(items);
		};
		db.batch = otherTabFirst;
		// When
		const changed = await changeCombination(db, "alice-id", FIRST_ID, {
			pieces: three(ids).pieces,
			tags: [work, weekend],
		});
		// Then
		expect({
			ok: changed.ok,
			tags: (await list(h, headers)).map((c) => c.tags),
		}).toEqual({ ok: true, tags: [[work]] });
	});

	test("keeps one tab's tags when two tabs change them at once", async () => {
		// Given: alice; tags Work and Weekend; THREE saved with no tags;
		// another tab sets Weekend before this change writes
		const { h, headers, ids } = await alice();
		const { db } = h;
		const work = await addTag(h, headers, "Work");
		const weekend = await addTag(h, headers, "Weekend");
		await post(h, headers, three(ids));
		const batch = db.batch.bind(db);
		const otherTabFirst: typeof batch = async (items) => {
			db.batch = batch;
			await changeCombination(db, "alice-id", FIRST_ID, {
				pieces: three(ids).pieces,
				tags: [weekend],
			});
			return batch(items);
		};
		db.batch = otherTabFirst;
		// When
		await changeCombination(db, "alice-id", FIRST_ID, {
			pieces: three(ids).pieces,
			tags: [work],
		});
		// Then
		expect((await list(h, headers)).map((c) => c.tags)).toEqual([[work]]);
	});
});
