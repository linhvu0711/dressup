import { describe, expect, test } from "bun:test";
import { addColour, listColours } from "./colour-store";
import { schema } from "./db";
import {
	alice,
	BOB,
	type Harness,
	makeHarness,
	otherTabWrites,
	send,
	withAccount,
} from "./test/harness";

type Colour = { id: string; name: string; hex: string; inUse?: boolean };

const coloursOf = async (h: Harness, headers: Headers) =>
	(
		(await (await send(h, headers, "GET", "/api/colours")).json()) as {
			colours: Colour[];
		}
	).colours;

const postColour = (
	h: Harness,
	headers: Headers,
	body: { name: string; hex: string },
) => send(h, headers, "POST", "/api/colours", body);

const TEAL = { name: "Teal", hex: "#2A7F7F" };

// The starter set and "Colour 1" to "Colour n" more, through the routes.
async function postColours(h: Harness, headers: Headers, n: number) {
	await send(h, headers, "GET", "/api/colours");
	for (let i = 1; i <= n; i++)
		await postColour(h, headers, { name: `Colour ${i}`, hex: "#2A7F7F" });
}

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const STARTER = [
	"White #F4F2ED",
	"Black #1B1B1F",
	"Navy #1F3A5F",
	"Charcoal #3A3F47",
	"Grey #8C8A84",
	"Beige #D9CBB0",
	"Khaki #B8A57C",
	"Olive #6A6B3C",
	"Light blue #BFD3EA",
	"Brown #7A5638",
	"Cream #EDE4CF",
	"Burgundy #6E1F2F",
	"Mustard #C9962B",
];

describe("GET /api/colours", () => {
	test("lists the starter set on an account's first list", async () => {
		// Given: alice signed in, no colour rows
		const { h, headers } = await withAccount();
		// When
		const res = await send(h, headers, "GET", "/api/colours");
		const { colours } = (await res.json()) as { colours: Colour[] };
		// Then
		expect({
			status: res.status,
			colours: colours.map((c) => `${c.name} ${c.hex}`),
			uuids: colours.every((c) => UUID.test(c.id)),
		}).toEqual({ status: 200, colours: STARTER, uuids: true });
	});

	test("writes the starter set once when asked twice", async () => {
		// Given: alice signed in, no colour rows
		const { h, headers } = await withAccount();
		// When
		await send(h, headers, "GET", "/api/colours");
		await send(h, headers, "GET", "/api/colours");
		// Then
		expect((await coloursOf(h, headers)).length).toEqual(13);
	});

	test("writes the starter set once when two lists come at once", async () => {
		// Given: alice saved, no colour rows
		const { h } = await withAccount();
		// When: two requests through h.app.request do not overlap, so the store
		// is called twice at once
		const results = await Promise.allSettled([
			listColours(h.db, "alice-id"),
			listColours(h.db, "alice-id"),
		]);
		// Then
		expect({
			results: results.map((r) => r.status),
			rows: (await h.rows(schema.colour, "alice-id")).length,
		}).toEqual({ results: ["fulfilled", "fulfilled"], rows: 13 });
	});

	test("answers 401 when signed out", async () => {
		// Given: no session
		const h = await makeHarness();
		// When
		const res = await send(h, new Headers(), "GET", "/api/colours");
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 401,
			body: { error: "unauthorized" },
		});
	});
});

describe("POST /api/colours", () => {
	test("refuses a body that is not JSON", async () => {
		// Given: alice signed in
		const { h, headers } = await withAccount();
		// When: send always stringifies a body, so the raw text goes through the app
		const res = await h.app.request(
			"/api/colours",
			{
				method: "POST",
				headers: new Headers({
					...Object.fromEntries(headers),
					"content-type": "application/json",
				}),
				body: "not json",
			},
			h.env,
		);
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "body" },
		});
	});

	test("lists an added colour after the starter set", async () => {
		// Given: alice signed in, the list read once
		const { h, headers } = await withAccount();
		// When
		const res = await postColour(h, headers, TEAL);
		const { colour } = (await res.json()) as { colour: Colour };
		const names = (await coloursOf(h, headers)).map((c) => c.name);
		// Then
		expect({
			status: res.status,
			colour: { name: colour.name, hex: colour.hex },
			count: names.length,
			last: names.at(-1),
		}).toEqual({ status: 201, colour: TEAL, count: 14, last: "Teal" });
	});

	test("refuses a name the account has, in any case", async () => {
		// Given: alice signed in, the list read once
		const { h, headers } = await withAccount();
		// When
		const res = await postColour(h, headers, { name: "navy", hex: "#2A7F7F" });
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			count: (await coloursOf(h, headers)).length,
		}).toEqual({
			status: 409,
			body: { error: "duplicate", field: "name" },
			count: 13,
		});
	});

	test("refuses an empty name", async () => {
		// Given: alice signed in, the list read once
		const { h, headers } = await withAccount();
		// When
		const res = await postColour(h, headers, { name: "   ", hex: "#2A7F7F" });
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "name" },
		});
	});

	test("refuses a name of 25 characters", async () => {
		// Given: alice signed in, the list read once
		const { h, headers } = await withAccount();
		// When
		const res = await postColour(h, headers, {
			name: "A".repeat(25),
			hex: "#2A7F7F",
		});
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "name" },
		});
	});

	test("refuses a code in small letters", async () => {
		// Given: alice signed in, the list read once
		const { h, headers } = await withAccount();
		// When
		const res = await postColour(h, headers, { name: "Teal", hex: "#2a7f7f" });
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "hex" },
		});
	});

	test("adds colour number 100", async () => {
		// Given: alice with 99 colours
		const { h, headers } = await withAccount();
		await postColours(h, headers, 86);
		// When
		const res = await postColour(h, headers, TEAL);
		// Then
		expect({
			status: res.status,
			count: (await coloursOf(h, headers)).length,
		}).toEqual({ status: 201, count: 100 });
	});

	test("refuses colour number 101", async () => {
		// Given: alice with 100 colours
		const { h, headers } = await withAccount();
		await postColours(h, headers, 87);
		// When
		const res = await postColour(h, headers, TEAL);
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			count: (await coloursOf(h, headers)).length,
		}).toEqual({ status: 409, body: { error: "colour_limit" }, count: 100 });
	});
});

