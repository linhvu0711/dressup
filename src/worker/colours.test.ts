import { describe, expect, test } from "bun:test";
import { listColours } from "./colour-store";
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
