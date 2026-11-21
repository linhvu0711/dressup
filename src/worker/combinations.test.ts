import { describe, expect, test } from "bun:test";
import {
	FIRST_ID,
	greyPants,
	SECOND_ID,
	three,
	two,
} from "./test/combination-pieces";
import { alice, type Harness, makeHarness, send } from "./test/harness";

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

// Each piece of a listed combination as its type and colour name, bottom
// layer first.
const piecesOf = (listed: Listed | undefined) =>
	listed?.pieces.map((p) => [p.typeId, p.colour.name]);

const put = (h: Harness, headers: Headers, id: string, body: unknown) =>
	send(h, headers, "PUT", `/api/combinations/${id}`, body);

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

	test("refuses a change to a combination that is gone", async () => {
		// Given: alice saved THREE, then it was deleted
		const { h, headers, ids } = await alice();
		await post(h, headers, three(ids));
		await send(h, headers, "DELETE", `/api/combinations/${FIRST_ID}`);
		// When
		const res = await put(h, headers, FIRST_ID, greyPants(ids));
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			listed: await list(h, headers),
		}).toEqual({ status: 404, body: { error: "not_found" }, listed: [] });
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
});