describe("two writes at the same time", () => {
	test("answers duplicate when another tab adds the name first", async () => {
		// Given: alice signed in, the list read once; another tab stores "teal"
		// between this add's check and its write
		const { h, headers } = await withAccount();
		otherTabWrites(h, "colour", "INSERT", "Teal");
		// When
		const res = await postColour(h, headers, TEAL);
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 409,
			body: { error: "duplicate", field: "name" },
		});
	});

	test("adds one of two colours sent at once at 99", async () => {
		// Given: alice with 99 colours
		const { h, headers } = await withAccount();
		await postColours(h, headers, 86);
		// When
		const results = await Promise.all([
			addColour(h.db, "alice-id", TEAL),
			addColour(h.db, "alice-id", { name: "Sea", hex: "#2A6F7F" }),
		]);
		// Then
		expect({
			oks: results.map((r) => r.ok).sort(),
			refused: results.flatMap((r) => (r.ok ? [] : [r.error])),
			count: (await coloursOf(h, headers)).length,
		}).toEqual({
			oks: [false, true],
			refused: [{ code: "colour_limit" }],
			count: 100,
		});
	});
});

// alice with the starter set and "Teal" added; the id is Teal's.
async function aliceWithTeal() {
	const { h, headers } = await withAccount();
	const res = await postColour(h, headers, TEAL);
	const { colour } = (await res.json()) as { colour: Colour };
	return { h, headers, id: colour.id };
}

const putColour = (
	h: Harness,
	headers: Headers,
	id: string,
	body: { name: string; hex: string },
) => send(h, headers, "PUT", `/api/colours/${id}`, { id, ...body });

describe("PUT /api/colours/:id", () => {
	test("changes a colour's name and code", async () => {
		// Given: alice with "Teal" #2A7F7F
		const { h, headers, id } = await aliceWithTeal();
		// When
		const res = await putColour(h, headers, id, {
			name: "Sea",
			hex: "#2A6F7F",
		});
		const last = (await coloursOf(h, headers)).at(-1);
		// Then
		expect({ status: res.status, body: await res.json(), last }).toEqual({
			status: 200,
			body: { colour: { id, name: "Sea", hex: "#2A6F7F" } },
			last: { id, name: "Sea", hex: "#2A6F7F", inUse: false },
		});
	});

	test("changes the case of a colour's own name", async () => {
		// Given: alice with "Teal" #2A7F7F
		const { h, headers, id } = await aliceWithTeal();
		// When
		const res = await putColour(h, headers, id, {
			name: "TEAL",
			hex: "#2A7F7F",
		});
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 200,
			body: { colour: { id, name: "TEAL", hex: "#2A7F7F" } },
		});
	});

	test("refuses to change a colour to a name another colour has", async () => {
		// Given: alice with "Teal" #2A7F7F
		const { h, headers, id } = await aliceWithTeal();
		// When
		const res = await putColour(h, headers, id, {
			name: "navy",
			hex: "#2A7F7F",
		});
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 409,
			body: { error: "duplicate", field: "name" },
		});
	});

	test("refuses to change another account's colour", async () => {
		// Given: alice with "Teal"; bob signed in
		const { h, headers, id } = await aliceWithTeal();
		const bob = await h.addAccount(BOB);
		// When
		const res = await putColour(h, bob, id, { name: "Sea", hex: "#2A6F7F" });
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			alice: (await coloursOf(h, headers)).at(-1),
		}).toEqual({
			status: 404,
			body: { error: "not_found" },
			alice: { id, name: "Teal", hex: "#2A7F7F", inUse: false },
		});
	});

	test("answers duplicate when another tab takes the new name first", async () => {
		// Given: alice with "Teal"; another tab stores "sea" between this
		// change's check and its write
		const { h, headers, id } = await aliceWithTeal();
		otherTabWrites(h, "colour", "UPDATE", "Sea");
		// When
		const res = await putColour(h, headers, id, {
			name: "Sea",
			hex: "#2A6F7F",
		});
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 409,
			body: { error: "duplicate", field: "name" },
		});
	});
});

