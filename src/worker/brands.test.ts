import { describe, expect, test } from "bun:test";
import { addBrand } from "./brand-store";
import { type Harness, withAccount } from "./test/harness";

type Brand = { id: string; name: string };

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

const brandsOf = async (h: Harness, headers: Headers) =>
	(
		(await (await send(h, headers, "GET", "/api/brands")).json()) as {
			brands: Brand[];
		}
	).brands;

const namesOf = async (h: Harness, headers: Headers) =>
	(await brandsOf(h, headers)).map((b) => b.name);

const postBrand = (h: Harness, headers: Headers, name: string) =>
	send(h, headers, "POST", "/api/brands", { name });

// alice with n brands, added through the store.
async function aliceWith(n: number) {
	const { h, headers } = await withAccount();
	for (let i = 1; i <= n; i++) await addBrand(h.db, "alice-id", `Brand ${i}`);
	return { h, headers };
}

describe("GET /api/brands", () => {
	test("lists no brands for a new account", async () => {
		// Given: alice signed in
		const { h, headers } = await withAccount();
		// When
		const res = await send(h, headers, "GET", "/api/brands");
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 200,
			body: { brands: [] },
		});
	});

	test("lists the brands A to Z", async () => {
		// Given: alice adds Zara, then acne, then COS
		const { h, headers } = await withAccount();
		for (const name of ["Zara", "acne", "COS"])
			expect((await postBrand(h, headers, name)).status).toBe(201);
		// When
		const names = await namesOf(h, headers);
		// Then
		expect(names).toEqual(["acne", "COS", "Zara"]);
	});

	test("answers 401 to a signed-out request", async () => {
		// Given: alice, no session headers
		const { h } = await withAccount();
		// When
		const list = await send(h, new Headers(), "GET", "/api/brands");
		const add = await postBrand(h, new Headers(), "Zara");
		// Then
		expect([
			{ status: list.status, body: await list.json() },
			{ status: add.status, body: await add.json() },
		]).toEqual([
			{ status: 401, body: { error: "unauthorized" } },
			{ status: 401, body: { error: "unauthorized" } },
		]);
	});
});

describe("POST /api/brands", () => {
	test("adds a brand", async () => {
		// Given: alice with no brands
		const { h, headers } = await withAccount();
		// When
		const res = await postBrand(h, headers, "  Uniqlo  ");
		// Then
		expect({
			status: res.status,
			name: ((await res.json()) as { brand: Brand }).brand.name,
			names: await namesOf(h, headers),
		}).toEqual({ status: 201, name: "Uniqlo", names: ["Uniqlo"] });
	});

	test("refuses a name the account has in another case", async () => {
		// Given: alice with the brand Zara
		const { h, headers } = await aliceWith(0);
		await postBrand(h, headers, "Zara");
		// When
		const res = await postBrand(h, headers, "zara");
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			names: await namesOf(h, headers),
		}).toEqual({
			status: 409,
			body: { error: "duplicate", field: "name" },
			names: ["Zara"],
		});
	});

	test("refuses an empty name", async () => {
		// Given: alice with no brands
		const { h, headers } = await withAccount();
		// When
		const res = await postBrand(h, headers, "   ");
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "name" },
		});
	});

	test("refuses a 25-character name", async () => {
		// Given: alice with no brands
		const { h, headers } = await withAccount();
		// When
		const res = await postBrand(h, headers, "B".repeat(25));
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "name" },
		});
	});

	test("adds brand number 100", async () => {
		// Given: alice with 99 brands
		const { h, headers } = await aliceWith(99);
		// When
		const res = await postBrand(h, headers, "Uniqlo");
		// Then
		expect({
			status: res.status,
			count: (await brandsOf(h, headers)).length,
		}).toEqual({ status: 201, count: 100 });
	});

	test("refuses brand number 101", async () => {
		// Given: alice with 100 brands
		const { h, headers } = await aliceWith(100);
		// When
		const res = await postBrand(h, headers, "Uniqlo");
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			count: (await brandsOf(h, headers)).length,
		}).toEqual({ status: 409, body: { error: "brand_limit" }, count: 100 });
	});
});

// Another tab's save of the same name, written by a trigger just before this
// request's own write, after its duplicate check has passed.
const otherTabWrites = (h: Harness, when: "INSERT" | "UPDATE", name: string) =>
	h.addTrigger(
		`CREATE TRIGGER other_tab BEFORE ${when} ON brand WHEN NEW.name = '${name}'
		BEGIN
			INSERT INTO brand (id, user_id, name, created_at)
			VALUES ('other-tab', NEW.user_id, lower(NEW.name), 0);
		END`,
	);

describe("two writes at the same time", () => {
	test("answers duplicate when another tab adds the name first", async () => {
		// Given: alice with no brands; another tab stores "zara" between this
		// add's check and its write
		const { h, headers } = await withAccount();
		otherTabWrites(h, "INSERT", "Zara");
		// When
		const res = await postBrand(h, headers, "Zara");
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 409,
			body: { error: "duplicate", field: "name" },
		});
	});

	test("adds one of two brands sent at once at 99", async () => {
		// Given: alice with 99 brands
		const { h, headers } = await aliceWith(99);
		// When
		const results = await Promise.all([
			addBrand(h.db, "alice-id", "Uniqlo"),
			addBrand(h.db, "alice-id", "Muji"),
		]);
		// Then
		expect({
			oks: results.map((r) => r.ok).sort(),
			refused: results.flatMap((r) => (r.ok ? [] : [r.error])),
			count: (await brandsOf(h, headers)).length,
		}).toEqual({
			oks: [false, true],
			refused: [{ code: "brand_limit" }],
			count: 100,
		});
	});
});
