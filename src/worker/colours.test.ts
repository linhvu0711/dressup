import { describe, expect, test } from "bun:test";
import { addColour, listColours } from "./colour-store";
import { schema } from "./db";
import { type Harness, makeHarness, withAccount } from "./test/harness";

type Colour = { id: string; name: string; hex: string };

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

// alice with the starter set and n more colours, added through the store.
async function aliceWith(n: number) {
	const { h, headers } = await withAccount();
	await send(h, headers, "GET", "/api/colours");
	for (let i = 1; i <= n; i++)
		await addColour(h.db, "alice-id", { name: `Colour ${i}`, hex: "#2A7F7F" });
	return { h, headers };
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
		expect((await h.rows(schema.colour, "alice-id")).length).toEqual(13);
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
	test("lists an added colour after the starter set", async () => {
		// Given: alice signed in, the list read once
		const { h, headers } = await aliceWith(0);
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
		const { h, headers } = await aliceWith(0);
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
		const { h, headers } = await aliceWith(0);
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
		const { h, headers } = await aliceWith(0);
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
		const { h, headers } = await aliceWith(0);
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
		const { h, headers } = await aliceWith(86);
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
		const { h, headers } = await aliceWith(87);
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

// Another tab's save of the same name, written by a trigger just before this
// request's own write, after its duplicate check has passed.
const otherTabWrites = (h: Harness, when: "INSERT" | "UPDATE", name: string) =>
	h.addTrigger(
		`CREATE TRIGGER other_tab BEFORE ${when} ON colour WHEN NEW.name = '${name}'
		BEGIN
			INSERT INTO colour (id, user_id, name, hex, created_at)
			VALUES ('other-tab', NEW.user_id, lower(NEW.name), NEW.hex, 0);
		END`,
	);

describe("two writes at the same time", () => {
	test("answers duplicate when another tab adds the name first", async () => {
		// Given: alice signed in, the list read once; another tab stores "teal"
		// between this add's check and its write
		const { h, headers } = await aliceWith(0);
		otherTabWrites(h, "INSERT", "Teal");
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
		const { h, headers } = await aliceWith(86);
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