// alice with a combination of Navy casual pants and a White long tee.
async function aliceWithCombination() {
	const { h, headers, ids } = await alice();
	await send(h, headers, "POST", "/api/combinations", {
		id: "11111111-1111-4111-8111-111111111111",
		pieces: [
			{ typeId: "casual_p", colourId: ids.Navy },
			{ typeId: "tee_l", colourId: ids.White },
		],
	});
	return { h, headers, ids };
}

describe("colours in use", () => {
	test("marks the colours a combination uses", async () => {
		// Given: alice saved Navy casual pants and a White long tee
		const { h, headers } = await aliceWithCombination();
		// When
		const listed = (await (
			await send(h, headers, "GET", "/api/colours")
		).json()) as { colours: Colour[] };
		// Then
		expect({
			inUse: listed.colours.filter((c) => c.inUse).map((c) => c.name),
			free: listed.colours.filter((c) => c.inUse === false).length,
		}).toEqual({ inUse: ["White", "Navy"], free: 11 });
	});

	test("refuses to delete a colour a combination uses", async () => {
		// Given: alice saved Navy casual pants and a White long tee
		const { h, headers, ids } = await aliceWithCombination();
		// When
		const res = await send(h, headers, "DELETE", `/api/colours/${ids.Navy}`);
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			names: (await coloursOf(h, headers)).map((c) => `${c.name} ${c.hex}`),
		}).toEqual({
			status: 409,
			body: { error: "colour_in_use" },
			names: STARTER,
		});
	});
});

describe("colours in the closet", () => {
	test("refuses to delete a colour an owned item uses", async () => {
		// Given: alice with a Navy long button-up, no brand, in her closet; no
		// combination
		const { h, headers, ids } = await alice();
		await send(h, headers, "POST", "/api/owned-items", {
			id: "11111111-1111-4111-8111-111111111111",
			typeId: "shirt_l",
			colourId: ids.Navy,
			brandId: null,
			quantity: 1,
		});
		// When
		const res = await send(h, headers, "DELETE", `/api/colours/${ids.Navy}`);
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			names: (await coloursOf(h, headers)).map((c) => `${c.name} ${c.hex}`),
		}).toEqual({
			status: 409,
			body: { error: "colour_in_use" },
			names: STARTER,
		});
	});
});

describe("DELETE /api/colours/:id", () => {
	test("deletes a colour", async () => {
		// Given: alice with "Teal"
		const { h, headers, id } = await aliceWithTeal();
		// When
		const res = await send(h, headers, "DELETE", `/api/colours/${id}`);
		// Then
		expect({
			status: res.status,
			names: (await coloursOf(h, headers)).map((c) => `${c.name} ${c.hex}`),
		}).toEqual({ status: 204, names: STARTER });
	});

	test("refuses to delete another account's colour", async () => {
		// Given: alice with "Teal"; bob signed in
		const { h, headers, id } = await aliceWithTeal();
		const bob = await h.addAccount(BOB);
		// When
		const res = await send(h, bob, "DELETE", `/api/colours/${id}`);
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			count: (await coloursOf(h, headers)).length,
		}).toEqual({ status: 404, body: { error: "not_found" }, count: 14 });
	});

	test("keeps an emptied list empty", async () => {
		// Given: alice signed in, each of the 13 starter colours deleted
		const { h, headers } = await withAccount();
		for (const c of await coloursOf(h, headers))
			await send(h, headers, "DELETE", `/api/colours/${c.id}`);
		// When
		const res = await send(h, headers, "GET", "/api/colours");
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 200,
			body: { colours: [] },
		});
	});
});

describe("colours on the wishlist", () => {
	// Alice with a wish for a Navy wool jacket, and no owned item or
	// combination in Navy.
	async function aliceWithWish() {
		const { h, headers, ids } = await alice();
		await send(h, headers, "POST", "/api/wishes", {
			id: "11111111-1111-4111-8111-111111111111",
			typeId: "wool",
			colourId: ids.Navy,
		});
		return { h, headers, ids };
	}

	test("refuses to delete a colour a wish uses", async () => {
		// Given
		const { h, headers, ids } = await aliceWithWish();
		// When
		const res = await send(h, headers, "DELETE", `/api/colours/${ids.Navy}`);
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 409,
			body: { error: "colour_in_use" },
		});
	});

	test("marks the colours a wish uses", async () => {
		// Given
		const { h, headers } = await aliceWithWish();
		// When
		const listed = (await (
			await send(h, headers, "GET", "/api/colours")
		).json()) as { colours: Colour[] };
		// Then
		const inUse = Object.fromEntries(
			listed.colours.map((c) => [c.name, c.inUse]),
		);
		expect({ Navy: inUse.Navy, White: inUse.White }).toEqual({
			Navy: true,
			White: false,
		});
	});
});
